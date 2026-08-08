import { FORMAT_RE } from "./index.js";

const GROUP_NAMES = ["bold", "italic", "linkText", "sub", "sup", "underline"] as const;

interface UnderlineMatch {
  matchStart: number; matchEnd: number; // span inteiro, incluindo `++`, cor e delimitadores
  textStart: number; textEnd: number; // só o texto sublinhado, sem cor nem `++`
  plainStart: number; plainEnd: number;
}

// Espelha o parsing recursivo do FormattedText, mas construindo o texto PLANO (sem marcadores)
// junto com um mapa `sourceIndex[i] = posição no texto fonte do i-ésimo caractere plano` — é
// contra esse texto plano que o usuário efetivamente seleciona na tela. De brinde, coleta onde
// cada `++...++` já existente cai nesse texto plano, pra dar pra desfazer clicando de novo.
function buildPlainTextMap(text: string, offset: number, plain: string[], sourceIndex: number[], underlines: UnderlineMatch[]): void {
  let lastIndex = 0;
  for (const match of text.matchAll(FORMAT_RE)) {
    if (match.index > lastIndex) {
      for (let i = lastIndex; i < match.index; i++) { plain.push(text[i]!); sourceIndex.push(offset + i); }
    }
    const groups = match.groups!;
    const indices = match.indices!.groups!;
    for (const name of GROUP_NAMES) {
      const inner = groups[name];
      const range = indices[name];
      if (inner !== undefined && range) {
        const plainStart = plain.length;
        buildPlainTextMap(inner, offset + range[0], plain, sourceIndex, underlines);
        if (name === "underline") {
          underlines.push({
            matchStart: offset + match.index,
            matchEnd: offset + match.index + match[0].length,
            textStart: offset + range[0],
            textEnd: offset + range[1],
            plainStart,
            plainEnd: plain.length,
          });
        }
        break;
      }
    }
    lastIndex = match.index + match[0].length;
  }
  for (let i = lastIndex; i < text.length; i++) { plain.push(text[i]!); sourceIndex.push(offset + i); }
}

export function toPlainTextMap(source: string): { plain: string; sourceIndex: number[]; underlines: UnderlineMatch[] } {
  const plain: string[] = [];
  const sourceIndex: number[] = [];
  const underlines: UnderlineMatch[] = [];
  buildPlainTextMap(source, 0, plain, sourceIndex, underlines);
  return { plain: plain.join(""), sourceIndex, underlines };
}

// ponytail: só remove sublinhados que a nova seleção toca (mesmo parcialmente); não faz merge
// fino de intervalos parcialmente sobrepostos que sobram sem tocar a seleção.
function addUnderline(source: string, sourceIndex: number[], start: number, end: number, color: string): string {
  // Uma seleção pode atravessar a borda de uma marcação existente (ex.: "CO<sub>2</sub>" — "CO"
  // fora do <sub>, "2" dentro). Sublinhar como um único bloco quebraria a tag; em vez disso,
  // parte em blocos contíguos NA FONTE e sublinha cada um separadamente — visualmente ainda fica
  // uma linha contínua, já que trechos sublinhados adjacentes não têm espaço entre si.
  const runs: [number, number][] = [];
  let runStart = sourceIndex[start]!;
  let prev = runStart;
  for (let i = start + 1; i < end; i++) {
    const pos = sourceIndex[i]!;
    if (pos !== prev + 1) {
      runs.push([runStart, prev + 1]);
      runStart = pos;
    }
    prev = pos;
  }
  runs.push([runStart, prev + 1]);

  let result = source;
  for (let i = runs.length - 1; i >= 0; i--) {
    const [runSourceStart, runSourceEnd] = runs[i]!;
    result = `${result.slice(0, runSourceStart)}++${color}|${result.slice(runSourceStart, runSourceEnd)}++${result.slice(runSourceEnd)}`;
  }
  return result;
}

// Mesmo gesto (selecionar + clicar) desfaz: se a seleção tocar algum `++...++` já existente,
// remove os delimitadores (e a cor) desses trechos em vez de sublinhar de novo por cima.
export function toggleUnderline(source: string, plainStart: number, plainEnd: number, color: string): string {
  const { plain, sourceIndex, underlines } = toPlainTextMap(source);
  const start = Math.max(0, Math.min(plainStart, plain.length));
  const end = Math.max(0, Math.min(plainEnd, plain.length));
  if (start >= end) return source;

  const touched = underlines.filter((u) => u.plainStart < end && u.plainEnd > start);
  if (touched.length > 0) {
    let result = source;
    for (const u of [...touched].sort((a, b) => b.matchStart - a.matchStart)) {
      const text = result.slice(u.textStart, u.textEnd);
      result = `${result.slice(0, u.matchStart)}${text}${result.slice(u.matchEnd)}`;
    }
    return result;
  }

  return addUnderline(source, sourceIndex, start, end, color);
}

// Técnica padrão de Range -> offset plano: anda pelos nós de texto de `container` em ordem do
// DOM até achar `node`, somando o tamanho dos anteriores.
export function plainTextOffset(container: Node, node: Node, nodeOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current === node) return offset + nodeOffset;
    offset += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }
  return offset;
}
