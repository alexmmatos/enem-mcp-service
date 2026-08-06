import { type Db, MongoClient } from "mongodb";

// Prisma costumava carregar .env sozinho (recurso próprio dele); sem ORM ninguém mais faz isso
// por padrão. process.loadEnvFile é nativo do Node (>=20.6) — sem depender de dotenv. Ausente em
// produção/Docker (env vars vêm da plataforma), daí o try/catch.
try {
  process.loadEnvFile();
} catch {
  // sem .env no diretório atual — normal em produção/Docker, onde as env vars já vêm setadas.
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Defina MONGODB_URI antes de iniciar o servidor.");

const globalForMongo = globalThis as unknown as { mongoClient?: MongoClient };

// Construir o client não conecta de fato — a conexão é lazy, na primeira operação. Importar este
// módulo (ex.: só pelos tipos default de ExamService/ResultService) nunca faz I/O por si só.
export const mongoClient = globalForMongo.mongoClient ?? new MongoClient(uri);
if (process.env.NODE_ENV !== "production") globalForMongo.mongoClient = mongoClient;

export const db: Db = mongoClient.db(process.env.MONGODB_DB ?? "questions");

// Impede duas respostas para a mesma questão na mesma tentativa. `createIndex` é idempotente — chamar nos
// próximos starts não recria nada. Chamado explicitamente no boot do servidor (src/server.ts),
// não aqui no import do módulo, pra este arquivo continuar seguro de importar em testes que usam
// seu próprio banco (mongodb-memory-server).
export async function ensureIndexes(target: Db = db): Promise<void> {
  await target.collection("exam_answers").createIndex({ examId: 1, questionId: 1 }, { unique: true });
}
