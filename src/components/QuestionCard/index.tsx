import { Fragment } from "react";
import { assetUrl } from "../../helpers.js";
import type { AnswerResult, PublicQuestion } from "../../shared/types/exam.js";
import { AlternativeList } from "../AlternativeList/index.js";
import { AnswerFeedback } from "../AnswerFeedback/index.js";
import { DrawLayer, type DrawTool } from "../DrawLayer/index.js";
import styles from "../ExamApp/ExamApp.module.css";
import { FormattedText } from "../FormattedText/index.js";

interface Props {
  question: PublicQuestion; current: number; total: number; selected: string | null; marked: boolean;
  tool: DrawTool; color: string; drawing: string | null;
  busy: boolean; feedback?: AnswerResult | undefined; onSelect: (id: string) => void; onSubmit: () => void; onNext: () => void;
  onToggleMark: () => void; onToolChange: (tool: DrawTool) => void; onColorChange: (color: string) => void; onDrawingChange: (image: string) => void;
}

const DRAW_TOOLS: { tool: DrawTool; title: string; path: string }[] = [
  { tool: "hand", title: "Mão (não desenha)", path: "M8 12V6a2 2 0 1 1 4 0v5m0-4a2 2 0 1 1 4 0v4m0-3a2 2 0 1 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3.3 15a2 2 0 1 1 3.4-2L8 15" },
  { tool: "pencil", title: "Lápis", path: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" },
  { tool: "eraser", title: "Borracha", path: "M20 20H8l-6-6 9.5-9.5a2 2 0 0 1 2.83 0l6.17 6.17a2 2 0 0 1 0 2.83L16 20" },
];

export function QuestionCard(props: Props) {
  return <main className={styles.questionCard}>
    <div className={styles.cardHeader}>
      <span className={styles.questionNumber}>Pergunta {props.current} de {props.total}</span>
      <div className={styles.row}>
        {DRAW_TOOLS.map(({ tool, title, path }, i) => (
          <Fragment key={tool}>
            <button
              type="button"
              className={styles.iconButton}
              title={title}
              aria-label={title}
              aria-pressed={props.tool === tool}
              onClick={() => props.onToolChange(tool)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
            </button>
            {i === 0
              ? <input
                  type="color"
                  className={styles.colorInput}
                  title="Cor do lápis"
                  aria-label="Cor do lápis"
                  value={props.color}
                  onChange={(e) => props.onColorChange(e.target.value)}
                />
              : null}
          </Fragment>
        ))}
        <button
          type="button"
          className={styles.iconButton}
          title={props.marked ? "Remover marcação de revisão" : "Marcar para revisão"}
          aria-label={props.marked ? "Remover marcação de revisão" : "Marcar para revisão"}
          aria-pressed={props.marked}
          disabled={props.busy}
          onClick={props.onToggleMark}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill={props.marked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4V3z" /></svg>
        </button>
      </div>
    </div>
    <div className={styles.cardBody}>
      {props.question.images?.map((url) => <img key={url} src={assetUrl(url)} alt="" className={styles.statementImage} />)}
      <h2 className={styles.statement}><FormattedText text={props.question.statement} /></h2>
      {props.question.code ? <pre className={styles.code}><code>{props.question.code}</code></pre> : null}
      <AlternativeList alternatives={props.question.alternatives} selected={props.selected} disabled={props.busy || Boolean(props.feedback)} onSelect={props.onSelect} />
      {props.feedback ? <AnswerFeedback result={props.feedback} /> : null}
      <div className={styles.actions}>
        {props.feedback
          ? <button className={styles.primary} type="button" onClick={props.onNext}>Próxima questão</button>
          : <button className={styles.primary} type="button" disabled={!props.selected || props.busy} onClick={props.onSubmit}>{props.busy ? "Enviando…" : "Responder"}</button>}
      </div>
      <DrawLayer key={props.question.id} tool={props.tool} color={props.color} image={props.drawing} onChange={props.onDrawingChange} />
    </div>
  </main>;
}
