import { useEffect, useRef, useState } from "react";
import { useDisplayMode, useLayout, useSendFollowUpMessage, useViewState } from "skybridge/web";
import { useCallTool, useToolInfo } from "../../helpers.js";
import type { ExamReport, ExamToolResponse, FinishExamResponse, PublicQuestion, ToolErrorResponse } from "../../shared/types/exam.js";
import type { DrawTool } from "../DrawLayer/index.js";
import { ExamHeader } from "../ExamHeader/index.js";
import { ExamProgress } from "../ExamProgress/index.js";
import { ExamResult } from "../ExamResult/index.js";
import { QuestionCard } from "../QuestionCard/index.js";
import { QuestionNavigator } from "../QuestionNavigator/index.js";
import styles from "./ExamApp.module.css";

type Structured = ExamToolResponse | FinishExamResponse | ToolErrorResponse;

function isExam(value: unknown): value is ExamToolResponse {
  return typeof value === "object" && value !== null && "exam" in value && "progress" in value;
}

function errorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) return null;
  const error = (value as ToolErrorResponse).error;
  return error.message;
}

function structured(data: unknown): Structured | undefined {
  if (typeof data !== "object" || data === null || !("structuredContent" in data)) return undefined;
  return (data as { structuredContent?: Structured }).structuredContent;
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function ExamApp() {
  const { output, isPending: isInitialPending } = useToolInfo<"create_exam">();
  const [viewState, setViewState] = useViewState<{ examId: string | null }>({ examId: null });
  const [snapshot, setSnapshot] = useState<ExamToolResponse | null>(isExam(output) ? output : null);
  const [report, setReport] = useState<ExamReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ExamToolResponse["result"]>();
  const [answeredView, setAnsweredView] = useState<{ question: PublicQuestion; current: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(errorMessage(output));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tool, setTool] = useState<DrawTool>("hand");
  const [color, setColor] = useState("#5b45e0");
  const [drawingsByQuestion, setDrawingsByQuestion] = useState<Record<string, string>>({});
  const hydrated = useRef<string | null>(null);
  const finishing = useRef(false);
  const lastInitial = useRef<unknown>(undefined);
  const lastProgress = useRef<unknown>(undefined);
  const lastQuestion = useRef<unknown>(undefined);
  const lastSubmit = useRef<unknown>(undefined);
  const lastNavigate = useRef<unknown>(undefined);
  const lastMark = useRef<unknown>(undefined);
  const [displayMode, setDisplayMode] = useDisplayMode();
  const { theme } = useLayout();
  const sendFollowUp = useSendFollowUpMessage();

  const progressTool = useCallTool("get_exam_progress");
  const questionTool = useCallTool("get_current_question");
  const submitTool = useCallTool("submit_answer");
  const pauseTool = useCallTool("pause_exam");
  const resumeTool = useCallTool("resume_exam");
  const finishTool = useCallTool("finish_exam");
  const navigateTool = useCallTool("get_current_question");
  const markTool = useCallTool("mark_question");

  const examId = snapshot?.exam.id ?? viewState.examId;
  const busy = submitTool.isPending || pauseTool.isPending || resumeTool.isPending || finishTool.isPending || navigateTool.isPending || markTool.isPending;

  useEffect(() => {
    if (lastInitial.current === output) return;
    lastInitial.current = output;
    if (isExam(output)) {
      setSnapshot(output);
      setViewState({ examId: output.exam.id });
    }
  }, [output, setViewState]);

  useEffect(() => {
    if (!examId || hydrated.current === examId) return;
    hydrated.current = examId;
    progressTool.callTool({ examId });
  }, [examId, progressTool]);

  useEffect(() => {
    if (lastProgress.current === progressTool.data) return;
    lastProgress.current = progressTool.data;
    const value = structured(progressTool.data);
    if (!value) return;
    const error = errorMessage(value);
    if (error) { setMessage(error); return; }
    if (isExam(value)) {
      setSnapshot(value);
      questionTool.callTool({ examId: value.exam.id });
    }
  }, [progressTool.data, questionTool]);

  useEffect(() => {
    if (lastQuestion.current === questionTool.data) return;
    lastQuestion.current = questionTool.data;
    const value = structured(questionTool.data);
    if (isExam(value)) setSnapshot(value);
  }, [questionTool.data]);

  useEffect(() => {
    if (lastSubmit.current === submitTool.data) return;
    lastSubmit.current = submitTool.data;
    const value = structured(submitTool.data);
    if (!value) return;
    const error = errorMessage(value);
    if (error) { setMessage(error); return; }
    if (isExam(value)) { setSnapshot(value); setFeedback(value.result); setMessage(null); }
  }, [submitTool.data]);

  useEffect(() => {
    const values = [structured(pauseTool.data), structured(resumeTool.data)];
    for (const value of values) if (isExam(value)) { setSnapshot(value); setMessage(null); }
  }, [pauseTool.data, resumeTool.data]);

  useEffect(() => {
    if (lastNavigate.current === navigateTool.data) return;
    lastNavigate.current = navigateTool.data;
    const value = structured(navigateTool.data);
    if (!value) return;
    const error = errorMessage(value);
    if (error) { setMessage(error); return; }
    if (isExam(value)) { setSnapshot(value); setFeedback(value.result); setSelected(null); setAnsweredView(null); setMessage(null); }
  }, [navigateTool.data]);

  useEffect(() => {
    if (lastMark.current === markTool.data) return;
    lastMark.current = markTool.data;
    const value = structured(markTool.data);
    if (isExam(value)) setSnapshot(value);
  }, [markTool.data]);

  useEffect(() => {
    const value = structured(finishTool.data);
    if (!value) return;
    const error = errorMessage(value);
    if (error) { setMessage(error); finishing.current = false; return; }
    if (isExam(value) && "report" in value) { setSnapshot(value); setReport(value.report); }
  }, [finishTool.data]);

  useEffect(() => {
    if (snapshot?.exam.status !== "finished" || report || finishing.current) return;
    finishing.current = true;
    finishTool.callTool({ examId: snapshot.exam.id });
  }, [snapshot, report, finishTool]);

  useEffect(() => setElapsedSeconds(0), [examId]);

  useEffect(() => {
    if (snapshot?.exam.status !== "in_progress") return;
    const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [snapshot?.exam.status]);

  const submit = () => {
    if (!snapshot?.question || !selected || busy) return;
    setMessage(null);
    setAnsweredView({ question: snapshot.question, current: snapshot.progress.current, total: snapshot.progress.total });
    submitTool.callTool({ examId: snapshot.exam.id, questionId: snapshot.question.id, alternativeId: selected });
  };

  const next = () => { setFeedback(undefined); setSelected(null); setAnsweredView(null); };

  const navigate = (questionId: string) => {
    if (!snapshot || busy || snapshot.exam.status === "paused" || questionId === snapshot.question?.id) return;
    setMessage(null);
    navigateTool.callTool({ examId: snapshot.exam.id, questionId });
  };

  const toggleMark = () => {
    if (!snapshot?.question || busy) return;
    const current = snapshot.questions.find((q) => q.questionId === snapshot.question!.id);
    markTool.callTool({ examId: snapshot.exam.id, questionId: snapshot.question.id, marked: !current?.marked });
  };

  if (isInitialPending || !snapshot) return <div className={`${styles.shell} ${theme === "dark" ? styles.dark : ""}`}><div className={styles.loading}>Restaurando sua prova…</div></div>;
  if (report) return <div className={`${styles.shell} ${theme === "dark" ? styles.dark : ""}`} data-llm={`Prova finalizada com ${report.percentage}% de aproveitamento.`}><ExamResult report={report} onRestart={() => sendFollowUp("Quero iniciar outra prova do ENEM. Pergunte a disciplina (ou todas) e a quantidade de questões.")} /></div>;

  return <div className={`${styles.shell} ${theme === "dark" ? styles.dark : ""}`} data-llm={`Prova ENEM — ${snapshot.exam.disciplina}, ${snapshot.progress.answered} de ${snapshot.progress.total} respondidas.`}>
    <ExamHeader displayMode={displayMode} onSetDisplayMode={setDisplayMode} />
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <div className={styles.layout}>
      <div className={styles.leftColumn}>
        <aside className={styles.panel}>
          <div><div className={styles.label}>Prova</div><p className={styles.value}>ENEM — {snapshot.exam.disciplina}</p></div>
          <div><div className={styles.label}>Disciplina</div><p className={styles.value}>{snapshot.question?.topic ?? "—"}</p></div>
          <div><div className={styles.label}>Pontuação</div><p className={styles.value}>{snapshot.progress.correct} acerto(s)</p></div>
          <div><div className={styles.label}>Status</div><span className={styles.status}>{snapshot.exam.status === "paused" ? "Pausada" : "Em andamento"}</span></div>
          <div><div className={styles.label}>Tempo</div><p className={styles.value}>{formatElapsed(elapsedSeconds)}</p></div>
          <ExamProgress progress={snapshot.progress} />
          <div className={styles.actions}>
            {snapshot.exam.status === "paused"
              ? <button className={styles.secondary} type="button" disabled={busy} onClick={() => resumeTool.callTool({ examId: snapshot.exam.id })}>Retomar</button>
              : <button className={styles.ghost} type="button" disabled={busy} onClick={() => pauseTool.callTool({ examId: snapshot.exam.id })}>Pausar</button>}
          </div>
        </aside>
        <QuestionNavigator
          questions={snapshot.questions}
          currentQuestionId={snapshot.question?.id}
          disabled={busy || snapshot.exam.status === "paused"}
          onNavigate={navigate}
        />
      </div>
      {(() => {
        const view = feedback && answeredView ? answeredView : { question: snapshot.question, current: snapshot.progress.current, total: snapshot.progress.total };
        const marked = view.question ? (snapshot.questions.find((q) => q.questionId === view.question!.id)?.marked ?? false) : false;
        const drawing = view.question ? (drawingsByQuestion[view.question.id] ?? null) : null;
        return view.question
          ? <QuestionCard
              question={view.question} current={view.current} total={view.total} selected={selected} marked={marked}
              tool={tool} color={color} drawing={drawing} busy={busy || snapshot.exam.status === "paused"} feedback={feedback}
              onSelect={setSelected} onSubmit={submit} onNext={next} onToggleMark={toggleMark}
              onToolChange={setTool} onColorChange={setColor} onDrawingChange={(image) => setDrawingsByQuestion((prev) => ({ ...prev, [view.question!.id]: image }))}
            />
          : <main className={styles.questionCard}><p>Calculando o resultado…</p></main>;
      })()}
    </div>
  </div>;
}
