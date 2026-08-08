import type { DisplayMode, RequestDisplayMode } from "skybridge/web";
import styles from "../ExamApp/ExamApp.module.css";

const MODES: { mode: RequestDisplayMode; title: string; path: string }[] = [
  { mode: "inline", title: "Inline", path: "M4 5h16v14H4z" },
  { mode: "pip", title: "Picture-in-picture", path: "M4 5h16v14H4zM13 12h6v5h-6z" },
  { mode: "fullscreen", title: "Tela cheia", path: "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" },
];

const FOCUS_PATH = "M12 3v3M12 18v3M3 12h3M18 12h3";

interface Props {
  displayMode: DisplayMode; onSetDisplayMode: (mode: RequestDisplayMode) => void;
  focusMode: boolean; onToggleFocusMode: () => void;
}

export function ExamHeader({ displayMode, onSetDisplayMode, focusMode, onToggleFocusMode }: Props) {
  return <header className={styles.topbar}>
    <div><p className={styles.eyebrow}>ENEM APP</p><h1 className={styles.title}>Simulado ENEM</h1></div>
    <div className={styles.row}>
      <button
        type="button"
        className={styles.iconButton}
        title="Modo foco (oculta o painel lateral) — atalho: F"
        aria-label="Modo foco"
        aria-pressed={focusMode}
        onClick={onToggleFocusMode}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d={FOCUS_PATH} /></svg>
      </button>
      {MODES.map(({ mode, title, path }) => (
        <button
          key={mode}
          className={styles.iconButton}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={displayMode === mode}
          onClick={() => onSetDisplayMode(mode)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
        </button>
      ))}
    </div>
  </header>;
}
