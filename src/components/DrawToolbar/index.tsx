import { Fragment, useRef, useState, type PointerEvent } from "react";
import type { DrawTool } from "../DrawLayer/index.js";
import styles from "../ExamApp/ExamApp.module.css";

interface Props {
  tool: DrawTool;
  color: string;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onUnderline: () => void;
  underlineColor: string;
  onUnderlineColorChange: (color: string) => void;
}

const DRAW_TOOLS: { tool: DrawTool; title: string; path: string }[] = [
  { tool: "hand", title: "Mão (não desenha)", path: "M8 12V6a2 2 0 1 1 4 0v5m0-4a2 2 0 1 1 4 0v4m0-3a2 2 0 1 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3.3 15a2 2 0 1 1 3.4-2L8 15" },
  { tool: "pencil", title: "Lápis", path: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" },
  { tool: "eraser", title: "Borracha", path: "M20 20H8l-6-6 9.5-9.5a2 2 0 0 1 2.83 0l6.17 6.17a2 2 0 0 1 0 2.83L16 20" },
];

const UNDERLINE_PATH = "M6 4v6a6 6 0 0 0 12 0V4M4 20h16";
const COLLAPSE_PATH = "M6 9l6 6 6-6";
const EXPAND_PATH = "M18 15l-6-6-6 6";

// position: fixed (base: centralizado, encostado na direita) continua acompanhando o scroll da
// página sempre; o arrasto só soma um deslocamento relativo a essa posição base (translate), não
// substitui o fixed — por isso mesmo arrastado ele nunca "solta" da viewport ao rolar a página.
export function DrawToolbar({ tool, color, onToolChange, onColorChange, onUnderline, underlineColor, onUnderlineColorChange }: Props) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  const handleWindowPointerMove = (e: globalThis.PointerEvent) => {
    if (!dragStart.current) return;
    setOffset({
      x: dragStart.current.offsetX + (e.clientX - dragStart.current.x),
      y: dragStart.current.offsetY + (e.clientY - dragStart.current.y),
    });
  };

  const handleWindowPointerUp = () => {
    dragStart.current = null;
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
  };

  const handleDragStart = (e: PointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
  };

  return <div className={styles.drawToolbar} style={{ transform: `translate(${offset.x}px, calc(-50% + ${offset.y}px))` }}>
    {!collapsed
      ? <div className={styles.dragHandle} onPointerDown={handleDragStart} title="Arrastar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" /><circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" /><circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" /></svg>
        </div>
      : null}
    {DRAW_TOOLS.map(({ tool: t, title, path }, i) => (
      <Fragment key={t}>
        {i === 0 || !collapsed
          ? <button
              type="button"
              className={styles.iconButton}
              title={title}
              aria-label={title}
              aria-pressed={tool === t}
              onClick={() => onToolChange(t)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
            </button>
          : null}
        {i === 0 && !collapsed
          ? <input
              type="color"
              className={styles.colorInput}
              title="Cor do lápis"
              aria-label="Cor do lápis"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
            />
          : null}
      </Fragment>
    ))}
    {!collapsed
      ? <input
          type="color"
          className={styles.colorInput}
          title="Cor do sublinhado"
          aria-label="Cor do sublinhado"
          value={underlineColor}
          onChange={(e) => onUnderlineColorChange(e.target.value)}
        />
      : null}
    {!collapsed
      ? <button
          type="button"
          className={styles.iconButton}
          title={tool === "hand" ? "Sublinhar o texto selecionado" : "Selecione um texto no modo mão pra sublinhar"}
          aria-label="Sublinhar"
          disabled={tool !== "hand"}
          onClick={onUnderline}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={UNDERLINE_PATH} /></svg>
        </button>
      : null}
    <button
      type="button"
      className={styles.iconButton}
      title={collapsed ? "Expandir ferramentas" : "Recolher ferramentas"}
      aria-label={collapsed ? "Expandir ferramentas" : "Recolher ferramentas"}
      aria-pressed={collapsed}
      onClick={() => setCollapsed((c) => !c)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={collapsed ? EXPAND_PATH : COLLAPSE_PATH} /></svg>
    </button>
  </div>;
}
