# Tech Exam MCP

Aplicação MCP independente para criar e realizar provas do ENEM dentro de clientes com suporte a Apps, como ChatGPT e Claude. A interface React oferece uma experiência visual, mas a fonte de verdade é o servidor: questões, ordem, respostas, pontuação e status são persistidos no MongoDB.

## Stack e arquitetura

- Skybridge 1.3, TypeScript strict, React 19 e CSS Modules.
- Zod valida todas as entradas MCP.
- MongoDB (driver oficial `mongodb`, sem ORM) — banco único, dev e produção.
- Vitest cobre domínio, concorrência, segurança e fluxo completo, contra um MongoDB real (`mongodb-memory-server`, replica set de 1 nó).
- `src/server` concentra tools, serviços, repositórios, schemas e erros.
- `src/shared` contém DTOs públicos e constantes compartilhadas.
- `src/views/exam-app.tsx` é a view Skybridge; `src/components` divide a UI por responsabilidade.

O `examId` é a chave da tentativa. `useViewState` ajuda a view a reencontrá-lo, mas todo carregamento consulta novamente `get_exam_progress` e `get_current_question`. `submit_answer` usa uma transação Mongo (sessão de client, requer replica set), trava por prova no processo e a restrição única `(examId, questionId)` para impedir avanço ou pontuação duplicados.

## Requisitos

- Node.js 24.18 ou superior
- npm 11 ou superior
- Um MongoDB (Atlas ou self-hosted, precisa ser replica set — Atlas já é por padrão, inclusive no tier grátis)
- Docker opcional

## Instalação e dados

```bash
cp .env.example .env   # preencha MONGODB_URI (e MONGODB_DB, se quiser outro nome)
npm install
npm run seed:mongo     # popula enem_questions/enem_disciplines/enem_exams a partir de data/enem/
npm run dev
```

`seed:mongo` só precisa rodar uma vez por banco (ou de novo se `data/enem/` mudar — é idempotente, usa upsert). As imagens das questões apontam pro Cloudinary por padrão; para reenviá-las a uma conta própria, rode `CLOUDINARY_URL=cloudinary://... npm run upload:cloudinary` e ajuste `CLOUDINARY_IMAGE_BASE_URL` antes do seed.

`npm run dev` escolhe uma porta livre a partir da 3000, inicia Skybridge e ngrok em conjunto e imprime a URL HTTPS pública já terminada em `/mcp`. Isso permite executar o Tech Exam mesmo quando outro MCP já está usando a porta 3000. O DevTools usa a porta local exibida e o inspetor do ngrok fica em `http://localhost:4040`. Pressione `Ctrl+C` para encerrar os dois processos. Para solicitar outra porta inicial, use `DEV_PORT=3100 npm run dev`.

O comando exige o ngrok instalado e autenticado (`ngrok config add-authtoken ...`). Para desenvolver sem endereço público, use:

```bash
npm run dev:local
```

`npm run dev:alpic` mantém o túnel nativo do Skybridge como alternativa.

Comandos de qualidade e produção:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Tools MCP

| Tool | Efeito |
| --- | --- |
| `create_exam` | Busca `numberOfQuestions` questões oficiais do ENEM do `year` informado em `api.enem.dev`, cacheia localmente, persiste a ordem oficial e abre a view. |
| `get_current_question` | Retorna a questão ainda não respondida sem avançar. |
| `submit_answer` | Valida e persiste uma resposta de forma transacional e idempotente, revela o feedback e avança uma vez. |
| `pause_exam` | Pausa sem remover progresso. |
| `resume_exam` | Retoma e devolve a questão atual. |
| `get_exam_progress` | Retorna status, posição, total, respondidas, acertos e percentual. |
| `finish_exam` | Finaliza de forma idempotente e calcula erros, explicações, desempenho e estudos recomendados. |

