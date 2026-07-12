import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  practiceChat,
  startExamAttempt,
  startStudyCall,
  submitExamAttempt,
  type ExamMode,
  type ExamQuestion,
} from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";

const searchSchema = z.object({
  mode: z.enum(["practice", "exam"]).catch("practice"),
});

const CALL_HANDOFF_KEY = "tele-exit-practice-call";

type ChatTurn = { who: "you" | "ai"; text: string };
type AttemptResult = {
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  results: {
    questionId: string;
    topic: string;
    correct: boolean;
    yourAnswer: string;
    referenceAnswer: string;
  }[];
};

function attemptStorageKey(examId: string, mode: string) {
  return `tele-exit-session:${examId}:${mode}`;
}

type SavedSession = {
  attemptId: string;
  questions: ExamQuestion[];
  index: number;
  answers: Record<string, string>;
  revealed: Record<string, boolean>;
  checked: Record<string, boolean>;
  chatByQuestion: Record<string, ChatTurn[]>;
};

function loadSavedSession(examId: string, mode: string): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(attemptStorageKey(examId, mode));
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch {
    return null;
  }
}

function saveSession(examId: string, mode: string, data: SavedSession) {
  try {
    sessionStorage.setItem(attemptStorageKey(examId, mode), JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

function clearSession(examId: string, mode: string) {
  sessionStorage.removeItem(attemptStorageKey(examId, mode));
}

export const Route = createFileRoute("/exams/$examId")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Exam session — Tele-Exit" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <StudentShell>
        <ExamSessionPage />
      </StudentShell>
    </ProtectedRoute>
  ),
});

