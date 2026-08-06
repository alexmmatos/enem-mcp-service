import type { ReactNode } from "react";

// O texto oficial do ENEM (statement, alternativas) traz uma marcação markdown/HTML bem
// específica — não um renderer genérico, só os padrões confirmados nos dados reais
// (data/enem/): **negrito**, _itálico_ (estrangeirismos, nomes científicos), [texto](url)
// (link) e <sub>/<sup> (fórmulas de química/matemática, ex.: CO<sub>2</sub>). Mesmo espírito
// de extractImages (question.service.ts), que já faz o mesmo só pra `![](url)`.
const FORMAT_RE = /\*\*(?<bold>.+?)\*\*|(?<!\w)_(?<italic>[^\n_]+?)_(?!\w)|\[(?<linkText>[^\]]+)\]\((?<linkUrl>https?:\/\/[^\s)]+)\)|<sub>(?<sub>.+?)<\/sub>|<sup>(?<sup>.+?)<\/sup>/g;

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
    lastIndex = match.index + match[0].length;
  }
  parts.push(text.slice(lastIndex));
  return parts;
}

export function FormattedText({ text }: { text: string }) {
  return <>{formatParts(text, { current: 0 })}</>;
}
