import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMyProfile } from "@/lib/api";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReadinessRing } from "@/components/ReadinessRing";

const CALL_HANDOFF_KEY = "tele-exit-practice-call";

export const Route = createFileRoute("/call")({
  head: () => ({
    meta: [
      { title: "Practice call — Tele-Exit" },
      { name: "description", content: "Live one-on-one practice call with your AI study partner." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ProtectedRoute role="student">
      <CallScreen />
    </ProtectedRoute>
  ),
});

// -- types -------------------------------------------------------------------

interface QuestionCard {
  index: number;
  total: number;
  topic: string;
  text: string;
}

interface PracticeCallHandoff {
  examId?: string;
  returnTo?: string;
  roomName?: string;
  question?: {
    topic: string;
    text: string;
    index: number;
    total: number;
    referenceAnswer?: string | null;
  };
}

type Turn = { id: string; who: "agent" | "you"; text: string };
type Action = "thinking" | "searching-web" | "finding-video" | null;

function readHandoff(): PracticeCallHandoff | null {
  try {
    const raw = sessionStorage.getItem(CALL_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PracticeCallHandoff;
  } catch {
    return null;
  }
}

// -- screen ------------------------------------------------------------------

function CallScreen() {
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const handoff = useRef(readHandoff()).current;

  const [listening, setListening] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [question, setQuestion] = useState<QuestionCard>(() =>
    handoff?.question
      ? {
          index: handoff.question.index,
          total: handoff.question.total,
          topic: handoff.question.topic,
          text: handoff.question.text,
        }
      : {
          index: 1,
          total: 1,
          topic: "Study call",
          text: "Walk me through how you’d approach this topic out loud.",
        },
  );
  const [transcript, setTranscript] = useState<Turn[]>(() => [
    {
      id: "t1",
      who: "agent",
      text: handoff?.question
        ? "Take your time — explain this question in your own words. I’ll guide you."
        : "So — what's the first thing you'd try?",
    },
  ]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Lazy webcam init — only when the user actively starts listening.
  // Camera access is not requested on mount.
  async function startCamera() {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Non-fatal — the call still works audio-only in a real backend.
      setConnectionError("Couldn't access your camera or microphone — check your browser permissions.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO backend: open WS /ws/call?token=... and handle:
  //   question_card, action_indicator, agent_response, error
  // Mocked demo below so the UI is testable without the backend.
  useEffect(() => {
    if (!listening) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => !cancelled && setAction("thinking"), 1200));
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAction(null);
        setTranscript((prev) => [
          ...prev,
          { id: `t${prev.length + 1}`, who: "you", text: "It's exponential — 2 to the n." },
          { id: `t${prev.length + 2}`, who: "agent", text: "Exactly. So let's think about overlapping subproblems…" },
        ]);
      }, 3200),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [listening]);

  // Auto-scroll transcript to the newest turn.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length]);

  async function toggleMic() {
    if (listening) {
      setListening(false);
    } else {
      await startCamera();
      setListening(true);
    }
  }

  async function endCall() {
    stopCamera();
    sessionStorage.removeItem(CALL_HANDOFF_KEY);
    if (handoff?.examId) {
      navigate({
        to: "/exams/$examId",
        params: { examId: handoff.examId },
        search: { mode: "practice" },
      });
      return;
    }
    navigate({ to: "/dashboard" });
  }

  const readiness = profile.data?.readiness ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {/* Top status bar */}
      <header className="hairline-b flex items-center justify-between gap-4 bg-background/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <ReadinessRing value={readiness} size={44} stroke={5} compact caption="" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-base text-primary">
              {question.topic}
            </p>
            <p className="text-xs text-muted-foreground">
              Question {question.index} of ~{question.total}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={endCall}
          className="rounded-md border-2 border-[var(--rust)] px-4 py-2 text-sm font-medium text-[var(--rust)] transition-colors hover:bg-[color:var(--rust)]/10"
          aria-label="End practice call"
        >
          End call
        </button>
      </header>

      {/* Center: question card + transcript */}
      <div className="flex-1 lg:grid lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col items-center px-5 pt-10 md:pt-16">
          <div key={question.text} className="fade-in mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[var(--amber-strong)]">{question.topic}</p>
            <p className="mt-5 font-display text-2xl leading-relaxed text-primary md:text-3xl md:leading-[1.35]">
              {question.text}
            </p>

            {/* Action indicator — quiet, single line, only when active. */}
            <div className="mt-6 h-6" aria-live="polite" aria-atomic="true">
              {action && (
                <p className="text-sm text-muted-foreground">
                  <span className="pulse-dot mr-1">·</span>
                  <span className="pulse-dot mr-1" style={{ animationDelay: "160ms" }}>·</span>
                  <span className="pulse-dot mr-2" style={{ animationDelay: "320ms" }}>·</span>
                  {actionLabel(action)}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Transcript — right rail on desktop, below on mobile */}
        <aside
          className="hairline-b border-t border-hairline lg:border-l lg:border-t-0"
          aria-label="Live conversation transcript"
        >
          <div className="flex h-full max-h-[40dvh] flex-col lg:max-h-none">
            <p className="eyebrow px-5 pt-4">Transcript</p>
            <ol
              className="flex-1 space-y-3 overflow-y-auto px-5 py-3 text-sm"
              aria-live="polite"
              aria-relevant="additions"
            >
              {transcript.map((turn) => (
                <li key={turn.id} className="flex gap-3">
                  <span
                    className={
                      "w-14 shrink-0 text-xs uppercase tracking-wider " +
                      (turn.who === "agent"
                        ? "text-[var(--amber-strong)]"
                        : "text-muted-foreground")
                    }
                  >
                    {turn.who === "agent" ? "Agent" : "You"}
                  </span>
                  <span
                    className={
                      turn.who === "agent" ? "text-primary" : "text-foreground"
                    }
                  >
                    {turn.text}
                  </span>
                </li>
              ))}
              <li ref={transcriptEndRef as unknown as React.LegacyRef<HTMLLIElement>} aria-hidden />
            </ol>
          </div>
        </aside>
      </div>

      {/* Bottom: mic + self-view */}
      <footer className="relative px-5 pb-6 pt-6 md:pb-10">
        {connectionError && (
          <p
            role="alert"
            className="mx-auto mb-4 max-w-md rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
          >
            {connectionError}
          </p>
        )}
        <div className="flex items-end justify-center">
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className={
              "flex h-[72px] w-[72px] items-center justify-center rounded-full text-white shadow-[var(--shadow-quiet)] transition-transform focus-visible:scale-105 " +
              (listening
                ? "bg-[var(--amber-strong)] hover:brightness-105"
                : "bg-primary hover:bg-primary/90")
            }
          >
            <MicIcon muted={!listening} />
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-hidden>
          {listening ? "Listening" : "Tap to speak"}
        </p>

        {/* Self-view */}
        <div className="pointer-events-none absolute bottom-4 right-4 h-20 w-28 overflow-hidden rounded-md border border-hairline bg-black/80 md:h-24 md:w-32">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Your webcam preview"
            className="h-full w-full object-cover"
          />
          {!streamRef.current && (
            <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-white/70">
              Camera off
            </div>
          )}
        </div>
      </footer>

      {/* Screen-reader-only region for new agent turns is the transcript
          <ol aria-live="polite"> above — no separate visual duplication needed. */}

      {/* Dev-only helper to advance the question in the demo */}
      <button
        type="button"
        onClick={() =>
          setQuestion((q) => ({
            ...q,
            index: q.index + 1,
            topic: "Graph traversal",
            text: "Given an undirected graph, how would you detect a cycle? Explain in your own words.",
          }))
        }
        className="sr-only"
      >
        Next question
      </button>
    </div>
  );
}

function actionLabel(a: Exclude<Action, null>) {
  switch (a) {
    case "thinking":       return "Thinking";
    case "searching-web":  return "Searching the web";
    case "finding-video":  return "Finding a video";
  }
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      />
      {muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />}
    </svg>
  );
}
