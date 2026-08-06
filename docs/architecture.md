# Arquitetura

## Camadas

```
src/server.ts              registra as 7 tools no McpServer (Skybridge)
src/server/
  tools/                    handlers finos: parseiam input, chamam um service, empacotam a resposta MCP
  services/
    exam.service.ts         ciclo de vida da tentativa (criar, ler, pausar, retomar, responder)
    question.service.ts     embaralhar/selecionar questões, projetar InternalQuestion -> PublicQuestion, mapear questões do ENEM
    result.service.ts       relatório final (finishExam)
  repositories/
    question.repository.ts  única porta de acesso à coleção `questions` (cache normalizado)
    enem.repository.ts      única porta de acesso a `enem_questions`/`enem_exams`; valida com Zod
  schemas/exam.schemas.ts   validação Zod de todo input MCP
  errors/exam-error.ts      ExamError (code + message + details) e normalizeError
  db.ts                     MongoClient/Db singleton (cache em globalThis fora de produção)
src/shared/
  constants/exam.ts         TOPICS, LEVELS, EXAM_STATUSES (fonte única desses enums)
  types/exam.ts             DTOs públicos (PublicQuestion, ExamToolResponse, ExamReport, ...)
src/views/exam-app.tsx       view Skybridge registrada como "exam-app"
src/components/              UI dividida por responsabilidade (ver "View React" abaixo)
```

Regra de dependência: `tools` → `services` → `repositories` → MongoDB. Services nunca importam de `tools`; repositório é o único lugar que sabe o formato dos documentos no banco.

## Fluxo de uma tool

Todo handler em `src/server/tools/*.ts` segue o mesmo formato — instancia o service e delega para `runTool` (`src/server/tools/tool-response.ts`):

```ts
export async function submitAnswer(input: {...}) {
  return runTool(() => new ExamService().submitAnswer(input), "Resposta registrada e progresso atualizado.");
}
```

`runTool` roda a operação, e:
- sucesso → `{ structuredContent, content: [texto curto], isError: false }`
- exceção → normaliza para `ExamError` e retorna `{ structuredContent: { error }, isError: true }`

Isso mantém os handlers triviais e centraliza formatação de resposta/erro em um único lugar (ver [api-reference.md](./api-reference.md) para o contrato completo).

## Origem das questões: ENEM

Nada disso depende de rede em tempo de execução. `data/enem/` é uma cópia própria dos JSONs de prova/questão do ENEM (mesmo formato do antigo `api.enem.dev`); `scripts/seed-mongo.ts` lê essa pasta e grava em três coleções — `enem_questions` (uma por questão, variantes de idioma incluídas), `enem_disciplines` e `enem_exams` (`_id: year`, com `languages` pra resolver o idioma padrão das questões 1–5). Rodar de novo é seguro (upsert por `_id`).

