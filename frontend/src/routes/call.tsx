import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMyProfile, practiceChat } from "@/lib/api";
import {
  buildCallOpening,
  CALL_OPENING_CUES,
  speakNow,
  warmVoices,
} from "@/lib/speech";
import {
  createSpeechListener,
  forSpeech,
  speechRecognitionSupported,
} from "@/lib/speechListen";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReadinessRing } from "@/components/ReadinessRing";

const CALL_HANDOFF_KEY = "tele-exit-practice-call";
const SPEECH_STARTED_KEY = "tele-exit-call-speech-started";

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

interface QuestionCard {
  id?: string;
  index: number;
  total: number;
  topic: string;
  text: string;
  choices: string[];
}

interface PracticeCallHandoff {
  examId?: string;
  examTitle?: string;
  welcomeText?: string;
  speechStartedAt?: number;
  attemptId?: string;
  returnTo?: string;
  roomName?: string;
  question?: {
    id?: string;
    topic: string;
    text: string;
    choices?: string[];
    index: number;
    total: number;
    referenceAnswer?: string | null;
  };
}

type Turn = { id: string; who: "agent" | "you"; text: string };
type SharePhase = "joining" | "sharing" | "shared";

function readHandoff(): PracticeCallHandoff | null {
  try {
    const raw = sessionStorage.getItem(CALL_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PracticeCallHandoff;
  } catch {
    return null;
  }
}

function CallScreen() {
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ["profile"], queryFn: getMyProfile });
  const handoff = useRef(readHandoff()).current;
  const examTitle = handoff?.examTitle?.trim() || "Practice exam";
  const attemptId = handoff?.attemptId || "";
  const questionId = handoff?.question?.id || "";

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [coachBusy, setCoachBusy] = useState(false);
  const [sharePhase, setSharePhase] = useState<SharePhase>("joining");
  const [liveCaption, setLiveCaption] = useState("");
  const [question] = useState<QuestionCard>(() =>
    handoff?.question
      ? {
          id: handoff.question.id,
          index: handoff.question.index,
          total: handoff.question.total,
          topic: handoff.question.topic,
          text: handoff.question.text,
          choices: handoff.question.choices ?? [],
        }
      : {
          index: 1,
          total: 1,
          topic: "Study call",
          text: "Walk me through how you’d approach this topic out loud.",
          choices: [],
        },
  );

  const welcomeText = useMemo(
    () => handoff?.welcomeText?.trim() || buildCallOpening(examTitle, question.index),
    [handoff?.welcomeText, examTitle, question.index],
  );

  const [transcript, setTranscript] = useState<Turn[]>([
    { id: "t1", who: "agent", text: "Welcome — joining your study call…" },
  ]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLLIElement | null>(null);
  const cancelSpeakRef = useRef<(() => void) | null>(null);
  const listenRef = useRef<ReturnType<typeof createSpeechListener> | null>(null);
  const pendingSpeechRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const replyLockRef = useRef(false);

  const pushTurn = useCallback((who: "agent" | "you", text: string) => {
    setTranscript((prev) => [...prev, { id: `t-${Date.now()}-${prev.length}`, who, text }]);
  }, []);

  const askCoach = useCallback(
    async (spoken: string) => {
      const msg = spoken.trim();
      if (!msg || replyLockRef.current) return;
      if (!attemptId || !questionId) {
        pushTurn("agent", "I lost the exam link — go back and start the study call again.");
        return;
      }

      replyLockRef.current = true;
      setCoachBusy(true);
      setLiveCaption("");
      pushTurn("you", msg);

      try {
        const reply = await practiceChat(attemptId, questionId, msg, {
          mode: "voice",
          timeoutMs: 18_000,
        });
        const clean = (reply || "Got it — tell me more about what you see on the shared screen.").trim();
        pushTurn("agent", clean);
        cancelSpeakRef.current?.();
        setSpeaking(true);
        cancelSpeakRef.current = speakNow(forSpeech(clean), {
          onStart: () => setSpeaking(true),
          onEnd: () => setSpeaking(false),
        });
      } catch (err) {
        const fallback =
          err instanceof Error ? err.message : "I missed that — say it one more time.";
        pushTurn("agent", fallback);
        setSpeaking(true);
        cancelSpeakRef.current = speakNow(forSpeech(fallback), {
          onEnd: () => setSpeaking(false),
        });
      } finally {
        setCoachBusy(false);
        replyLockRef.current = false;
      }
    },
    [attemptId, questionId, pushTurn],
  );

  const queueUserSpeech = useCallback(
    (chunk: string) => {
      pendingSpeechRef.current = `${pendingSpeechRef.current} ${chunk}`.trim();
      setLiveCaption(pendingSpeechRef.current);
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      // Short pause = end of turn, like a real conversation.
      silenceTimerRef.current = window.setTimeout(() => {
        const full = pendingSpeechRef.current.trim();
        pendingSpeechRef.current = "";
        setLiveCaption("");
        if (full) void askCoach(full);
      }, 900);
    },
    [askCoach],
  );

  useEffect(() => {
    warmVoices();
    const resume = window.setInterval(() => {
      try {
        if (window.speechSynthesis?.speaking) window.speechSynthesis.resume();
      } catch {
        // ignore
      }
    }, 2000);
    return () => window.clearInterval(resume);
  }, []);

  // Opening: voice continues from Start click + Meet-like share animation.
  useEffect(() => {
    const startedFlag = sessionStorage.getItem(SPEECH_STARTED_KEY);
    const startedAt = handoff?.speechStartedAt || (startedFlag ? Number(startedFlag) : 0);
    const elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    const synth = window.speechSynthesis;
    const alreadySpeaking = !!(synth?.speaking || synth?.pending);

    if (alreadySpeaking) setSpeaking(true);
    else if (!startedFlag) {
      cancelSpeakRef.current = speakNow(welcomeText, {
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
      sessionStorage.setItem(SPEECH_STARTED_KEY, String(Date.now()));
    } else {
      setSpeaking(!!synth?.speaking);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const runShare = () => {
      setSharePhase("sharing");
      setTranscript((prev) => [
        ...prev,
        {
          id: "t-share",
          who: "agent",
          text: "Let me share my screen so you can see the exam question…",
        },
      ]);
    };
    const runQuestion = () => {
      setSharePhase("shared");
      setTranscript((prev) => [
        ...prev.filter((t) => t.id !== "t-q"),
        {
          id: "t-q",
          who: "agent",
          text: `Here's question ${question.index}. Unmute and talk — you’ll see your words on screen.`,
        },
      ]);
    };

    const shareDelay = Math.max(0, CALL_OPENING_CUES.sharingMs - elapsed);
    const questionDelay = Math.max(0, CALL_OPENING_CUES.questionMs - elapsed);
    if (elapsed >= CALL_OPENING_CUES.questionMs) {
      setSharePhase("shared");
      runQuestion();
    } else if (elapsed >= CALL_OPENING_CUES.sharingMs) {
      setSharePhase("sharing");
      runShare();
      timers.push(setTimeout(runQuestion, questionDelay));
    } else {
      timers.push(setTimeout(runShare, shareDelay));
      timers.push(setTimeout(runQuestion, questionDelay));
    }

    const poll = window.setInterval(() => {
      if (!window.speechSynthesis) return;
      setSpeaking(window.speechSynthesis.speaking || window.speechSynthesis.pending);
    }, 300);

    return () => {
      timers.forEach(clearTimeout);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOn(true);
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  useEffect(() => {
    return () => {
      listenRef.current?.stop();
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, liveCaption]);

  function startListening() {
    if (!speechRecognitionSupported()) {
      setConnectionError("Live captions need Chrome or Edge — open the call there to talk.");
      return;
    }
    // Barge-in: stop coach voice when you unmute.
    cancelSpeakRef.current?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);

    listenRef.current?.stop();
    listenRef.current = createSpeechListener({
      onInterim: (text) => {
        const pending = pendingSpeechRef.current;
        setLiveCaption(pending ? `${pending} ${text}`.trim() : text);
      },
      onFinal: (text) => queueUserSpeech(text),
      onError: (message) => setConnectionError(message),
    });
    listenRef.current.start();
    setListening(true);
    setConnectionError(null);
  }

  function stopListening() {
    listenRef.current?.stop();
    listenRef.current = null;
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    const leftover = pendingSpeechRef.current.trim() || liveCaption.trim();
    pendingSpeechRef.current = "";
    setLiveCaption("");
    setListening(false);
    if (leftover && !replyLockRef.current) void askCoach(leftover);
  }

  async function toggleMic() {
    if (listening) {
      stopListening();
      return;
    }
    if (!cameraOn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOn(true);
      } catch {
        setConnectionError("Couldn't access your camera or microphone — check browser permissions.");
      }
    }
    startListening();
  }

  async function endCall() {
    stopListening();
    cancelSpeakRef.current?.();
    window.speechSynthesis?.cancel();
    sessionStorage.removeItem(SPEECH_STARTED_KEY);
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
  const captionText =
    liveCaption ||
    (coachBusy ? "Coach is thinking…" : listening ? "Listening… start talking" : "");

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="hairline-b flex items-center justify-between gap-4 bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ReadinessRing value={readiness} size={40} stroke={5} compact caption="" />
          <div className="min-w-0">
            <p className="truncate font-display text-base text-primary">{examTitle}</p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--amber)] opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--amber)]" />
                </span>
                Live study call
              </span>
              <span aria-hidden>·</span>
              <span>
                Question {question.index} of {question.total}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={endCall}
          className="rounded-md border-2 border-[var(--rust)] px-4 py-2 text-sm font-medium text-[var(--rust)] transition-colors hover:bg-[color:var(--rust)]/10"
        >
          End call
        </button>
      </header>

      {/* Meet-style presenting banner */}
      {sharePhase !== "joining" && (
        <div className="meet-presenting-bar border-b border-hairline bg-secondary/70 px-4 py-2">
          <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-xs text-foreground md:text-sm">
            <ScreenShareIcon />
            <span className="font-medium text-primary">
              {sharePhase === "sharing"
                ? "AI Coach is presenting their screen…"
                : "AI Coach is presenting · Exam question"}
            </span>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="relative flex min-h-0 flex-1 flex-col p-3 md:p-5">
          <div
            className={
              "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-card shadow-[var(--shadow-quiet)] " +
              (sharePhase === "shared" ? "meet-share-in" : "")
            }
          >
            <div className="flex items-center justify-between gap-3 border-b border-hairline bg-secondary/40 px-3 py-2 md:px-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/90" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/90" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/90" aria-hidden />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {sharePhase === "joining"
                  ? "tele-exit · connecting"
                  : sharePhase === "sharing"
                    ? "tele-exit · starting presentation"
                    : `tele-exit · ${examTitle}`}
              </p>
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                {sharePhase === "shared" ? "You are viewing" : "…"}
              </span>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto bg-background">
              {sharePhase === "joining" && (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--amber)]/15 font-display text-2xl text-[var(--amber-strong)]">
                    AI
                  </div>
                  <p className="font-display text-xl text-primary">Connecting…</p>
                  <p className="text-sm text-muted-foreground">Your coach will present the exam next.</p>
                </div>
              )}

              {sharePhase === "sharing" && (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-6">
                  <div className="meet-share-in w-full max-w-md rounded-2xl border border-dashed border-hairline bg-secondary/50 px-8 py-12 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <ScreenShareIcon className="h-6 w-6" />
                    </div>
                    <p className="font-display text-lg text-primary">Presenting screen</p>
                    <p className="mt-1 text-sm text-muted-foreground">Exam paper is opening…</p>
                    <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-hairline">
                      <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--amber)]" />
                    </div>
                  </div>
                </div>
              )}

              {sharePhase === "shared" && (
                <div className="meet-share-in mx-auto max-w-3xl px-5 py-6 md:px-10 md:py-8">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--amber-strong)]">
                        Shared presentation
                      </p>
                      <p className="mt-1 font-display text-lg text-primary md:text-xl">{examTitle}</p>
                    </div>
                    <div className="rounded-md border border-hairline bg-secondary/40 px-3 py-1.5 text-right text-xs text-muted-foreground">
                      <p>
                        Question {question.index} of {question.total}
                      </p>
                      {question.topic ? <p className="mt-0.5 max-w-[14rem] truncate">{question.topic}</p> : null}
                    </div>
                  </div>
                  <p className="font-display text-xl leading-relaxed text-primary md:text-2xl md:leading-[1.4]">
                    {question.text}
                  </p>
                  {question.choices.length > 0 && (
                    <ul className="mt-6 space-y-2.5">
                      {question.choices.map((choice, i) => (
                        <li
                          key={`${i}-${choice}`}
                          className="flex gap-3 rounded-lg border border-hairline bg-secondary/30 px-4 py-3 text-sm leading-relaxed"
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{stripChoiceLetter(choice)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Participant tiles */}
          <div className="pointer-events-none absolute bottom-[7.5rem] right-5 z-10 flex flex-col gap-2 md:bottom-36 md:right-8">
            <div
              className={
                "overflow-hidden rounded-xl border border-hairline bg-card shadow-[var(--shadow-quiet)] " +
                (speaking || coachBusy ? "ring-2 ring-[var(--amber)]/45" : "")
              }
            >
              <div className="flex h-24 w-36 flex-col items-center justify-center md:h-28 md:w-40">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--amber)]/20 font-display text-lg text-[var(--amber-strong)]">
                  AI
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Coach</p>
              </div>
              {(speaking || coachBusy) && (
                <p className="border-t border-hairline bg-secondary/50 px-2 py-1 text-center text-[10px] text-[var(--amber-strong)]">
                  {coachBusy ? "Thinking" : "Speaking"}
                </p>
              )}
            </div>
            <div className="relative h-24 w-36 overflow-hidden rounded-xl border border-hairline bg-secondary shadow-[var(--shadow-quiet)] md:h-28 md:w-40">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider text-muted-foreground">
                  You
                </div>
              )}
              {listening && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-[var(--amber-strong)] px-1.5 py-0.5 text-[10px] text-white">
                  Mic on
                </span>
              )}
            </div>
          </div>

          {/* Live captions — like Meet captions */}
          {(captionText || listening) && (
            <div className="meet-caption-in pointer-events-none absolute inset-x-4 bottom-20 z-20 flex justify-center md:bottom-24">
              <p
                className="max-w-2xl rounded-lg bg-primary/90 px-4 py-2.5 text-center text-sm leading-relaxed text-primary-foreground shadow-lg"
                aria-live="polite"
              >
                {captionText || "Listening…"}
              </p>
            </div>
          )}
        </section>

        <aside className="flex max-h-[32dvh] flex-col border-t border-hairline lg:max-h-none lg:border-l lg:border-t-0">
          <p className="eyebrow border-b border-hairline px-4 py-3">Call chat</p>
          <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {transcript.map((turn) => (
              <li key={turn.id} className="flex gap-2.5">
                <span
                  className={
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold " +
                    (turn.who === "agent"
                      ? "bg-[var(--amber)]/20 text-[var(--amber-strong)]"
                      : "bg-secondary text-muted-foreground")
                  }
                >
                  {turn.who === "agent" ? "AI" : "You"}
                </span>
                <span className={turn.who === "agent" ? "text-primary" : "text-foreground"}>{turn.text}</span>
              </li>
            ))}
            {liveCaption && listening && (
              <li className="flex gap-2.5 opacity-70">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground">
                  You
                </span>
                <span className="italic text-muted-foreground">{liveCaption}</span>
              </li>
            )}
            <li ref={transcriptEndRef} aria-hidden />
          </ol>
        </aside>
      </div>

      <footer className="border-t border-hairline bg-background px-4 py-4 md:px-6">
        {connectionError && (
          <p role="alert" className="mx-auto mb-3 max-w-lg text-center text-sm text-destructive">
            {connectionError}
          </p>
        )}
        <div className="mx-auto flex max-w-lg items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => void toggleMic()}
            aria-pressed={listening}
            aria-label={listening ? "Mute" : "Unmute"}
            className={
              "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[var(--shadow-quiet)] transition-transform " +
              (listening
                ? "bg-[var(--amber-strong)] hover:brightness-105"
                : "bg-primary hover:bg-primary/90")
            }
          >
            <MicIcon muted={!listening} />
          </button>
          <div className="min-w-0 text-left text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {listening ? "Unmuted — talk now" : speaking ? "Coach speaking" : coachBusy ? "Coach thinking" : "Muted"}
            </p>
            <p className="truncate">Your words appear as captions · coach answers out loud</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function stripChoiceLetter(choice: string): string {
  return choice.replace(/^[A-Da-d][.)]\s*/, "").trim() || choice;
}

function ScreenShareIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={"shrink-0 text-[var(--amber-strong)] " + (className || "")}
    >
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {muted && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />}
    </svg>
  );
}
