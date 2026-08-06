# Referência das tools MCP

Todas as tools são registradas em [src/server.ts](../src/server.ts), validam entrada com Zod ([src/server/schemas/exam.schemas.ts](../src/server/schemas/exam.schemas.ts)) e retornam o mesmo envelope:

```ts
// sucesso
{ structuredContent: ExamToolResponse | FinishExamResponse, content: [{ type: "text", text: string }], isError: false }
// erro
{ structuredContent: { error: { code: string, message: string, details?: object } }, content: [...], isError: true }
```

`ExamToolResponse` sempre traz `exam` (`id, status, topic, level`) e `progress` (`current, total, answered, correct, percentage`); `question` aparece enquanto houver uma pergunta pendente; `result` aparece só depois que a resposta daquela questão já foi persistida. Tipos completos em [src/shared/types/exam.ts](../src/shared/types/exam.ts).

## `create_exam`

Busca `numberOfQuestions` questões oficiais do ENEM do ano `year` (a partir do início da prova, offset 0) já semeadas no MongoDB, grava uma cópia normalizada e persiste a ordem oficial abrindo a view `exam-app`. Ver [architecture.md](./architecture.md#origem-das-questões-enem).

| Campo | Tipo | Regras |
| --- | --- | --- |
| `year` | int | 1998–ano atual |
| `numberOfQuestions` | int | 1–50; é o `limit` da consulta ao ENEM |
| `userId?` | string | 1–128 chars |
| `sessionId?` | string | 1–128 chars; se omitido, o servidor gera um `randomUUID()` |

Erros: `INSUFFICIENT_QUESTIONS` (a prova daquele ano tem menos questões do que o `numberOfQuestions` pedido, com `available`/`requested` em `details`), `ENEM_API_ERROR` (ano sem dados no MongoDB ou documento fora do formato esperado, com `year` em `details`).

## `get_current_question`

Leitura idempotente da questão ainda não respondida. Nunca avança o índice.

| Campo | Tipo |
| --- | --- |
| `examId` | string |

Erros: `EXAM_NOT_FOUND`.

## `submit_answer`

Valida, persiste a resposta e avança a tentativa. Transação Mongo (sessão + replica set) + lock em memória por `examId` (ver [architecture.md](./architecture.md#concorrência-e-idempotência)).

| Campo | Tipo |
| --- | --- |
| `examId` | string |
| `questionId` | string — deve ser a questão atual |
| `alternativeId` | string — deve pertencer à questão |

Comportamento:
- Repetir a mesma `(examId, questionId, alternativeId)` retorna o mesmo resultado (idempotente).
- Repetir `(examId, questionId)` com `alternativeId` diferente falha.
- Se é a última questão, a tentativa vira `finished` na mesma transação.

Erros: `EXAM_NOT_FOUND`, `EXAM_PAUSED`, `EXAM_FINISHED`, `NOT_CURRENT_QUESTION` (`details.currentQuestionId`), `INVALID_ALTERNATIVE`, `ANSWER_ALREADY_SUBMITTED`.

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
| `NOT_CURRENT_QUESTION` | `questionId` enviado não é o índice atual da tentativa |
| `INVALID_ALTERNATIVE` | `alternativeId` não pertence às alternativas da questão |
| `ANSWER_ALREADY_SUBMITTED` | já existe resposta para `(examId, questionId)` com outra alternativa |
| `INSUFFICIENT_QUESTIONS` | a prova do ENEM daquele ano tem menos que `numberOfQuestions` questões |
| `QUESTION_NOT_FOUND` | referência a uma questão inexistente (dado corrompido) |
| `INVALID_EXAM_DATA` | `questionIds`, `status`, `topic` ou `level` da tentativa não passam na validação de forma (dado corrompido) |
| `INVALID_QUESTION_DATA` | `topic` ou `level` da questão não passam na validação de forma (dado corrompido) |
| `INTERNAL_ERROR` | qualquer exceção não mapeada (fallback de `normalizeError`) |
