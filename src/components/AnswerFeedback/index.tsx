import type { AnswerResult } from "../../shared/types/exam.js";
import styles from "../ExamApp/ExamApp.module.css";

export function AnswerFeedback({ result }: { result: AnswerResult }) {
  return <section className={`${styles.feedback} ${result.correct ? styles.correct : styles.incorrect}`} aria-live="polite">
    <p className={styles.feedbackTitle}>{result.correct ? "Resposta correta" : `Resposta incorreta — alternativa correta: ${result.correctAlternativeId.toUpperCase()}`}</p>
    <p className={styles.feedbackText}>{result.explanation}</p>
  </section>;
}
