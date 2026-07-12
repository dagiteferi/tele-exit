import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  getExam,
  getMyProfile,
  practiceChat,
  saveAttemptProgress,
  startExamAttempt,
  startStudyCall,
  submitExamAttempt,
  wrapUpSession,
  type ExamMode,
  type ExamQuestion,
} from "@/lib/api";
import { buildCallOpening, speakNow, warmVoices } from "@/lib/speech";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StudentShell } from "@/components/StudentShell";

const searchSchema = z.object({
  mode: z.enum(["practice", "exam"]).catch("practice"),
});

const CALL_HANDOFF_KEY = "tele-exit-practice-call";
const SPEECH_STARTED_KEY = "tele-exit-call-speech-started";

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
  return `tele-exit-session:v4:${examId}:${mode}`;
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

function sessionLooksValid(saved: SavedSession): boolean {
  if (!saved.attemptId || !saved.questions?.length) return false;
  // Reject stale sessions that lost MCQ choices (would force a textarea).
  const sample = saved.questions.slice(0, 8);
  const shouldHaveChoices = sample.some((q) =>
    /which of the following|choose|select|correct/i.test(q.questionText || ""),
  );
  if (shouldHaveChoices && sample.every((q) => !q.choices?.length)) return false;
  return true;
}

export const Route = createFileRoute("/exams_/$examId")({
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
  const [examTitle, setExamTitle] = useState("this exam");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [chatByQuestion, setChatByQuestion] = useState<Record<string, ChatTurn[]>>({});
  const [chatOpen, setChatOpen] = useState<Record<string, boolean>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [questionsVisited, setQuestionsVisited] = useState(1);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const streamGenRef = useRef(0);

  const start = useMutation({
    mutationFn: () => startExamAttempt(examId, mode as ExamMode),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setIndex(0);
      setAnswers({});
      setRevealed({});
      setChatByQuestion({});
      setChatOpen({});
      setResult(null);
      setError(null);
      setQuestionsVisited(1);
      setBooting(false);
      void getExam(examId, mode as ExamMode)
        .then((detail) => setExamTitle(detail.exam.title || "this exam"))
        .catch(() => undefined);
      if (mode === "practice" && data.questions[0]?.id) {
        void saveAttemptProgress(data.attemptId, 0, data.questions[0].id).catch(() => undefined);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
      setBooting(false);
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let openProgress:
        | {
            attemptId: string;
            progressIndex: number;
            questionsVisited: number;
            examTitle: string;
          }
        | null = null;
      if (mode === "practice") {
        try {
          const profile = await getMyProfile();
          const hit = profile.practiceProgress.find((p) => p.examId === examId);
          if (hit) {
            openProgress = {
              attemptId: hit.attemptId,
              progressIndex: hit.progressIndex,
              questionsVisited: hit.questionsVisited,
              examTitle: hit.examTitle,
            };
          }
        } catch {
          // offline / auth — fall through to local session
        }
      }

      const saved = loadSavedSession(examId, mode);
      if (saved && sessionLooksValid(saved)) {
        let questionsToUse = saved.questions;
        // Refresh bank answers/explanations so Show answer isn't stuck on stale cache.
        if (mode === "practice") {
          try {
            const detail = await getExam(examId, "practice");
            const byId = Object.fromEntries(detail.questions.map((q) => [q.id, q]));
            questionsToUse = saved.questions.map((q) => {
              const fresh = byId[q.id];
              if (!fresh) return q;
              return {
                ...q,
                questionText: fresh.questionText,
                choices: fresh.choices,
                referenceAnswer: fresh.referenceAnswer ?? q.referenceAnswer,
                explanation: fresh.explanation ?? q.explanation,
              };
            });
            if (detail.exam.title) setExamTitle(detail.exam.title);
          } catch {
            // keep saved questions if refresh fails
          }
        }
        if (cancelled) return;
        let resumeIndex = Math.min(saved.index || 0, questionsToUse.length - 1);
        let visited = 1;
        if (
          openProgress &&
          openProgress.attemptId === saved.attemptId &&
          questionsToUse.length > 0
        ) {
          resumeIndex = Math.min(
            Math.max(resumeIndex, openProgress.progressIndex),
            questionsToUse.length - 1,
          );
          visited = Math.max(1, openProgress.questionsVisited);
        }
        setAttemptId(saved.attemptId);
        setQuestions(questionsToUse);
        setIndex(resumeIndex);
        setAnswers(saved.answers || {});
        setRevealed(saved.revealed || {});
        setChatByQuestion(saved.chatByQuestion || {});
        setQuestionsVisited(visited);
        setBooting(false);
        return;
      }

      // No local session — resume open practice attempt from profile.
      if (mode === "practice" && openProgress) {
        try {
          const detail = await getExam(examId, "practice");
          if (cancelled) return;
          const qs = detail.questions;
          if (qs.length) {
            setAttemptId(openProgress.attemptId);
            setQuestions(qs);
            setIndex(Math.min(openProgress.progressIndex, qs.length - 1));
            setAnswers({});
            setRevealed({});
            setChatByQuestion({});
            setQuestionsVisited(Math.max(1, openProgress.questionsVisited));
            setExamTitle(detail.exam.title || openProgress.examTitle || "this exam");
            setBooting(false);
            return;
          }
        } catch {
          // fall through to new attempt
        }
      }

      clearSession(examId, mode);
      if (!cancelled) start.mutate();
    }

    void boot();
    return () => {
      cancelled = true;
    };
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
      checked: revealed,
      chatByQuestion,
    });
  }, [examId, mode, attemptId, questions, index, answers, revealed, chatByQuestion, result]);

  // Persist stop point + visited count for profile / resume.
  useEffect(() => {
    if (!attemptId || !questions.length || result || mode !== "practice") return;
    const q = questions[index];
    const timer = window.setTimeout(() => {
      void saveAttemptProgress(attemptId, index, q?.id)
        .then((res) => setQuestionsVisited(res.questionsVisited))
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [attemptId, index, questions, result, mode]);
  const current = questions[index];
  const choices = useMemo(() => normalizeChoices(current), [current]);
  const chatLog = current ? chatByQuestion[current.id] || [] : [];
  const isChatOpen = current ? !!chatOpen[current.id] : false;
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] || "").trim().length > 0).length,
    [questions, answers],
  );

  useEffect(() => {
    warmVoices();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog.length, chatBusy, chatStreaming, current?.id, chatLog[chatLog.length - 1]?.text]);

  function goTo(i: number) {
    streamGenRef.current += 1;
    setChatBusy(false);
    setChatStreaming(false);
    setIndex(i);
    setChatInput("");
  }

  function selectAnswer(value: string) {
    if (!current) return;
    const qid = current.id;
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    // Do not auto-reveal the bank answer — student opens it with Show answer.
  }

  async function streamAiText(qid: string, full: string) {
    const gen = ++streamGenRef.current;
    setChatStreaming(true);
    setChatByQuestion((prev) => ({
      ...prev,
      [qid]: [...(prev[qid] || []), { who: "ai", text: "" }],
    }));

    try {
      // Reveal in small chunks so Markdown/math still reads smoothly.
      const step = Math.max(2, Math.ceil(full.length / 80));
      for (let i = step; i < full.length; i += step) {
        if (streamGenRef.current !== gen) return;
        const slice = full.slice(0, i);
        setChatByQuestion((prev) => {
          const log = [...(prev[qid] || [])];
          const last = log[log.length - 1];
          if (last?.who === "ai") log[log.length - 1] = { who: "ai", text: slice };
          return { ...prev, [qid]: log };
        });
        await new Promise((r) => setTimeout(r, 18));
      }
      if (streamGenRef.current !== gen) return;
      setChatByQuestion((prev) => {
        const log = [...(prev[qid] || [])];
        const last = log[log.length - 1];
        if (last?.who === "ai") log[log.length - 1] = { who: "ai", text: full };
        return { ...prev, [qid]: log };
      });
    } finally {
      if (streamGenRef.current === gen) setChatStreaming(false);
    }
  }

  async function sendChat(preset?: string) {
    if (!attemptId || !current || chatBusy || chatStreaming) return;
    const msg = (preset ?? chatInput).trim();
    if (!msg) return;
    const qid = current.id;
    setChatInput("");
    setChatBusy(true);
    setChatByQuestion((prev) => ({
      ...prev,
      [qid]: [...(prev[qid] || []), { who: "you", text: msg }],
    }));
    try {
      const res = await practiceChat(attemptId, qid, msg);
      setChatBusy(false);
      await streamAiText(qid, res.reply || "Let's walk through this step by step.");
    } catch (err) {
      setChatBusy(false);
      setChatByQuestion((prev) => ({
        ...prev,
        [qid]: [
          ...(prev[qid] || []),
          { who: "ai", text: err instanceof Error ? err.message : "Chat failed." },
        ],
      }));
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
      if (mode === "practice") {
        try {
          const wrap = await wrapUpSession({
            attemptId,
            examId,
            examTitle,
            questionIds: questions.map((q) => q.id),
            questionsVisited: Math.max(questionsVisited, questions.length),
            persistEvents: false,
            events: res.results.map((r) => ({
              questionId: r.questionId,
              topic: r.topic,
              studentAnswerTranscript: r.yourAnswer,
              wasCorrect: r.correct,
              agentUsed: "curriculum" as const,
            })),
          });
          sessionStorage.setItem("tele-exit-session-recap", JSON.stringify(wrap));
          navigate({ to: "/session-recap" });
          return;
        } catch {
          // keep results view even if wrap-up fails
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    }
  }

  async function onStudyCall() {
    if (!attemptId || !current) return;

    // Speak first — must stay in the same turn as the button click or browsers mute it.
    const titleGuess =
      examTitle && examTitle !== "this exam" ? examTitle : current.topic || "this exam";
    const welcome = buildCallOpening(titleGuess, index + 1);
    const startedAt = Date.now();
    sessionStorage.setItem(SPEECH_STARTED_KEY, String(startedAt));
    speakNow(welcome);

    setCallBusy(true);
    setError(null);
    try {
      let title = titleGuess;
      if (!examTitle || examTitle === "this exam") {
        try {
          title = (await getExam(examId, "practice")).exam.title || titleGuess;
          setExamTitle(title);
        } catch {
          // keep titleGuess
        }
      }
      const call = await startStudyCall(attemptId, current.id);
      const q = call.question;
      const deck = questions.map((item, i) => ({
        id: item.id,
        topic: item.topic,
        text: item.questionText,
        choices: item.choices ?? [],
        index: i + 1,
        total: questions.length,
        referenceAnswer: item.referenceAnswer ?? null,
      }));
      // Prefer live call payload for the starting question (freshest bank fields).
      if (deck[index]) {
        deck[index] = {
          ...deck[index],
          id: q.id || deck[index].id,
          topic: q.topic || deck[index].topic,
          text: q.questionText || deck[index].text,
          choices: q.choices ?? current.choices ?? deck[index].choices,
          referenceAnswer: q.referenceAnswer ?? deck[index].referenceAnswer,
        };
      }
      // Keep the exact spoken welcome so chat + voice stay in sync.
      sessionStorage.setItem(
        CALL_HANDOFF_KEY,
        JSON.stringify({
          examId,
          examTitle: title,
          welcomeText: welcome,
          speechStartedAt: startedAt,
          attemptId,
          roomName: call.roomName,
          accessToken: call.accessToken,
          url: call.url,
          questionIndex: index,
          questions: deck,
          question: deck[index],
          returnTo: `/exams/${examId}?mode=practice`,
        }),
      );
      navigate({ to: "/call" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start study call");
      sessionStorage.removeItem(SPEECH_STARTED_KEY);
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

  const yourAnswer = answers[current.id] || "";
  const isRevealed = isPractice && !!revealed[current.id];
  const isCorrect =
    yourAnswer.trim() && current.referenceAnswer
      ? answersRoughlyMatch(current.referenceAnswer, yourAnswer)
      : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {isPractice ? "Practice" : "Exam"} · {answeredCount}/{questions.length} answered
            {isPractice ? ` · ${questionsVisited}/${questions.length} visited` : ""}
          </p>
          <h1 className="mt-1 truncate font-display text-2xl text-primary">{current.topic}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/exams"
            className="rounded-lg border border-input px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            Exit
          </Link>
          {isPractice && (
            <button
              type="button"
              disabled={callBusy}
              onClick={() => void onStudyCall()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <CallIcon />
              {callBusy ? "Starting…" : "Start study call"}
            </button>
          )}
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

      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--hairline)]">
        <div
          className="h-full rounded-full bg-[var(--amber)] transition-[width] duration-300"
          style={{ width: `${((index + 1) / Math.max(questions.length, 1)) * 100}%` }}
          aria-hidden
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
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

        <section className="space-y-4">
          <div className="rounded-xl border border-hairline bg-background p-5 md:p-7">
            <p className="text-xs text-muted-foreground">
              Question {index + 1} of {questions.length}
            </p>
            <p className="mt-3 text-lg leading-relaxed text-foreground md:text-xl">
              {current.questionText}
            </p>

            {choices.length > 0 ? (
              <div className="mt-6 space-y-2.5" role="listbox" aria-label="Answer choices">
                {choices.map((choice) => {
                  const selected = yourAnswer === choice;
                  const correctOpt =
                    isRevealed &&
                    !!current.referenceAnswer &&
                    answersRoughlyMatch(current.referenceAnswer, choice);
                  const wrongPick = isRevealed && selected && !correctOpt;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectAnswer(choice)}
                      className={
                        "flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left text-sm leading-relaxed transition-colors " +
                        (correctOpt
                          ? "border-[color:var(--sage)] bg-[color:var(--sage)]/15 text-primary"
                          : wrongPick
                            ? "border-[color:var(--rust)] bg-[color:var(--rust)]/10 text-primary"
                            : selected
                              ? "border-primary bg-secondary text-primary"
                              : "border-hairline text-foreground hover:border-primary/40 hover:bg-secondary/60")
                      }
                    >
                      <span
                        className={
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] " +
                          (selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-hairline")
                        }
                        aria-hidden
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span>{choice}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={yourAnswer}
                onChange={(e) => selectAnswer(e.target.value)}
                rows={5}
                placeholder="Write your answer…"
                className="mt-6 w-full rounded-lg border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}

            {isPractice && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-hairline pt-5">
                <button
                  type="button"
                  onClick={() =>
                    setRevealed((prev) => ({
                      ...prev,
                      [current.id]: !prev[current.id],
                    }))
                  }
                  className="rounded-lg border border-input px-4 py-2.5 text-sm font-medium text-primary hover:bg-secondary"
                >
                  {isRevealed ? "Hide answer" : "Show answer"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChatOpen((prev) => ({
                      ...prev,
                      [current.id]: !prev[current.id],
                    }))
                  }
                  className={
                    "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors " +
                    (isChatOpen
                      ? "bg-secondary text-primary"
                      : "border border-input text-primary hover:bg-secondary")
                  }
                >
                  {isChatOpen ? "Hide AI chat" : "Ask AI about this"}
                </button>
              </div>
            )}

            {isPractice && isRevealed && current.referenceAnswer && (
              <div
                className={
                  "mt-4 rounded-lg border px-4 py-4 " +
                  (isCorrect
                    ? "border-[color:var(--sage)]/50 bg-[color:var(--sage)]/10"
                    : "border-hairline bg-secondary/50")
                }
              >
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Answer from exam bank
                </p>
                <p className="mt-2 text-base font-medium text-primary whitespace-pre-wrap">
                  {current.referenceAnswer}
                </p>
                {current.explanation ? (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Explanation
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {current.explanation}
                    </p>
                  </div>
                ) : null}
                {yourAnswer && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Your choice: <span className="text-foreground">{yourAnswer}</span>
                    {isCorrect === true ? " · correct" : isCorrect === false ? " · not matching" : ""}
                  </p>
                )}
              </div>
            )}

            {!isPractice && (
              <p className="mt-6 text-xs text-muted-foreground">
                Exam mode — answers stay hidden until you submit.
              </p>
            )}
          </div>

          {isPractice && isChatOpen && (
            <div className="flex min-h-[320px] flex-col rounded-xl border border-hairline bg-background">
              <div className="border-b border-hairline px-4 py-3">
                <h2 className="font-display text-lg text-primary">Ask AI</h2>
                <p className="text-xs text-muted-foreground">
                  Chat about this question only — hints, why options are wrong, or a step-by-step.
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
                {chatLog.length === 0 && !chatBusy && (
                  <div className="flex flex-wrap gap-2">
                    {coachQuickPrompts(current, yourAnswer, isCorrect).map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={chatBusy || chatStreaming}
                        onClick={() => void sendChat(prompt)}
                        className="rounded-full border border-hairline px-3 py-1 text-xs text-primary hover:bg-secondary disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
                {chatLog.map((t, i) => (
                  <div
                    key={`${current.id}-chat-${i}`}
                    className={
                      "max-w-[92%] rounded-lg px-3 py-2 leading-relaxed " +
                      (t.who === "you"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground")
                    }
                  >
                    {t.who === "ai" ? (
                      <ChatMarkdown text={t.text || (chatStreaming && i === chatLog.length - 1 ? "…" : "")} />
                    ) : (
                      t.text
                    )}
                  </div>
                ))}
                {chatBusy && (
                  <div
                    className="flex max-w-[92%] items-center gap-1.5 rounded-lg bg-secondary px-3 py-2.5 text-muted-foreground"
                    aria-label="AI is typing"
                  >
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2 border-t border-hairline p-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatBusy || chatStreaming}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="Ask anything about this question…"
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={chatBusy || chatStreaming || !chatInput.trim()}
                  onClick={() => void sendChat()}
                  className="rounded-lg bg-primary px-3.5 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
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
          to="/session-recap"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"
        >
          Session recap & calendar
        </Link>
        <Link
          to="/exams"
          className="rounded-lg border border-input px-4 py-2.5 text-sm text-primary hover:bg-secondary"
        >
          Back to exams
        </Link>
        <Link
          to="/dashboard"
          className="rounded-lg border border-input px-4 py-2.5 text-sm text-primary hover:bg-secondary"
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

function correctAnswerLetter(q: ExamQuestion): string | null {
  const ref = (q.referenceAnswer || "").trim();
  const fromRef = ref.match(/^([A-D])\b/i);
  if (fromRef) return fromRef[1].toUpperCase();
  for (const choice of normalizeChoices(q)) {
    if (answersRoughlyMatch(ref, choice)) {
      const fromChoice = choice.match(/^([A-D])\b/i);
      if (fromChoice) return fromChoice[1].toUpperCase();
    }
  }
  return null;
}

function coachQuickPrompts(
  q: ExamQuestion,
  yourAnswer: string,
  isCorrect: boolean | null,
): string[] {
  const letter = correctAnswerLetter(q);
  const prompts = ["Give me a hint"];
  prompts.push(
    letter ? `Explain why ${letter} is correct` : "Explain the correct answer",
  );
  if (yourAnswer.trim() && isCorrect === false) {
    prompts.push("Why is my answer wrong?");
  } else {
    prompts.push("Walk me through this step by step");
  }
  return prompts;
}

/** Prefer API choices; fall back to A–D lines embedded in the question text. */
function normalizeChoices(q: ExamQuestion | undefined): string[] {
  if (!q) return [];
  if (q.choices && q.choices.length > 0) {
    return q.choices.map((c) => String(c).trim()).filter(Boolean);
  }
  const text = q.questionText || "";
  const matches = text.match(/(?:^|\n)\s*([A-D][).:]\s+.+)/gi);
  if (matches && matches.length >= 2) {
    return matches.map((m) => m.trim());
  }
  return [];
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
