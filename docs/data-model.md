# Modelo de dados

MongoDB, sem ORM. Tipos dos documentos em [question.repository.ts](../src/server/repositories/question.repository.ts) e [exam.service.ts](../src/server/services/exam.service.ts) (`QuestionDoc`, `ExamAttemptDoc`, `ExamAnswerDoc`); dados de origem do ENEM em [enem.repository.ts](../src/server/repositories/enem.repository.ts).

## `enem_questions`, `enem_disciplines`, `enem_exams`

Dados de referência do ENEM, semeados por [scripts/seed-mongo.ts](../scripts/seed-mongo.ts) a partir de `data/enem/` — não tocados pelo app em escrita, só lidos por `enem.repository.ts` na hora de montar uma prova. `enem_questions._id` é `enem-{year}-{index}[-{language}]` (variantes de idioma pra questões 1–5); `enem_exams._id` é o ano (`number`), com `languages` usado pra resolver a variante padrão.

## `questions`

Cache normalizado das questões do ENEM já usadas em alguma prova. `create_exam` grava (upsert) as linhas necessárias a partir de `enem_questions` antes de criar a tentativa; ver [architecture.md](./architecture.md#origem-das-questões-enem).

| Campo | Tipo | Observação |
| --- | --- | --- |
| `_id` | string | formato `enem-{year}-{index}`, ex.: `enem-2022-1` |
| `topic` | string | a disciplina do ENEM — um de `TOPICS` (`Linguagens`, `Ciências Humanas`, `Ciências da Natureza`, `Matemática`) |
| `level` | string | sempre `"enem"` — único valor em `LEVELS` |
| `statement` | string | `context` (com markdown de imagem intacto, `![](url)`) + `alternativesIntroduction` da fonte — a extração das imagens acontece na leitura (`toPublicQuestion`), não na gravação |
| `code` | string \| null | nunca preenchido para questões do ENEM |
| `alternatives` | `Alternative[]` | array real (não serializado) de `{ id, text? }` ou `{ id, image? }`; `id` é a letra original (`A`–`E`); algumas alternativas (raras) são só imagem, sem `text` |
| `correctAlternativeId` | string | nunca sai para o cliente antes da resposta |
| `explanation` | string | sintética — `"Gabarito oficial ENEM {year}: alternativa {letra}."`, já que a fonte não traz explicação pedagógica |

## `exam_attempts`

Um documento por tentativa de prova.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `_id` | string (`randomUUID()`) | é o `examId` usado por todas as tools |
| `userId?` | string | opcional; **nunca** é e-mail — ver [SPEC.md](../SPEC.md) |
| `sessionId` | string | gerado com `randomUUID()` se não informado |
| `status` | string | `in_progress` \| `paused` \| `finished` |
| `topic` | string | sempre `"ENEM"` |
| `level` | string | sempre `"enem"` |
| `disciplina` | string | label escolhida (`Linguagens`, `Ciências Humanas`, `Ciências da Natureza`, `Matemática`) ou `"todas"`; exposta como `ExamSummary.disciplina` |
| `questionIds` | `string[]` | array real de `questions._id`, sorteadas aleatoriamente (`$sample`) dentre todos os anos que batem com a disciplina |
| `currentQuestionIndex` | number | posição "atual" em `questionIds` — a questão que a view mostra por padrão; navegação livre (`get_current_question` com `questionId`, ou uma resposta nova em `submit_answer`) é o que move esse índice; reenviar a mesma resposta de uma questão já respondida não move |
| `markedQuestionIds` | `string[]` | questões marcadas para revisão (`mark_question`); exposto por questão como `QuestionStatus.marked` |
| `score` | number | contagem de acertos |
| `startedAt`, `updatedAt`, `finishedAt?` | Date | |

## `exam_answers`

Um documento por resposta persistida.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `examId` | string | |
| `questionId` | string | |
| `selectedAlternativeId` | string | |
| `correct` | boolean | calculado no momento da escrita |
| `answeredAt` | Date | |

Índice único `{ examId: 1, questionId: 1 }` (criado por `ensureIndexes` em [db.ts](../src/server/db.ts)) — é a trava que impede duas respostas para a mesma questão na mesma tentativa, e que faz `submit_answer` ser idempotente/seguro sob concorrência (ver [architecture.md](./architecture.md#concorrência-e-idempotência)).
