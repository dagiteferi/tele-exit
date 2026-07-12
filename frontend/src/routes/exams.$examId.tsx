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

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showAnswer, setShowAnswer] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ who: "you" | "ai"; text: string }[]>([]);
  const [result, setResult] = useState<{
    scoreCorrect: number;
    scoreTotal: number;
    percent: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callInfo, setCallInfo] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useMutation({
    mutationFn: () => startExamAttempt(examId, mode as ExamMode),
    onSuccess: (data) => {
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setIndex(0);
      setAnswers({});
      setResult(null);
      setChatLog([]);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  useEffect(() => {
    start.mutate();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, mode]);

  const current = questions[index];
  const progress = useMemo(
    () => (questions.length ? `${index + 1} / ${questions.length}` : "—"),
    [index, questions.length],
  );

  async function sendChat() {
    if (!attemptId || !current || !chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatLog((prev) => [...prev, { who: "you", text: msg }]);
    try {
      const reply = await practiceChat(attemptId, current.id, msg);
      setChatLog((prev) => [...prev, { who: "ai", text: reply }]);
    } catch (err) {
      setChatLog((prev) => [
        ...prev,
        { who: "ai", text: err instanceof Error ? err.message : "Chat failed." },
      ]);
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
      setResult({
        scoreCorrect: res.scoreCorrect,
        scoreTotal: res.scoreTotal,
        percent: res.percent,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    }
  }

  async function onStudyCall() {
    if (!attemptId || !current) return;
    try {
      const call = await startStudyCall(attemptId, current.id);
      setCallInfo(`Room ${call.roomName} ready${call.url ? ` · ${call.url}` : ""}.`);
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start study call");
    }
  }

  if (start.isPending && !questions.length) {
    return <p className="text-sm text-muted-foreground">Starting {mode} session…</p>;
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="font-display text-3xl text-primary">
          {mode === "exam" ? "Exam complete" : "Practice submitted"}
        </h1>
        <p className="text-muted-foreground">
          Score {result.scoreCorrect}/{result.scoreTotal} ({result.percent}%)
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/exams" className="rounded-md border border-input px-4 py-2 text-sm">
            Back to exams
          </Link>
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard" })}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Link to="/exams" className="text-sm text-primary underline">
          Back to exams
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {mode === "practice" ? "Practice mode" : "Exam mode"} · {progress}
            </p>
            <h1 className="mt-1 text-xl font-medium text-primary">{current.topic}</h1>
          </div>
          <Link to="/exams" className="text-sm text-muted-foreground hover:text-primary">
            Exit
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="rounded-lg border border-hairline bg-background p-5">
          <p className="text-base leading-relaxed text-foreground">{current.questionText}</p>

          {current.choices && current.choices.length > 0 ? (
            <div className="mt-4 space-y-2">
              {current.choices.map((choice) => (
                <label
                  key={choice}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-hairline px-3 py-2 text-sm hover:bg-secondary"
                >
                  <input
                    type="radio"
                    name={`q-${current.id}`}
                    checked={answers[current.id] === choice}
                    onChange={() => setAnswers({ ...answers, [current.id]: choice })}
                    className="mt-1"
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[current.id] || ""}
              onChange={(e) => setAnswers({ ...answers, [current.id]: e.target.value })}
              rows={4}
              placeholder="Type your answer…"
              className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          )}

          {mode === "practice" && (
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setShowAnswer((v) => !v)}
                className="text-sm text-primary underline"
              >
                {showAnswer ? "Hide answer" : "Show reference answer"}
              </button>
              {showAnswer && (
                <p className="rounded-md bg-secondary/60 px-3 py-2 text-sm text-foreground">
                  {current.referenceAnswer || "No reference answer stored."}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setShowAnswer(false);
            }}
            className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-40"
          >
            Previous
          </button>
          {index < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                setIndex((i) => Math.min(questions.length - 1, i + 1));
                setShowAnswer(false);
              }}
              className="rounded-md border border-input px-3 py-2 text-sm"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onSubmit()}
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              {mode === "exam" ? "Submit exam" : "Finish practice"}
            </button>
          )}
        </div>
      </div>

      {mode === "practice" ? (
        <aside className="space-y-4">
          <div className="rounded-lg border border-hairline bg-background p-4">
            <h2 className="text-sm font-medium text-primary">AI study coach</h2>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
              {chatLog.length === 0 && (
                <p className="text-muted-foreground">Ask for a hint or explanation.</p>
              )}
              {chatLog.map((t, i) => (
                <p key={i} className={t.who === "you" ? "text-foreground" : "text-muted-foreground"}>
                  <span className="font-medium">{t.who === "you" ? "You" : "AI"}: </span>
                  {t.text}
                </p>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendChat();
                }}
                placeholder="Ask about this question…"
                className="flex-1 rounded-md border border-input px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void sendChat()}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Send
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-hairline bg-background p-4">
            <h2 className="text-sm font-medium text-primary">Study video call</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a LiveKit study room for this question (camera optional).
            </p>
            <button
              type="button"
              onClick={() => void onStudyCall()}
              className="mt-3 rounded-md border border-input px-3 py-2 text-sm text-primary hover:bg-secondary"
            >
              Start study call
            </button>
            {callInfo && <p className="mt-2 text-xs text-muted-foreground">{callInfo}</p>}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="mt-3 aspect-video w-full rounded-md bg-black/80 object-cover"
            />
          </div>
        </aside>
      ) : (
        <aside className="rounded-lg border border-hairline bg-background p-4 text-sm text-muted-foreground">
          <h2 className="font-medium text-primary">Exam rules</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Answers are hidden until you submit.</li>
            <li>AI chat and video study call are disabled.</li>
            <li>Your score is saved to your progress.</li>
          </ul>
        </aside>
      )}
    </div>
  );
}