function ExamSessionPage() {
  const { examId } = Route.useParams();
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const isPractice = mode === "practice";

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [chatByQuestion, setChatByQuestion] = useState<Record<string, ChatTurn[]>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const start = useMutation({
    mutationFn: () => startExamAttempt(examId, mode as ExamMode),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setIndex(0);
      setAnswers({});
      setRevealed({});
      setChecked({});
      setChatByQuestion({});
      setResult(null);
      setError(null);
      setBooting(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setBooting(false);
    },
  });

  useEffect(() => {
    const saved = loadSavedSession(examId, mode);
    if (saved?.attemptId && saved.questions?.length) {
      setAttemptId(saved.attemptId);
      setQuestions(saved.questions);
      setIndex(saved.index || 0);
      setAnswers(saved.answers || {});
      setRevealed(saved.revealed || {});
      setChecked(saved.checked || {});
      setChatByQuestion(saved.chatByQuestion || {});
      setBooting(false);
      return;
    }
    start.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, mode]);

  useEffect(() => {
    if (!attemptId || !questions.length || result) return;
    saveSession(examId, mode, {
      attemptId,
      questions,
      index,
      answers,
      revealed,
      checked,
      chatByQuestion,
    });
  }, [
    examId,
    mode,
    attemptId,
    questions,
    index,
    answers,
    revealed,
    checked,
    chatByQuestion,
    result,
  ]);

  const current = questions[index];
  const chatLog = current ? chatByQuestion[current.id] || [] : [];
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] || "").trim().length > 0).length,
    [questions, answers],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog.length, current?.id]);

  function goTo(i: number) {
    setIndex(i);
    setChatInput("");
  }

  async function sendChat() {
    if (!attemptId || !current || !chatInput.trim() || chatBusy) return;
    const msg = chatInput.trim();
    const qid = current.id;
    setChatInput("");
    setChatBusy(true);
    setChatByQuestion((prev) => ({
      ...prev,
      [qid]: [...(prev[qid] || []), { who: "you", text: msg }],
    }));
    try {
      const reply = await practiceChat(attemptId, qid, msg);
      setChatByQuestion((prev) => ({
        ...prev,
        [qid]: [...(prev[qid] || []), { who: "ai", text: reply }],
      }));
    } catch (err) {
      setChatByQuestion((prev) => ({
        ...prev,
        [qid]: [
          ...(prev[qid] || []),
          { who: "ai", text: err instanceof Error ? err.message : "Chat failed." },
        ],
      }));
    } finally {
      setChatBusy(false);
    }
  }

  async function onSubmit() {
    if (!attemptId) return;
    try {
      const payload = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || "",
      }));
      const res = await submitExamAttempt(attemptId, payload);
      clearSession(examId, mode);
      setResult({
        scoreCorrect: res.scoreCorrect,
        scoreTotal: res.scoreTotal,
        percent: res.percent,
        results: res.results,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    }
  }

  async function onStudyCall() {
    if (!attemptId || !current) return;
    setCallBusy(true);
    setError(null);
    try {
      const call = await startStudyCall(attemptId, current.id);
      sessionStorage.setItem(
        CALL_HANDOFF_KEY,
        JSON.stringify({
          examId,
          attemptId,
          roomName: call.roomName,
          accessToken: call.accessToken,
          url: call.url,
          question: {
            id: call.question.id,
            topic: call.question.topic,
            text: call.question.questionText,
            index: index + 1,
            total: questions.length,
            referenceAnswer: call.question.referenceAnswer,
          },
          returnTo: `/exams/${examId}?mode=practice`,
        }),
      );
      navigate({ to: "/call" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start study call");
    } finally {
      setCallBusy(false);
    }
  }

  if ((booting || start.isPending) && !questions.length) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Preparing your {isPractice ? "practice" : "exam"} session…
        </p>
      </div>
    );
  }

  if (result) {
    return <ResultsView mode={mode} result={result} questions={questions} />;
  }

  if (!current) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Link to="/exams" className="text-sm text-primary underline underline-offset-4">
          Back to exams
        </Link>
      </div>
    );
  }

  const isRevealed = !!revealed[current.id];
  const isChecked = !!checked[current.id];
  const yourAnswer = answers[current.id] || "";
  const match =
    yourAnswer.trim() && current.referenceAnswer
      ? answersRoughlyMatch(current.referenceAnswer, yourAnswer)
      : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {isPractice ? "Practice" : "Exam"} · {answeredCount}/{questions.length} answered
          </p>
          <h1 className="mt-1 truncate font-display text-2xl text-primary">{current.topic}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPractice && (
            <button
              type="button"
              disabled={callBusy}
              onClick={() => void onStudyCall()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <CallIcon />
              {callBusy ? "Starting…" : "Start study call"}
            </button>
          )}
          <Link
            to="/exams"
            className="rounded-lg border border-input px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            Exit
          </Link>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* Progress */}
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
        <div
          className="h-full rounded-full bg-[var(--amber)] transition-[width] duration-300"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          aria-hidden
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)_minmax(280px,320px)]">
        {/* Question navigator */}
        <aside className="rounded-xl border border-hairline bg-background p-3 lg:sticky lg:top-24 lg:self-start">
          <p className="px-2 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Questions
          </p>
          <ol className="max-h-[50vh] space-y-1 overflow-y-auto lg:max-h-[70vh]">
            {questions.map((q, i) => {
              const answered = !!(answers[q.id] || "").trim();
              const active = i === index;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-secondary")
                    }
                  >
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums " +
                        (active
                          ? "bg-white/15"
                          : answered
                            ? "bg-[color:var(--sage)]/25 text-primary"
                            : "bg-secondary text-muted-foreground")
                      }
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{q.topic}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Main question */}
        <section className="rounded-xl border border-hairline bg-background p-5 md:p-7">
          <p className="text-xs text-muted-foreground">
            Question {index + 1} of {questions.length}
          </p>
          <p className="mt-3 text-lg leading-relaxed text-foreground md:text-xl md:leading-relaxed">
            {current.questionText}
          </p>

          {current.choices && current.choices.length > 0 ? (
            <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Answer choices">
              {current.choices.map((choice) => {
                const selected = answers[current.id] === choice;
                const isCorrectChoice =
                  isPractice &&
                  isRevealed &&
                  current.referenceAnswer &&
                  answersRoughlyMatch(current.referenceAnswer, choice);
                return (
                  <label
                    key={choice}
                    className={
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors " +
                      (isCorrectChoice
                        ? "border-[color:var(--sage)] bg-[color:var(--sage)]/10"
                        : selected
                          ? "border-primary bg-secondary/80"
                          : "border-hairline hover:bg-secondary/50")
                    }
                  >
                    <input
                      type="radio"
                      name={`q-${current.id}`}
                      checked={selected}
                      onChange={() => {
                        setAnswers({ ...answers, [current.id]: choice });
                        setChecked((prev) => ({ ...prev, [current.id]: false }));
                      }}
                      className="mt-0.5"
                    />
                    <span className="leading-relaxed">{choice}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <textarea
              value={answers[current.id] || ""}
              onChange={(e) => {
                setAnswers({ ...answers, [current.id]: e.target.value });
                setChecked((prev) => ({ ...prev, [current.id]: false }));
              }}
              rows={5}
              placeholder="Write your answer…"
              className="mt-6 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}

          {isPractice && (
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!yourAnswer.trim()}
                onClick={() => setChecked((prev) => ({ ...prev, [current.id]: true }))}
                className="rounded-lg border border-input px-3.5 py-2 text-sm text-primary transition-colors hover:bg-secondary disabled:opacity-40"
              >
                Check my answer
              </button>
              <button
                type="button"
                onClick={() =>
                  setRevealed((prev) => ({ ...prev, [current.id]: !prev[current.id] }))
                }
                className="rounded-lg border border-input px-3.5 py-2 text-sm text-primary transition-colors hover:bg-secondary"
              >
                {isRevealed ? "Hide solution" : "Show solution"}
              </button>
            </div>
          )}

          {isPractice && isChecked && (
            <div
              className={
                "mt-4 rounded-lg px-4 py-3 text-sm " +
                (match
                  ? "bg-[color:var(--sage)]/15 text-primary"
                  : "bg-[color:var(--rust)]/10 text-primary")
              }
            >
              {match === null
                ? "Select or write an answer first."
                : match
                  ? "Looks correct — nice work."
                  : "Not quite. Reveal the solution or ask the coach for a hint."}
            </div>
          )}

          {isPractice && isRevealed && (
            <div className="mt-4 rounded-lg border border-hairline bg-secondary/40 px-4 py-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Solution</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {current.referenceAnswer || "No solution stored for this question."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                From your exam bank — use chat if you want it explained step by step.
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className="rounded-lg border border-input px-4 py-2 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            {index < questions.length - 1 ? (
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Next question
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onSubmit()}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                {isPractice ? "Finish practice" : "Submit exam"}
              </button>
            )}
          </div>
        </section>

        {/* Practice coach chat */}
        {isPractice ? (
          <aside className="flex min-h-[420px] flex-col rounded-xl border border-hairline bg-background lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)]">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className="font-display text-lg text-primary">Study coach</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Chat about this question — hints, steps, or why an option is wrong.
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
              {chatLog.length === 0 && (
                <div className="space-y-2 text-muted-foreground">
                  <p>Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Give me a hint",
                      "Explain the solution",
                      "Why is my answer wrong?",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setChatInput(prompt)}
                        className="rounded-full border border-hairline px-3 py-1 text-xs text-primary transition-colors hover:bg-secondary"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatLog.map((t, i) => (
                <div
                  key={`${current.id}-${i}`}
                  className={
                    "max-w-[95%] rounded-lg px-3 py-2 leading-relaxed " +
                    (t.who === "you"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground")
                  }
                >
                  {t.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-hairline p-3">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Ask anything about this question…"
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  disabled={chatBusy || !chatInput.trim()}
                  onClick={() => void sendChat()}
                  className="rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </aside>
        ) : (
          <aside className="rounded-xl border border-hairline bg-background p-5 text-sm text-muted-foreground lg:col-start-2">
            <h2 className="font-medium text-primary">Exam rules</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Answers stay hidden until you submit.</li>
              <li>AI chat and study call are off.</li>
              <li>Your score updates your progress.</li>
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}

function ResultsView({
  mode,
  result,
  questions,
}: {
  mode: ExamMode;
  result: AttemptResult;
  questions: ExamQuestion[];
}) {
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="text-center">
        <p className="eyebrow">{mode === "exam" ? "Exam complete" : "Practice complete"}</p>
        <h1 className="mt-2 font-display text-4xl text-primary">
          {result.scoreCorrect}/{result.scoreTotal}
        </h1>
        <p className="mt-2 text-muted-foreground">{result.percent}% correct</p>
      </header>

      {mode === "practice" && result.results.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-primary">Review</h2>
          <ul className="divide-y divide-[color:var(--hairline)] rounded-xl border border-hairline">
            {result.results.map((r) => {
              const q = byId[r.questionId];
              return (
                <li key={r.questionId} className="px-4 py-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-primary">{r.topic}</p>
                    <span
                      className={
                        "shrink-0 text-xs uppercase tracking-wider " +
                        (r.correct ? "text-[var(--sage)]" : "text-[var(--rust)]")
                      }
                    >
                      {r.correct ? "Correct" : "Missed"}
                    </span>
                  </div>
                  {q && (
                    <p className="mt-1 text-muted-foreground line-clamp-2">{q.questionText}</p>
                  )}
                  <p className="mt-2 text-foreground">
                    <span className="text-muted-foreground">Your answer: </span>
                    {r.yourAnswer || "—"}
                  </p>
                  {!r.correct && (
                    <p className="mt-1 text-foreground">
                      <span className="text-muted-foreground">Solution: </span>
                      {r.referenceAnswer}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex justify-center gap-3">
        <Link
          to="/exams"
          className="rounded-lg border border-input px-4 py-2.5 text-sm text-primary hover:bg-secondary"
        >
          Back to exams
        </Link>
        <Link
          to="/dashboard"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}

function answersRoughlyMatch(reference: string, given: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const a = norm(reference);
  const b = norm(given);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Letter-only MCQ: "c" vs "c. something"
  const letter = b.match(/^([a-d])\b/);
  if (letter && a.startsWith(letter[1])) return true;
  return false;
}

function CallIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15.5 7.5a4.5 4.5 0 0 1 0 9M12 4v16M8.5 7.5a4.5 4.5 0 0 0 0 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
