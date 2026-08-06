import type { ExamReport } from "../../shared/types/exam.js";
import styles from "../ExamApp/ExamApp.module.css";
import { FormattedText } from "../FormattedText/index.js";

export function ExamResult({ report, onRestart }: { report: ExamReport; onRestart: () => void }) {
  return <section className={styles.result}>
    <p className={styles.eyebrow}>Prova finalizada</p>
    <h2>Seu resultado</h2><div className={styles.score}>{report.percentage}%</div>
    <div className={styles.reportGrid}>
      <div className={styles.metric}><span className={styles.label}>Acertos</span><strong>{report.correct}</strong></div>
      <div className={styles.metric}><span className={styles.label}>Erros</span><strong>{report.incorrect}</strong></div>
      <div className={styles.metric}><span className={styles.label}>Pontuação</span><strong>{report.score}</strong></div>
    </div>
    {report.recommendedTopics.length ? <><h3>Recomendado para estudo</h3><p>{report.recommendedTopics.join(", ")}</p></> : <p>Ótimo desempenho — continue praticando para consolidar o conteúdo.</p>}
    {report.reviewQuestions.length ? <><h3>Revisão</h3><ol className={styles.wrongList}>{report.reviewQuestions.map((item) => <li key={item.questionId} className={item.correct ? styles.correct : styles.incorrect}><strong><FormattedText text={item.statement} /></strong><br /><span className={styles.muted}>{item.explanation}</span></li>)}</ol></> : null}
    <button className={styles.primary} type="button" onClick={onRestart}>Iniciar outra prova</button>
  </section>;
}
