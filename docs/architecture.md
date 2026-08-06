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
    question.repository.ts  única porta de acesso a `Question`; desserializa alternativesJson
    enem.repository.ts      única porta de acesso à API externa `api.enem.dev`; valida a resposta com Zod
  schemas/exam.schemas.ts   validação Zod de todo input MCP
  errors/exam-error.ts      ExamError (code + message + details) e normalizeError
  db.ts                     PrismaClient singleton (cache em globalThis fora de produção)
src/shared/
  constants/exam.ts         TOPICS, LEVELS, EXAM_STATUSES (fonte única desses enums)
  types/exam.ts             DTOs públicos (PublicQuestion, ExamToolResponse, ExamReport, ...)
src/views/exam-app.tsx       view Skybridge registrada como "exam-app"
src/components/              UI dividida por responsabilidade (ver "View React" abaixo)
```

Regra de dependência: `tools` → `services` → `repositories` → Prisma. Services nunca importam de `tools`; repositório é o único lugar que sabe o formato de `alternativesJson` no banco.

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

`ExamService.createExam` (ver [api-reference.md](./api-reference.md#create_exam)) busca questões oficiais em `api.enem.dev` via `fetchEnemQuestions` (`enem.repository.ts`), mapeia cada uma para o formato de `Question` com `enemQuestionToData` (`question.service.ts`) e faz `upsert` no banco local antes de criar a tentativa. Isso cacheia a prova — chamadas repetidas para o mesmo ano/índice não duplicam linhas — e permite que todo o resto do sistema (`submit_answer`, relatório, exposição de dados) trate as questões como qualquer `Question`, sem nenhum código especial a partir daí.

Modelagem:
- `id` da questão: `enem-{year}-{index}`, onde `index` é o número oficial da questão (1–185).
- `topic`: a disciplina do ENEM (`Linguagens`, `Ciências Humanas`, `Ciências da Natureza`, `Matemática` — mapeadas em `ENEM_DISCIPLINE_TOPICS`), o que mantém `performanceByTopic` útil no relatório final.
- `level`: sempre `"enem"`. `ExamAttempt.topic` é sempre `"ENEM"`; `ExamAttempt.enemYear` guarda o ano para exibição (`ExamSummary.year`).
- Sem shuffle: a ordem persistida em `questionIdsJson` é a ordem oficial devolvida pela API, a partir do início da prova (offset 0).
- `alternatives[].id` usa as letras originais da API (`A`–`E`).
- `explanation` é sintética (`"Gabarito oficial ENEM {year}: alternativa {letra}."`) porque a API não fornece explicação pedagógica.
- O `context` da API vem com imagens em Markdown (`![](url)`), guardadas assim mesmo em `Question.statement`. `toPublicQuestion` (`question.service.ts`) extrai essas URLs na leitura (`extractImages`), devolve `statement` limpo + `images: string[]`, e `QuestionCard` renderiza `<img>` de verdade para cada uma — não um renderer de Markdown genérico, só a sintaxe de imagem. O mesmo helper limpa `wrongQuestions[].statement` no relatório final (`result.service.ts`), que não exibe as imagens, só o texto.
- Alternativas também podem ser só imagem (`text: null`, `file: <url>` na API — comum em química/física de provas antigas). `Alternative` vira `{ id, text? }` ou `{ id, image? }`; `AlternativeList` renderiza `<img>` quando `image` está presente.

Erros específicos: `INSUFFICIENT_QUESTIONS` (prova daquele ano tem menos questões do que o `limit` pedido) e `ENEM_API_ERROR` (rede, HTTP não-2xx ou resposta fora do formato esperado — validada com Zod em `enem.repository.ts`, já que é uma fronteira de confiança externa).

## Exposição de dados

`InternalQuestion` (repositório) inclui `correctAlternativeId` e `explanation`. `toPublicQuestion` (`question.service.ts`) projeta apenas `id, topic, level, statement, code?, alternatives` — o gabarito nunca chega ao cliente antes de a resposta existir. `AnswerResult` (com gabarito e explicação) só é construído depois que a resposta já foi persistida.

## Concorrência e idempotência

`submitAnswer` (`exam.service.ts`) combina duas defesas:

1. **Lock em memória por `examId`** (`withExamLock`, um `Map<string, Promise<void>>` que serializa chamadas concorrentes ao mesmo `examId` dentro do processo).
2. **Transação Prisma `Serializable`** com a constraint única `(examId, questionId)` em `ExamAnswer`.

Dentro da transação: se já existe uma resposta para `(examId, questionId)` com a mesma `alternativeId`, retorna o mesmo resultado (idempotência); com `alternativeId` diferente, falha com `ANSWER_ALREADY_SUBMITTED`. Só avança `currentQuestionIndex` e incrementa `score` depois de persistir a resposta, e marca a prova como `finished` na mesma transação quando é a última questão.

> O lock em memória cobre apenas uma instância do processo. A constraint única + isolamento `Serializable` do SQLite ainda impede duas respostas para a mesma questão mesmo sem o lock, mas SQLite não suporta múltiplas réplicas escrevendo concorrentemente no mesmo arquivo — por isso o projeto assume uma única instância do processo.

## View React

`src/views/exam-app.tsx` registra `ExamApp` (`src/components/ExamApp`) como a view Skybridge da tool `create_exam`. Composição:

- `ExamHeader` — título e botão de fullscreen (`useDisplayMode`).
- `ExamProgress` — barra/contadores a partir de `progress`.
- `QuestionCard` (+ `AlternativeList`, `AnswerFeedback`) — enunciado, alternativas selecionáveis, feedback pós-resposta.
- `ExamResult` — relatório final e botão "Iniciar outra prova".

Estado e sincronização:
- `useToolInfo<"create_exam">()` dá o resultado inicial da tool que abriu a view.
- `useViewState<{ examId }>()` persiste o `examId` para reaberturas da view, mas **nunca** é tratado como fonte de verdade — toda montagem re-consulta `get_exam_progress` e `get_current_question` via `useCallTool`.
- Cada ação de UI (responder, pausar, retomar) chama a tool correspondente; o `useEffect` associado atualiza `snapshot`/`feedback`/`message` a partir da resposta.
- Quando `snapshot.exam.status === "finished"` e ainda não há `report`, a view chama `finish_exam` automaticamente uma única vez (guard `finishing.current`).
- "Iniciar outra prova" não cria uma nova tentativa localmente: usa `useSendFollowUpMessage` para pedir ao assistente que pergunte o ano do ENEM e a quantidade de questões, e chame `create_exam` de novo.

Nenhum estado de domínio (resposta, pontuação, índice da questão) é mantido apenas no React; a única coisa local é a seleção temporária de alternativa antes do envio.
