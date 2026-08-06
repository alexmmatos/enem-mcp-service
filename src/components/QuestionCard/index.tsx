import { assetUrl } from "../../helpers.js";
import type { AnswerResult, PublicQuestion } from "../../shared/types/exam.js";
import { AlternativeList } from "../AlternativeList/index.js";
import { AnswerFeedback } from "../AnswerFeedback/index.js";
import styles from "../ExamApp/ExamApp.module.css";

interface Props {
  question: PublicQuestion; current: number; total: number; selected: string | null;
  busy: boolean; feedback?: AnswerResult | undefined; onSelect: (id: string) => void; onSubmit: () => void; onNext: () => void; onExplain: () => void;
}

export function QuestionCard(props: Props) {
  return <main className={styles.questionCard}>
    <span className={styles.questionNumber}>Pergunta {props.current} de {props.total}</span>
    {props.question.images?.map((url) => <img key={url} src={assetUrl(url)} alt="" className={styles.statementImage} />)}
    <h2 className={styles.statement}>{props.question.statement}</h2>
    {props.question.code ? <pre className={styles.code}><code>{props.question.code}</code></pre> : null}
    <AlternativeList alternatives={props.question.alternatives} selected={props.selected} disabled={props.busy || Boolean(props.feedback)} onSelect={props.onSelect} />
    {props.feedback ? <AnswerFeedback result={props.feedback} /> : null}
    <div className={styles.actions}>
      <button className={styles.ghost} type="button" onClick={props.onExplain}>Explicar questão</button>
      {props.feedback
        ? <button className={styles.primary} type="button" onClick={props.onNext}>Próxima questão</button>
        : <button className={styles.primary} type="button" disabled={!props.selected || props.busy} onClick={props.onSubmit}>{props.busy ? "Enviando…" : "Responder"}</button>}
    </div>
  </main>;
}
