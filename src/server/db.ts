import { type Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Defina MONGODB_URI antes de iniciar o servidor.");

const globalForMongo = globalThis as unknown as { mongoClient?: MongoClient };

// Construir o client não conecta de fato — a conexão é lazy, na primeira operação. Importar este
// módulo (ex.: só pelos tipos default de ExamService/ResultService) nunca faz I/O por si só.
export const mongoClient = globalForMongo.mongoClient ?? new MongoClient(uri);
if (process.env.NODE_ENV !== "production") globalForMongo.mongoClient = mongoClient;

export const db: Db = mongoClient.db(process.env.MONGODB_DB ?? "questions");

// Mesma trava que a constraint única `(examId, questionId)` do Prisma garantia: impede duas
// respostas para a mesma questão na mesma tentativa. `createIndex` é idempotente — chamar nos
// próximos starts não recria nada. Chamado explicitamente no boot do servidor (src/server.ts),
// não aqui no import do módulo, pra este arquivo continuar seguro de importar em testes que usam
// seu próprio banco (mongodb-memory-server).
export async function ensureIndexes(target: Db = db): Promise<void> {
  await target.collection("exam_answers").createIndex({ examId: 1, questionId: 1 }, { unique: true });
}
