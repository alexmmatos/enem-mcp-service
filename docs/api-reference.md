# Referência das tools MCP

Todas as tools são registradas em [src/server.ts](../src/server.ts), validam entrada com Zod ([src/server/schemas/exam.schemas.ts](../src/server/schemas/exam.schemas.ts)) e retornam o mesmo envelope:

```ts
// sucesso
{ structuredContent: ExamToolResponse | FinishExamResponse, content: [{ type: "text", text: string }], isError: false }
// erro
{ structuredContent: { error: { code: string, message: string, details?: object } }, content: [...], isError: true }
```

`ExamToolResponse` sempre traz `exam` (`id, status, topic, level, disciplina`), `progress` (`current, total, answered, correct, percentage`) e `questions` (uma entrada por questão da prova: `questionId, index, status ("unanswered"|"correct"|"incorrect"), marked`, usada pelo grid de navegação da view); `question` traz a questão em foco (a atual, ou a que acabou de ser navegada/respondida) e `result` aparece quando essa questão já tem resposta persistida. Tipos completos em [src/shared/types/exam.ts](../src/shared/types/exam.ts).

## `create_exam`

Sorteia `numberOfQuestions` questões oficiais do ENEM da `disciplina` pedida, dentre todos os anos já semeados no MongoDB (`$sample`, sem repetir questão), grava uma cópia normalizada e abre a view `exam-app`. Ver [architecture.md](./architecture.md#origem-das-questões-enem).

| Campo | Tipo | Regras |
| --- | --- | --- |
| `disciplina` | enum | `Linguagens` \| `Ciências Humanas` \| `Ciências da Natureza` \| `Matemática` \| `todas`; padrão `todas` |
| `numberOfQuestions` | int | 1–50 |
| `userId?` | string | 1–128 chars |
| `sessionId?` | string | 1–128 chars; se omitido, o servidor gera um `randomUUID()` |

Erros: `INSUFFICIENT_QUESTIONS` (menos questões disponíveis para essa `disciplina` do que o `numberOfQuestions` pedido, com `available`/`requested` em `details`), `ENEM_API_ERROR` (nenhuma prova semeada no MongoDB, ou documento fora do formato esperado).

## `get_current_question`

Sem `questionId`: leitura idempotente da questão atualmente aberta, nunca avança a tentativa. Com `questionId`: navega livremente para qualquer questão da prova (respondida ou não — grade de navegação livre) e persiste essa posição como a nova "atual", para que reaberturas da view (`get_exam_progress`) lembrem de onde o usuário parou.

| Campo | Tipo |
| --- | --- |
| `examId` | string |
| `questionId?` | string — opcional; qualquer questão da prova |

Erros: `EXAM_NOT_FOUND`, `QUESTION_NOT_IN_EXAM`.

## `mark_question`

Marca ou desmarca uma questão da prova para revisão posterior (`marked` no grid de navegação). Não exige que a questão esteja respondida nem que seja a atual.

| Campo | Tipo |
| --- | --- |
| `examId` | string |
| `questionId` | string |
| `marked` | boolean |

Erros: `EXAM_NOT_FOUND`, `EXAM_FINISHED`, `QUESTION_NOT_IN_EXAM`.

## `submit_answer`

Valida, persiste a resposta e avança a tentativa. Transação Mongo (sessão + replica set) + lock em memória por `examId` (ver [architecture.md](./architecture.md#concorrência-e-idempotência)).

| Campo | Tipo |
| --- | --- |
| `examId` | string |
| `questionId` | string — qualquer questão ainda não respondida da prova (navegação livre; não precisa ser a atual) |
| `alternativeId` | string — deve pertencer à questão |

Comportamento:
- Repetir a mesma `(examId, questionId, alternativeId)` retorna o mesmo resultado (idempotente) sem mexer na posição "atual" da tentativa — só devolve `question`/`result` pareados com a questão reenviada.
- Repetir `(examId, questionId)` com `alternativeId` diferente falha.
- Uma resposta nova avança a posição "atual" para a próxima questão da lista (não necessariamente a que acabou de ser respondida, já que a ordem de resposta pode ser livre).
- A tentativa vira `finished` assim que **todas** as questões tiverem resposta, independente da ordem em que foram respondidas.

Erros: `EXAM_NOT_FOUND`, `EXAM_PAUSED`, `EXAM_FINISHED`, `QUESTION_NOT_IN_EXAM`, `INVALID_ALTERNATIVE`, `ANSWER_ALREADY_SUBMITTED`.

## `pause_exam`

Marca a tentativa como `paused` sem alterar índice, respostas ou pontuação. Idempotente se já estiver pausada.

| Campo | Tipo |
| --- | --- |
| `examId` | string |

Erros: `EXAM_NOT_FOUND`, `EXAM_FINISHED`.

## `resume_exam`

Volta a tentativa para `in_progress` e retorna a questão atual. Idempotente se já estiver em andamento.

| Campo | Tipo |
| --- | --- |
| `examId` | string |

Erros: `EXAM_NOT_FOUND`, `EXAM_FINISHED`.

## `get_exam_progress`

Retorna `exam` + `progress` calculados a partir do banco (sem `question`/`result` adicionais além do que `get_current_question` já traria).

| Campo | Tipo |
| --- | --- |
| `examId` | string |

Erros: `EXAM_NOT_FOUND`.

## `finish_exam`

Finaliza (idempotente — se já `finished`, não sobrescreve `finishedAt`) e retorna `report: ExamReport` além do envelope padrão.

| Campo | Tipo |
| --- | --- |
| `examId` | string |

`ExamReport`: `score`, `percentage`, `correct`, `incorrect`, `performanceByTopic[]` (`topic, correct, total, percentage`), `wrongQuestions[]` (`questionId, topic, statement, selectedAlternativeId, correctAlternativeId, explanation`), `recommendedTopics[]` (tópicos com `percentage < 70`, ordenados pela ordem de `TOPICS`).

Erros: `EXAM_NOT_FOUND`.

## Códigos de erro

| Código | Quando ocorre |
| --- | --- |
| `ENEM_API_ERROR` | ano sem dados em `enem_exams`/`enem_questions` no MongoDB, ou documento fora do formato esperado |
| `EXAM_NOT_FOUND` | `examId` não existe |
| `EXAM_PAUSED` | `submit_answer` chamado com a prova pausada |
| `EXAM_FINISHED` | `pause_exam`/`resume_exam`/`submit_answer` chamados após a prova finalizar |
| `QUESTION_NOT_IN_EXAM` | `questionId` enviado não pertence à lista de questões da prova (`get_current_question`, `submit_answer`, `mark_question`) |
| `INVALID_ALTERNATIVE` | `alternativeId` não pertence às alternativas da questão |
| `ANSWER_ALREADY_SUBMITTED` | já existe resposta para `(examId, questionId)` com outra alternativa |
| `INSUFFICIENT_QUESTIONS` | a prova do ENEM daquele ano tem menos que `numberOfQuestions` questões |
| `QUESTION_NOT_FOUND` | referência a uma questão inexistente (dado corrompido) |
| `INVALID_EXAM_DATA` | `questionIds`, `status`, `topic` ou `level` da tentativa não passam na validação de forma (dado corrompido) |
| `INVALID_QUESTION_DATA` | `topic` ou `level` da questão não passam na validação de forma (dado corrompido) |
| `INTERNAL_ERROR` | qualquer exceção não mapeada (fallback de `normalizeError`) |
