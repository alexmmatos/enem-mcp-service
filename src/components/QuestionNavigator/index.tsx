import type { QuestionStatus } from "../../shared/types/exam.js";
import styles from "../ExamApp/ExamApp.module.css";

interface Props {
  questions: QuestionStatus[];
  currentQuestionId: string | undefined;
  disabled: boolean;
  onNavigate: (questionId: string) => void;
}

const STATUS_CLASS: Record<QuestionStatus["status"], string | undefined> = {
  unanswered: "",
  correct: styles.navCorrect,
  incorrect: styles.navIncorrect,
};

export function QuestionNavigator({ questions, currentQuestionId, disabled, onNavigate }: Props) {
  return <div className={styles.panel}>
    <div className={styles.label}>Questões</div>
    <div className={styles.navGrid}>
      {questions.map((q) => (
        <button
          key={q.questionId}
          type="button"
          className={[styles.navCell, q.marked ? styles.navMarked : STATUS_CLASS[q.status], q.questionId === currentQuestionId ? styles.navCurrent : ""].join(" ")}
          title={`Questão ${q.index}${q.marked ? " — marcada para revisão" : ""}`}
          aria-current={q.questionId === currentQuestionId}
          disabled={disabled}
          onClick={() => onNavigate(q.questionId)}
        >
          {q.index}
        </button>
      ))}
    </div>
  </div>;
}
