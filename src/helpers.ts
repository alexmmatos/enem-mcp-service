import { generateHelpers } from "skybridge/web";
import type { AppType } from "./server.js";

export const { useToolInfo, useCallTool } = generateHelpers<AppType>();

// question.images/alternative.image são caminhos relativos (`/assets/...`) resolvidos pelo
// próprio servidor MCP; como não são literais no código-fonte, o transform de build do
// Skybridge (que reescreve strings `"/assets/..."` para `window.skybridge.serverUrl + ...`)
// não os alcança — precisam do mesmo prefixo aplicado manualmente em runtime.
export function assetUrl(path: string): string {
  return (window.skybridge?.serverUrl ?? "") + path;
}
