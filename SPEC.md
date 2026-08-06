# Tech Exam MCP

## Value Proposition

Aplicação MCP para pessoas que querem praticar com provas oficiais do ENEM sem sair da conversa com um assistente. Hoje, simulados em sites separados perdem o contexto da conversa e sessões baseadas apenas no histórico do chat podem desaparecer. O produto combina uma prova visual com uma sessão persistida no servidor.

**Ações principais:** iniciar uma prova, responder e retomar questões, finalizar e receber um diagnóstico.

## Why LLM?

- **Ganho conversacional:** o usuário pode pedir uma prova em linguagem natural e continuar conversando enquanto responde na interface.
- **Contribuição do LLM:** traduz intenção em ano e quantidade de questões; explica e recomenda estudos usando o resultado estruturado.
- **O que o LLM não possui:** banco de questões, resposta correta e estado confiável da tentativa. Esses dados vêm de `api.enem.dev` e são persistidos pelo servidor no SQLite/PostgreSQL.

## Product Context

- Projeto novo e independente do Arthur MCP.
- Skybridge 1.3.0, TypeScript, React, Node.js, Zod, Prisma e Vitest.
- SQLite em desenvolvimento; schema preparado para trocar o provider e a URL por PostgreSQL em produção.
- Sem autenticação obrigatória na primeira versão. `userId`/`sessionId` são opcionais e tentativas anônimas recebem um identificador aleatório.
- Questões vêm de `api.enem.dev` por ano da prova; o servidor cacheia localmente cada questão já buscada.
- O fluxo de desenvolvimento padrão seleciona uma porta livre, inicia Skybridge e ngrok juntos e imprime o endpoint MCP público correto; `dev:local` mantém a opção sem túnel.

## UX Flows

### Fazer uma prova

1. O usuário informa o ano da prova do ENEM e a quantidade de questões.
2. `create_exam` busca as questões oficiais daquele ano, persiste a ordem (a ordem oficial da prova, sem embaralhar) e abre a view da tentativa.
3. A view restaura progresso e questão atual a partir do servidor.
4. O usuário seleciona uma alternativa e envia; `submit_answer` persiste uma única resposta e retorna feedback.
5. O usuário segue até a última pergunta, podendo pausar, conversar e retomar sem perder o estado.
6. `finish_exam` exibe pontuação, erros, explicações, desempenho por assunto e recomendações.

### Consultar ou controlar uma tentativa pela conversa

1. O assistente usa o `examId` para consultar questão/progresso, pausar, retomar ou finalizar.
2. Toda resposta vem do banco; nenhuma tool infere progresso pelo histórico do chat.

## UI Overview

- **Primeira view:** duas áreas em desktop: resumo da prova e cartão predominante da questão; uma coluna em telas estreitas.
- **Interações:** alternativas selecionáveis, envio protegido contra clique duplo, feedback e explicação após persistência, próxima questão, pausa/retomada e modo fullscreen solicitado pelo usuário.
- **Estado final:** resumo de desempenho, questões erradas, tópicos recomendados e ação para iniciar outra prova pela conversa.
- A seleção temporária pode viver no React; tentativa, resposta, pontuação e índice vivem somente no servidor.

## Architecture

### Boundaries

- `src/server`: registros das tools, schemas Zod, serviços, repositórios e erros estruturados.
- `src/shared`: DTOs públicos, tipos internos e constantes.
- `src/views` e `src/components`: view React e componentes visuais.
- `prisma`: schema e migrations.
- `tests`: domínio, segurança, concorrência e fluxo integrado.

### Tools and View

- **View `create_exam`:** entrada `{ year, numberOfQuestions, userId?, sessionId? }`; busca as questões em `api.enem.dev`, cria a tentativa e entrega a primeira questão pública.
- **Tool `get_current_question`:** leitura idempotente; nunca avança a tentativa.
- **Tool `submit_answer`:** mutação transacional e idempotente; valida a questão atual e revela a resposta apenas depois de registrá-la.
- **Tool `pause_exam`:** pausa uma tentativa ativa.
- **Tool `resume_exam`:** restaura a tentativa pausada e retorna a questão atual.
- **Tool `get_exam_progress`:** lê contadores calculados da tentativa.
- **Tool `finish_exam`:** finaliza e produz o relatório, inclusive quando chamado novamente.

A view usa `useToolInfo` para o resultado inicial e `useCallTool` para sincronizar ações. O `examId` persistido em `useViewState` auxilia reaberturas, mas nunca substitui o banco.

### Persistence and Concurrency

- `ExamAttempt` grava os IDs das questões em JSON e o índice atual.
- `ExamAnswer` possui chave única composta `(examId, questionId)`.
- `submit_answer` executa em transação serializável e trata conflito único como repetição idempotente.
- A implementação usa atualizações condicionais do índice/status para impedir avanço e pontuação duplicados em chamadas concorrentes.

### Data Exposure

- Entidades internas incluem resposta e explicação.
- `PublicQuestion` nunca inclui `correctAlternativeId`, explicação ou metadados equivalentes.
- O resultado de uma resposta revela apenas os dados daquela questão depois que sua resposta já existe.
- Erros retornam código, mensagem e detalhes seguros, sem stack trace ou dados internos.

## Acceptance Criteria

- Todas as sete tools funcionam com persistência real.
- `create_exam` busca questões reais em `api.enem.dev` e cacheia localmente antes de montar a tentativa.
- TypeScript strict, Zod em todas as entradas, lint, typecheck, testes e build passam.
- Testes cobrem criação, estado, respostas, pausa/retomada, finalização, idempotência, concorrência, não exposição antecipada e falha da API do ENEM.
- README, Dockerfile, `.dockerignore`, `.env.example` e instruções SQLite/PostgreSQL estão completos.
