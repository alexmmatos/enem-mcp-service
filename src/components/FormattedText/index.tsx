import type { ReactNode } from "react";

// O texto oficial do ENEM (statement, alternativas) traz uma marcação markdown/HTML bem
// específica — não um renderer genérico, só os padrões confirmados nos dados reais
// (data/enem/): **negrito**, _itálico_ (estrangeirismos, nomes científicos), [texto](url)
// (link) e <sub>/<sup> (fórmulas de química/matemática, ex.: CO<sub>2</sub>). Mesmo espírito
// de extractImages (question.service.ts), que já faz o mesmo só pra `![](url)`.
// `++#rrggbb|sublinhado++` não vem da fonte do ENEM — é inserido localmente por underline.ts
// quando o usuário seleciona um trecho e clica em "Sublinhar" (marcação salva por questão no
// cliente); a cor é opcional (`++sublinhado++` também é aceito) pra manter compatibilidade.
// Flag `d` (hasIndices) dá a posição exata de cada grupo capturado, usada por underline.ts pra
// mapear texto renderizado -> texto fonte sem depender de indexOf.
export const FORMAT_RE = /\*\*(?<bold>.+?)\*\*|(?<!\w)_(?<italic>[^\n_]+?)_(?!\w)|\[(?<linkText>[^\]]+)\]\((?<linkUrl>https?:\/\/[^\s)]+)\)|<sub>(?<sub>.+?)<\/sub>|<sup>(?<sup>.+?)<\/sup>|\+\+(?:(?<underlineColor>#[0-9a-fA-F]{6})\|)?(?<underline>.+?)\+\+/gd;

// Formatação pode aninhar (ex.: **... CO<sub>2</sub> ...**, negrito contendo subscrito) — cada
// grupo capturado passa de novo por formatParts em vez de virar texto cru.
function formatParts(text: string, key: { current: number }): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(FORMAT_RE)) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const groups = match.groups!;
    if (groups.bold !== undefined) parts.push(<strong key={key.current++}>{formatParts(groups.bold, key)}</strong>);
    else if (groups.italic !== undefined) parts.push(<em key={key.current++}>{formatParts(groups.italic, key)}</em>);
    else if (groups.linkText !== undefined) {
      parts.push(<a key={key.current++} href={groups.linkUrl} target="_blank" rel="noreferrer">{formatParts(groups.linkText, key)}</a>);
    } else if (groups.sub !== undefined) parts.push(<sub key={key.current++}>{formatParts(groups.sub, key)}</sub>);
    else if (groups.sup !== undefined) parts.push(<sup key={key.current++}>{formatParts(groups.sup, key)}</sup>);
    else if (groups.underline !== undefined) {
      const style = groups.underlineColor ? { textDecorationColor: groups.underlineColor } : undefined;
      parts.push(<u key={key.current++} style={style}>{formatParts(groups.underline, key)}</u>);
    }
    lastIndex = match.index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts;
}

export function FormattedText({ text }: { text: string }) {
  return <>{formatParts(text, { current: 0 })}</>;
}