Todas retornam uma estrutura consistente com `exam`, `progress`, `question?` e `result?`. Antes de uma resposta, `PublicQuestion` não contém gabarito, explicação ou metadado equivalente. O gabarito aparece somente no `result` da questão já respondida ou no relatório final.

## Provas do ENEM

`create_exam` aceita `year` (ano da prova) e `numberOfQuestions` (quantas questões, a partir do início da prova). O servidor busca as questões já semeadas no MongoDB (`enem_questions`/`enem_exams` — ver "Instalação e dados"), grava uma cópia normalizada em `questions` (`_id` no formato `enem-{year}-{index}`) e monta a tentativa preservando a ordem oficial, sem embaralhar. As alternativas usam as letras originais (A–E) e podem ser texto ou imagem (algumas questões, sobretudo química/física de provas antigas, têm alternativas só com figura, hospedada no Cloudinary). Como a fonte não traz explicação pedagógica, o campo `explanation` só informa o gabarito oficial. Ano sem dados no Mongo ou formato inesperado retornam `ENEM_API_ERROR`; pedir mais questões do que a prova daquele ano tem retorna `INSUFFICIENT_QUESTIONS`.

## ChatGPT

1. Rode `npm run dev` e copie a URL exibida em `MCP público`.
2. No ChatGPT, habilite o modo de desenvolvedor para Apps/Connectors.
3. Crie um conector MCP apontando para `<URL-DO-TUNNEL>/mcp`.
4. Peça, por exemplo: “Crie uma prova do ENEM 2022 com 5 questões”.

Em uma implantação pública, use a URL HTTPS do serviço no lugar do túnel.

## Claude

Clientes Claude com transporte HTTP podem usar o mesmo endpoint MCP. No Claude Code:

```bash
claude mcp add --transport http tech-exam http://localhost:3000/mcp
```

Para um cliente remoto, substitua o endereço local pela URL HTTPS. A disponibilidade de views MCP depende da versão/capacidade do host; quando a view não for suportada, as tools ainda devolvem conteúdo estruturado e textual.

## Docker

```bash
docker build -t tech-exam-mcp .
docker run --rm -p 3000:3000 -e MONGODB_URI="mongodb+srv://..." -e MONGODB_DB="questions" tech-exam-mcp
```

Sem volume — o estado vive inteiramente no MongoDB apontado por `MONGODB_URI`, externo ao container.

## Persistência, usuários e limitações

- `ExamAttempt.userId` é opcional; nunca usa e-mail como chave. Sem identificador, o servidor cria `sessionId` aleatório.
- MongoDB é a única base suportada; precisa ser um replica set (Atlas já é, mesmo no tier grátis) porque `submit_answer` usa transação de sessão.
- A view se adapta ao tema, telas estreitas e fullscreen solicitado pelo usuário. Hosts MCP controlam altura, composer, modais e podem recusar mudanças de modo.
- O botão “Iniciar outra prova” envia uma mensagem ao assistente, que coleta os novos parâmetros de modo conversacional.
- A primeira versão não inclui autenticação OAuth.
- `create_exam` lê de `enem_questions`/`enem_exams`, já semeados no Mongo — nenhuma chamada de rede pra terceiros na hora de criar a prova.

## Estrutura principal

```text
data/enem/                  cópia própria dos JSONs de prova/questão do ENEM, fonte do seed:mongo
scripts/
  seed-mongo.ts              popula enem_questions/enem_disciplines/enem_exams a partir de data/enem/
  upload-cloudinary.ts       envia as imagens de public/ pro Cloudinary (pasta enem-files)
src/
  components/
    AlternativeList/
    AnswerFeedback/
    ExamApp/
    ExamHeader/
    ExamProgress/
    ExamResult/
    QuestionCard/
  server/
    db.ts                    MongoClient/Db singleton
    errors/
    repositories/
    schemas/
    services/
    tools/
  shared/
    constants/
    types/
  views/exam-app.tsx
  server.ts
tests/exam.service.test.ts
```

As decisões de produto e API completas estão em [SPEC.md](./SPEC.md).
