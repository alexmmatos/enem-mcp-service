import { useEffect, useState } from "react";
import { assetUrl } from "../../helpers.js";
import type { AnswerResult, PublicQuestion } from "../../shared/types/exam.js";
import { AlternativeList } from "../AlternativeList/index.js";
import { AnswerFeedback } from "../AnswerFeedback/index.js";
import { DrawLayer, type DrawTool } from "../DrawLayer/index.js";
import { DrawToolbar } from "../DrawToolbar/index.js";
import styles from "../ExamApp/ExamApp.module.css";
import { FormattedText } from "../FormattedText/index.js";

interface Props {
  question: PublicQuestion; current: number; total: number; selected: string | null; marked: boolean;
  tool: DrawTool; color: string; drawing: string | null;
  busy: boolean; feedback?: AnswerResult | undefined; onSelect: (id: string) => void; onSubmit: () => void; onNext: () => void;
  onToggleMark: () => void; onToolChange: (tool: DrawTool) => void; onColorChange: (color: string) => void; onDrawingChange: (image: string) => void;
  onUnderline: () => void; underlineColor: string; onUnderlineColorChange: (color: string) => void;
}

export function QuestionCard(props: Props) {
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomedImage) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomedImage(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomedImage]);

  return <main className={styles.questionCard}>
    <div className={styles.cardHeader}>
      <span className={styles.questionNumber}>Pergunta {props.current} de {props.total}</span>
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
    <div className={styles.cardBody}>
      {props.question.images?.map((url) => (
        <img key={url} src={assetUrl(url)} alt="" className={styles.statementImage} onClick={() => setZoomedImage(assetUrl(url))} />
      ))}
      <h2 className={styles.statement}>
        <span className={styles.yearTag}>(ENEM — {props.question.year})</span>
        <span data-field="statement"><FormattedText text={props.question.statement} /></span>
      </h2>
      {props.question.code ? <pre className={styles.code}><code>{props.question.code}</code></pre> : null}
      <AlternativeList alternatives={props.question.alternatives} selected={props.selected} disabled={props.busy || Boolean(props.feedback)} onSelect={props.onSelect} onZoomImage={setZoomedImage} />
      {props.feedback ? <AnswerFeedback result={props.feedback} /> : null}
      <div className={styles.actions}>
        {props.feedback
          ? <button className={styles.primary} type="button" onClick={props.onNext}>Próxima questão</button>
          : <button className={styles.primary} type="button" disabled={!props.selected || props.busy} onClick={props.onSubmit}>{props.busy ? "Enviando…" : "Responder"}</button>}
      </div>
      <DrawLayer key={props.question.id} tool={props.tool} color={props.color} image={props.drawing} onChange={props.onDrawingChange} />
      <DrawToolbar
        tool={props.tool} color={props.color} onToolChange={props.onToolChange} onColorChange={props.onColorChange}
        onUnderline={props.onUnderline} underlineColor={props.underlineColor} onUnderlineColorChange={props.onUnderlineColorChange}
      />
    </div>
    {zoomedImage
      ? <div className={styles.lightbox} onClick={() => setZoomedImage(null)} role="button" tabIndex={-1} aria-label="Fechar imagem ampliada">
          <img src={zoomedImage} alt="" className={styles.lightboxImage} />
        </div>
      : null}
  </main>;
}
