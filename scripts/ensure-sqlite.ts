import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";

const name = process.argv[2] ?? "dev.db";
const databasePath = join(process.cwd(), "prisma", name);
mkdirSync(dirname(databasePath), { recursive: true });
if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));
