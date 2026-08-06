import type { ExamProgress as Progress } from "../../shared/types/exam.js";
import styles from "../ExamApp/ExamApp.module.css";

export function ExamProgress({ progress }: { progress: Progress }) {
  const completed = progress.total ? Math.round((progress.answered / progress.total) * 100) : 0;
  return <div className={styles.progressArea}>
    <div className={styles.row}><span className={styles.label}>Progresso</span><span className={styles.muted}>{progress.answered}/{progress.total}</span></div>
    <div className={styles.progressTrack} role="progressbar" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.progressFill} style={{ width: `${completed}%` }} />
    </div>
    <p className={styles.muted}>{completed}% concluído</p>
  </div>;
}
