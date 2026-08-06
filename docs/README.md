# Documentação — Tech Exam MCP

Índice da documentação técnica. Para instalação, scripts e deploy, veja o [README](../README.md) na raiz; para o contexto de produto, veja o [SPEC.md](../SPEC.md).

- [architecture.md](./architecture.md) — camadas do servidor, fluxo de dados, concorrência, view React.
- [api-reference.md](./api-reference.md) — as 7 tools MCP: entrada, saída e códigos de erro.
- [data-model.md](./data-model.md) — coleções MongoDB e cache normalizado das questões do ENEM.

## Visão geral em uma frase

Servidor MCP (Skybridge + MongoDB) que cria e conduz provas do ENEM com questões oficiais: o LLM traduz intenção em ano e quantidade, mas toda questão, resposta, pontuação e progresso vive no banco — nunca no histórico da conversa.
