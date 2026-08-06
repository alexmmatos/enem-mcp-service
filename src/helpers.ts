import { generateHelpers } from "skybridge/web";
import type { AppType } from "./server.js";

export const { useToolInfo, useCallTool } = generateHelpers<AppType>();

// question.images/alternative.image hoje vêm como URL absoluta do Cloudinary — usadas como
// estão. Se algum dia voltarem a ser caminho relativo (`/assets/...`) do próprio servidor MCP,
// precisam do prefixo de window.skybridge.serverUrl (o transform de build do Skybridge só
// alcança literais no código-fonte, não strings vindas de dados de tool em runtime).
export function assetUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : (window.skybridge?.serverUrl ?? "") + path;
}
