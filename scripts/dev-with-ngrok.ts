import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

const processes: ChildProcess[] = [];
let stopping = false;

function executable(name: string): string {
  return process.platform === "win32"
    ? join(process.cwd(), "node_modules", ".bin", `${name}.cmd`)
    : join(process.cwd(), "node_modules", ".bin", name);
}

function start(command: string, args: string[], inheritOutput: boolean): ChildProcess {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: process.env,
    stdio: inheritOutput ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  processes.push(child);
  return child;
}

function terminate(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function shutdown(code = 0): void {
  if (stopping) return;
  stopping = true;
  for (const child of processes) terminate(child, "SIGTERM");
  const forceTimer = setTimeout(() => {
    for (const child of processes) terminate(child, "SIGKILL");
  }, 2_000);
  forceTimer.unref();
  process.exitCode = code;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

async function availablePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 100; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Nenhuma porta livre encontrada entre ${preferred} e ${preferred + 99}.`);
}

function ngrokUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("O ngrok não disponibilizou uma URL em 15 segundos.")), 15_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const log = JSON.parse(line) as { msg?: string; url?: string };
          if (log.msg === "started tunnel" && log.url?.startsWith("https://")) {
            clearTimeout(timeout);
            resolve(log.url);
          }
        } catch {
          // Ignora linhas não estruturadas do agente.
        }
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`ngrok foi encerrado antes de criar o túnel (código ${code ?? 1}).`));
    });
  });
}

async function waitForSkybridge(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // O servidor ainda está inicializando.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Skybridge não respondeu na porta ${port} em 15 segundos.`);
}

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());

const preferredPort = Number.parseInt(process.env.DEV_PORT ?? "3000", 10);
if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65_535) {
  throw new Error("DEV_PORT deve ser uma porta válida entre 1 e 65535.");
}
const port = await availablePort(preferredPort);
if (port !== preferredPort) console.log(`Porta ${preferredPort} ocupada; usando ${port} para o Tech Exam.`);

const skybridge = start(executable("skybridge"), ["dev", "--plain", "--port", String(port)], false);
const ngrok = start("ngrok", ["http", String(port), "--log=stdout", "--log-format=json"], false);
const tunnelUrl = ngrokUrl(ngrok);

skybridge.stdout?.pipe(process.stdout);
skybridge.stderr?.pipe(process.stderr);

let ngrokErrors = "";
ngrok.stderr?.on("data", (chunk: Buffer) => { ngrokErrors += chunk.toString(); });
ngrok.stdout?.on("data", (chunk: Buffer) => {
  const line = chunk.toString();
  if (line.includes('"lvl":"eror"') || line.includes('"lvl":"crit"')) ngrokErrors += line;
});

skybridge.once("exit", (code) => {
  if (!stopping) {
    console.error(`\nSkybridge foi encerrado com código ${code ?? 1}.`);
    shutdown(code ?? 1);
  }
});

ngrok.once("exit", (code) => {
  if (!stopping) {
    console.error(`\nngrok foi encerrado com código ${code ?? 1}.`);
    if (ngrokErrors.trim()) console.error(ngrokErrors.trim());
    shutdown(code ?? 1);
  }
});

try {
  const [url] = await Promise.all([tunnelUrl, waitForSkybridge(port)]);
  console.log("\n  🌐  Tech Exam disponível na internet");
  console.log(`  →  MCP local: http://localhost:${port}/mcp`);
  console.log(`  →  MCP público: ${url}/mcp`);
  console.log("  →  Inspetor ngrok: http://127.0.0.1:4040");
  console.log("  →  Ctrl+C encerra Skybridge e ngrok.\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (ngrokErrors.trim()) console.error(ngrokErrors.trim());
  shutdown(1);
}