`ExamService.createExam` (ver [api-reference.md](./api-reference.md#create_exam)) traduz a `disciplina` recebida (label em português, ou `"todas"`) pro value bruto do ENEM via `disciplineValueFromLabel` (`shared/constants/exam.ts`) e busca as questões via `fetchEnemQuestionsByDiscipline` (`enem.repository.ts`) — um `$sample` no Mongo filtrado por esse value (ou sem filtro, se `"todas"`) que sorteia `numberOfQuestions` questões dentre **todos** os anos disponíveis, sem repetir. Cada uma é mapeada pro formato de `questions` com `enemQuestionToData` (`question.service.ts`) e gravada (upsert) nessa coleção antes de criar a tentativa. Isso normaliza a prova — chamadas repetidas para o mesmo ano/índice não duplicam documentos — e permite que todo o resto do sistema (`submit_answer`, relatório, exposição de dados) trate as questões da mesma forma, sem nenhum código especial a partir daí.

Modelagem:
- `_id` da questão: `enem-{year}-{index}`, onde `index` é o número oficial da questão (1–185) e `year` é o ano de onde ela foi sorteada — cada questão de uma mesma prova pode vir de um ano diferente.
- `topic`: a disciplina do ENEM (`Linguagens`, `Ciências Humanas`, `Ciências da Natureza`, `Matemática` — mapeadas em `ENEM_DISCIPLINE_TOPICS`), o que mantém `performanceByTopic` útil no relatório final.
- `level`: sempre `"enem"`. `ExamAttempt.topic` é sempre `"ENEM"`; `ExamAttempt.disciplina` guarda a label escolhida (ou `"todas"`) tal como recebida, pra exibição direta (`ExamSummary.disciplina`) sem precisar traduzir de volta.
- Sorteio, não ordem oficial: `questionIds` é o resultado do `$sample` — cada `create_exam` dá um conjunto diferente, mesmo pedindo a mesma disciplina/quantidade.
- `alternatives[].id` usa as letras originais (`A`–`E`).
- `explanation` é sintética (`"Gabarito oficial ENEM {year}: alternativa {letra}."`) porque a fonte não traz explicação pedagógica.
- O `context` de origem vem com imagens em Markdown (`![](url)`), guardadas assim mesmo em `Question.statement` — mas a URL já é a do Cloudinary (`scripts/seed-mongo.ts` reescreve de `https://enem.dev/...` pra `enem-files/...` antes de gravar, já que as imagens foram todas enviadas por `scripts/upload-cloudinary.ts`). `toPublicQuestion` (`question.service.ts`) extrai essas URLs na leitura (`extractImages`), devolve `statement` limpo + `images: string[]`, e `QuestionCard` renderiza `<img>` de verdade para cada uma — não um renderer de Markdown genérico, só a sintaxe de imagem. O mesmo helper limpa `wrongQuestions[].statement` no relatório final (`result.service.ts`), que não exibe as imagens, só o texto.
- Alternativas também podem ser só imagem (`text: null`, `file: <url>` na fonte — comum em química/física de provas antigas). `Alternative` vira `{ id, text? }` ou `{ id, image? }`; `AlternativeList` renderiza `<img>` quando `image` está presente.

Erros específicos: `INSUFFICIENT_QUESTIONS` (prova daquele ano tem menos questões do que o pedido) e `ENEM_API_ERROR` (ano sem dados em `enem_exams`/`enem_questions`, ou documento fora do formato esperado — validado com Zod em `enem.repository.ts`).

## Exposição de dados

`InternalQuestion` (repositório) inclui `correctAlternativeId` e `explanation`. `toPublicQuestion` (`question.service.ts`) projeta apenas `id, topic, level, statement, code?, alternatives` — o gabarito nunca chega ao cliente antes de a resposta existir. `AnswerResult` (com gabarito e explicação) só é construído depois que a resposta já foi persistida.

## Concorrência e idempotência

`submitAnswer` (`exam.service.ts`) combina duas defesas:

1. **Lock em memória por `examId`** (`withExamLock`, um `Map<string, Promise<void>>` que serializa chamadas concorrentes ao mesmo `examId` dentro do processo).
2. **Transação Mongo** (`client.startSession()` + `session.withTransaction()`, requer replica set) com a constraint única `{ examId: 1, questionId: 1 }` em `exam_answers` (`db.ts`, `ensureIndexes`).

Dentro da transação: se já existe uma resposta para `(examId, questionId)` com a mesma `alternativeId`, retorna o mesmo resultado (idempotência) **sem** mexer em `currentQuestionIndex` — só reusa a resposta já persistida pra montar `question`/`result` da questão reenviada; com `alternativeId` diferente, falha com `ANSWER_ALREADY_SUBMITTED`. Numa resposta nova, incrementa `score`, avança `currentQuestionIndex` pra próxima posição da lista (não necessariamente a questão que acabou de ser respondida — navegação livre permite responder fora de ordem) e marca a prova como `finished` na mesma transação quando **todas** as questões já têm resposta, seja qual for a ordem.

> O lock em memória cobre apenas uma instância do processo. Entre processos/réplicas, a exclusão real de corrida vem do índice único + da transação Mongo — que exige um replica set (Atlas já é um por padrão, mesmo no tier grátis; um standalone `mongod` não serve).

## View React

`src/views/exam-app.tsx` registra `ExamApp` (`src/components/ExamApp`) como a view Skybridge da tool `create_exam`. Composição:

- `ExamHeader` — título e botões de modo de exibição (`useDisplayMode`).
- `ExamProgress` — barra/contadores a partir de `progress`.
- `QuestionNavigator` — grid com uma célula numerada por questão (`snapshot.questions`), colorida por `status` (verde = correta, vermelha = incorreta, neutra = sem resposta) e `marked` (azul, tem prioridade sobre a cor de status); clicar chama `get_current_question` com o `questionId` da célula (navegação livre — qualquer questão, respondida ou não).
- `QuestionCard` (+ `AlternativeList`, `AnswerFeedback`) — enunciado, alternativas selecionáveis, feedback pós-resposta, botão de marcar/desmarcar para revisão (`mark_question`).
- `ExamResult` — relatório final e botão "Iniciar outra prova".

Estado e sincronização:
- `useToolInfo<"create_exam">()` dá o resultado inicial da tool que abriu a view.
- `useViewState<{ examId }>()` persiste o `examId` para reaberturas da view, mas **nunca** é tratado como fonte de verdade — toda montagem re-consulta `get_exam_progress` e `get_current_question` via `useCallTool`.
- Cada ação de UI (responder, navegar, marcar, pausar, retomar) chama a tool correspondente; o `useEffect` associado atualiza `snapshot`/`feedback`/`message` a partir da resposta. Navegar limpa a seleção/feedback locais e deixa a resposta da tool (que já traz `result` se a questão alvo estiver respondida) repovoar tudo.
- Quando `snapshot.exam.status === "finished"` e ainda não há `report`, a view chama `finish_exam` automaticamente uma única vez (guard `finishing.current`).
- "Iniciar outra prova" não cria uma nova tentativa localmente: usa `useSendFollowUpMessage` para pedir ao assistente que pergunte a disciplina (ou todas) e a quantidade de questões, e chame `create_exam` de novo.

Nenhum estado de domínio (resposta, pontuação, índice da questão) é mantido apenas no React; a única coisa local é a seleção temporária de alternativa antes do envio.
