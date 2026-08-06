# Modelo de dados

Schema em [prisma/schema.prisma](../prisma/schema.prisma) — SQLite, único banco suportado (dev e produção).

## `Question`

Cache local das questões do ENEM já buscadas em `api.enem.dev`. `create_exam` grava (upsert) as linhas necessárias antes de criar a tentativa; ver [architecture.md](./architecture.md#origem-das-questões-enem).

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | String (PK) | formato `enem-{year}-{index}`, ex.: `enem-2022-1` |
| `topic` | String | a disciplina do ENEM — um de `TOPICS` (`Linguagens`, `Ciências Humanas`, `Ciências da Natureza`, `Matemática`) |
| `level` | String | sempre `"enem"` — único valor em `LEVELS` |
| `statement` | String | `context` (com markdown de imagem intacto, `![](url)`) + `alternativesIntroduction` da API — a extração das imagens acontece na leitura (`toPublicQuestion`), não na gravação |
| `code?` | String | nunca preenchido para questões do ENEM |
| `alternativesJson` | String | JSON de `Alternative[]` (`{ id, text? }` ou `{ id, image? }`), `id` é a letra original (`A`–`E`); algumas alternativas (raras) são só imagem, sem `text`; desserializado só no repositório |
| `correctAlternativeId` | String | nunca sai para o cliente antes da resposta |
| `explanation` | String | sintética — `"Gabarito oficial ENEM {year}: alternativa {letra}."`, já que a API não fornece explicação pedagógica |

Índice em `(topic, level)`.

## `ExamAttempt`

Uma linha por tentativa de prova.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | String (PK, cuid) | é o `examId` usado por todas as tools |
| `userId?` | String | opcional; **nunca** é e-mail — ver [SPEC.md](../SPEC.md) |
| `sessionId` | String | gerado com `randomUUID()` se não informado |
| `status` | String | `in_progress` \| `paused` \| `finished` |
| `topic` | String | sempre `"ENEM"` |
| `level` | String | sempre `"enem"` |
| `enemYear` | Int | ano da prova, exposto como `ExamSummary.year` |
| `questionIdsJson` | String | JSON da ordem oficial de `Question.id[]`, sem embaralhar |
| `currentQuestionIndex` | Int | posição atual em `questionIdsJson`; só avança em `submit_answer` |
| `score` | Int | contagem de acertos |
| `startedAt`, `updatedAt`, `finishedAt?` | DateTime | |

Índices em `userId`, `sessionId` e `status`.

## `ExamAnswer`

Uma linha por resposta persistida.

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | String (PK, cuid) | |
| `examId` | String (FK → `ExamAttempt`, `onDelete: Cascade`) | |
| `questionId` | String (FK → `Question`) | |
| `selectedAlternativeId` | String | |
| `correct` | Boolean | calculado no momento da escrita |
| `answeredAt` | DateTime | |

`@@unique([examId, questionId])` é a trava que impede duas respostas para a mesma questão na mesma tentativa — é ela que faz `submit_answer` ser idempotente/seguro sob concorrência (ver [architecture.md](./architecture.md#concorrência-e-idempotência)).
