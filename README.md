# Tech Exam MCP

Aplicação MCP independente para criar e realizar provas do ENEM (questões oficiais consultadas em `api.enem.dev`) dentro de clientes com suporte a Apps, como ChatGPT e Claude. A interface React oferece uma experiência visual, mas a fonte de verdade é o servidor: questão atual, ordem, respostas, pontuação e status são persistidos por Prisma.

## Stack e arquitetura

- Skybridge 1.3, TypeScript strict, React 19 e CSS Modules.
- Zod valida todas as entradas MCP.
- Prisma ORM com SQLite no desenvolvimento e schema/migrations PostgreSQL separados para produção.
- Vitest cobre domínio, concorrência, segurança e fluxo completo.
- `src/server` concentra tools, serviços, repositórios, schemas e erros.
- `src/shared` contém DTOs públicos e constantes compartilhadas.
- `src/views/exam-app.tsx` é a view Skybridge; `src/components` divide a UI por responsabilidade.

O `examId` é a chave da tentativa. `useViewState` ajuda a view a reencontrá-lo, mas todo carregamento consulta novamente `get_exam_progress` e `get_current_question`. `submit_answer` usa transação serializável, trava por prova no processo e a restrição única `(examId, questionId)` para impedir avanço ou pontuação duplicados.

## Requisitos

- Node.js 24.18 ou superior
- npm 11 ou superior
- Docker opcional

## Instalação e SQLite

```bash
cp .env.example .env
npm install
npm run db:prepare
npm run db:migrate -- --name init
npm run dev
```

`npm run dev` escolhe uma porta livre a partir da 3000, inicia Skybridge e ngrok em conjunto e imprime a URL HTTPS pública já terminada em `/mcp`. Isso permite executar o Tech Exam mesmo quando outro MCP já está usando a porta 3000. O DevTools usa a porta local exibida e o inspetor do ngrok fica em `http://localhost:4040`. Pressione `Ctrl+C` para encerrar os dois processos. Para solicitar outra porta inicial, use `DEV_PORT=3100 npm run dev`.

O comando exige o ngrok instalado e autenticado (`ngrok config add-authtoken ...`). Para desenvolver sem endereço público, use:

```bash
npm run dev:local
```

`npm run dev:alpic` mantém o túnel nativo do Skybridge como alternativa. `db:prepare` cria o arquivo vazio que algumas versões do engine Prisma exigem antes da primeira migration.

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

`create_exam` aceita `year` (ano da prova) e `numberOfQuestions` (o `limit` da consulta a `api.enem.dev`). O servidor busca as questões oficiais a partir do início da prova daquele ano, grava uma cópia local (`Question.id` no formato `enem-{year}-{index}`) e monta a tentativa preservando a ordem oficial, sem embaralhar. As alternativas usam as letras originais (A–E) e podem ser texto ou imagem (algumas questões, sobretudo química/física de provas antigas, têm alternativas só com figura). Imagens do enunciado e das alternativas são exibidas na view. Como a API não fornece explicação pedagógica, o campo `explanation` só informa o gabarito oficial. Falha de rede ou resposta em formato inesperado da API retornam `ENEM_API_ERROR`; pedir mais questões do que a prova daquele ano tem retorna `INSUFFICIENT_QUESTIONS`.

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

## Docker com SQLite

```bash
docker build -t tech-exam-mcp .
docker volume create tech-exam-data
docker run --rm -p 3000:3000 -v tech-exam-data:/app/prisma tech-exam-mcp
```

A imagem aplica a migration no build. O volume preserva tentativas e o cache de questões do ENEM entre reinícios. Para dados de produção e réplicas múltiplas, prefira PostgreSQL.

## PostgreSQL em produção

O schema e a migration ficam em `prisma/postgresql`. Para validar localmente:

```bash
docker compose up -d postgres
export DATABASE_URL='postgresql://tech_exam:tech_exam@localhost:5432/tech_exam?schema=public'
npx prisma generate --schema prisma/postgresql/schema.prisma
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npm run build
npm start
```

O provider Prisma é definido no schema, por isso a troca correta envolve gerar o client com `prisma/postgresql/schema.prisma`; mudar somente `DATABASE_URL` não basta. Em CI/CD, execute generate e migrate deploy antes de iniciar o servidor.

## Persistência, usuários e limitações

- `ExamAttempt.userId` é opcional; nunca usa e-mail como chave. Sem identificador, o servidor cria `sessionId` aleatório.
- SQLite é adequado a desenvolvimento e uma única instância. PostgreSQL é recomendado para concorrência entre processos/réplicas.
- A view se adapta ao tema, telas estreitas e fullscreen solicitado pelo usuário. Hosts MCP controlam altura, composer, modais e podem recusar mudanças de modo.
- O botão “Iniciar outra prova” envia uma mensagem ao assistente, que coleta os novos parâmetros de modo conversacional.
- A primeira versão não inclui cronômetro nem autenticação OAuth.
- `create_exam` depende de `api.enem.dev` estar disponível; questões já buscadas ficam cacheadas em `Question` e continuam acessíveis mesmo se a API cair depois.

## Estrutura principal

```text
prisma/
  migrations/                 # SQLite
  postgresql/                  # schema e migration de produção
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
