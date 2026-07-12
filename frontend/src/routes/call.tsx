import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMyProfile, practiceChat } from "@/lib/api";
import {
  buildCallOpening,
  buildJoiningLine,
  buildReadyLine,
  buildShareLine,
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
  referenceAnswer?: string | null;
}

interface PracticeCallHandoff {
  examId?: string;
  examTitle?: string;
  welcomeText?: string;
  speechStartedAt?: number;
  attemptId?: string;
  returnTo?: string;
  roomName?: string;
  questionIndex?: number;
  questions?: QuestionCard[];
  question?: QuestionCard;
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

  const deck: QuestionCard[] = useMemo(() => {
    if (handoff?.questions?.length) {
      return handoff.questions.map((q, i) => ({
        ...q,
        index: q.index || i + 1,
        total: handoff.questions!.length,
        choices: q.choices ?? [],
      }));
    }
    if (handoff?.question) {
      return [
        {
          ...handoff.question,
          choices: handoff.question.choices ?? [],
        },
      ];
    }
    return [
      {
        index: 1,
        total: 1,
        topic: "Study call",
        text: "Walk me through how you’d approach this topic out loud.",
        choices: [],
      },
    ];
  }, [handoff]);

  const [cursor, setCursor] = useState(() =>
    Math.min(Math.max(handoff?.questionIndex ?? 0, 0), Math.max(deck.length - 1, 0)),
  );
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const question = deck[cursor] || deck[0];
  const questionId = question?.id || `idx-${cursor}`;
  const questionIdRef = useRef(questionId);
  questionIdRef.current = questionId;
  const goToQuestionRef = useRef<(nextCursor: number) => boolean>(() => false);

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(true);
  const [coachBusy, setCoachBusy] = useState(false);
  const [sharePhase, setSharePhase] = useState<SharePhase>("joining");
  const [liveCaption, setLiveCaption] = useState("");
  const [sharedVideo, setSharedVideo] = useState<{
    title: string;
    url: string;
    timestamp?: string;
    description?: string;
  } | null>(null);
  const [findingVideo, setFindingVideo] = useState(false);
  const [talkingWhileMuted, setTalkingWhileMuted] = useState(false);
  const [videoSearchLabel, setVideoSearchLabel] = useState("Searching YouTube…");

  const welcomeText = useMemo(
    () => handoff?.welcomeText?.trim() || buildCallOpening(examTitle, question?.index ?? 1),
    [handoff?.welcomeText, examTitle, question?.index],
  );

  const initialQid =
    handoff?.questions?.[handoff.questionIndex ?? 0]?.id ||
    handoff?.question?.id ||
    questionId;

  const [chatByQuestion, setChatByQuestion] = useState<Record<string, Turn[]>>(() => ({
    [initialQid]: [{ id: "t1", who: "agent", text: buildJoiningLine() }],
  }));
  const transcript = chatByQuestion[questionId] || [];

  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatScrollRef = useRef<HTMLOListElement | null>(null);
  const cancelSpeakRef = useRef<(() => void) | null>(null);
  const listenRef = useRef<ReturnType<typeof createSpeechListener> | null>(null);
  const pendingSpeechRef = useRef("");
  const followUpRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const replyLockRef = useRef(false);
  const askCoachRef = useRef<(spoken: string) => Promise<void>>(async () => undefined);
  const queueUserSpeechRef = useRef<(chunk: string) => void>(() => undefined);
  /** Student just got the current question right — “yes / move on” advances. */
  const lastCorrectRef = useRef(false);

  const pushTurn = useCallback((who: "agent" | "you", text: string, forQuestionId?: string) => {
    const key = forQuestionId || questionIdRef.current || "q0";
    setChatByQuestion((prev) => ({
      ...prev,
      [key]: [
        ...(prev[key] || []),
        { id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, who, text },
      ],
    }));
  }, []);

  const goToQuestion = useCallback(
    (nextCursor: number) => {
      if (nextCursor < 0 || nextCursor >= deck.length) return false;
      if (nextCursor === cursorRef.current) return false;
      const q = deck[nextCursor];
      const qid = q.id || `idx-${nextCursor}`;
      questionIdRef.current = qid;
      cursorRef.current = nextCursor;
      lastCorrectRef.current = false;
      setCursor(nextCursor);
      setSharedVideo(null);
      setFindingVideo(false);
      setSharePhase("shared");
      followUpRef.current = "";
      pendingSpeechRef.current = "";
      setLiveCaption("");

      const line = `Okay — now looking at question ${q.index} of ${q.total}. Ask me about this one on the shared screen.`;
      setChatByQuestion((prev) => {
        const existing = prev[qid] || [];
        if (existing.length > 0) {
          return {
            ...prev,
            [qid]: [
              ...existing,
              {
                id: `t-jump-${Date.now()}`,
                who: "agent",
                text: line,
              },
            ],
          };
        }
        return {
          ...prev,
          [qid]: [{ id: `t-open-${qid}`, who: "agent", text: line }],
        };
      });
      cancelSpeakRef.current?.();
      window.speechSynthesis?.cancel();
      setSpeaking(true);
      cancelSpeakRef.current = speakNow(forSpeech(line), {
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
      });
      return true;
    },
    [deck],
  );
  goToQuestionRef.current = goToQuestion;

  const askCoach = useCallback(
    async (spoken: string) => {
      const msg = spoken.trim();
      if (!msg) return;

      const currentQ = deck[cursorRef.current];
      if (currentQ && messageLooksCorrect(msg, currentQ)) {
        lastCorrectRef.current = true;
      }

      // Voice/chat navigation — agent actually changes the shared question.
      // Allow next/prev even while a coach reply is in flight (common after “correct!”).
      const nav =
        detectQuestionNav(msg, cursorRef.current, deck.length) ||
        (lastCorrectRef.current && wantsAdvanceAfterCorrect(msg)
          ? ({ kind: "next" } as const)
          : null);
      if (nav) {
        const fromId = questionIdRef.current;
        pushTurn("you", msg, fromId);
        replyLockRef.current = false;
        setCoachBusy(false);
        followUpRef.current = "";
        if (nav.kind === "next" || nav.kind === "prev" || nav.kind === "goto") {
          const target =
            nav.kind === "next"
              ? cursorRef.current + 1
              : nav.kind === "prev"
                ? cursorRef.current - 1
                : nav.index;
          const moved = goToQuestionRef.current(target);
          if (!moved) {
            const edge =
              nav.kind === "next" || (nav.kind === "goto" && target >= deck.length)
                ? "You're already on the last question — want a hint on this one instead?"
                : nav.kind === "prev" || (nav.kind === "goto" && target < 0)
                  ? "You're already on the first question. Want to dig into this one?"
                  : "I couldn't jump there — try Previous / Next on the shared screen.";
            pushTurn("agent", edge, questionIdRef.current);
            cancelSpeakRef.current?.();
            setSpeaking(true);
            cancelSpeakRef.current = speakNow(forSpeech(edge), {
              onEnd: () => setSpeaking(false),
            });
          }
          return;
        }
      }

      if (replyLockRef.current) {
        followUpRef.current = msg;
        return;
      }

      const activeQuestionId = questionIdRef.current;
      if (!attemptId || !activeQuestionId) {
        pushTurn("agent", "I lost the exam link — go back and start the study call again.");
        return;
      }

      replyLockRef.current = true;
      setCoachBusy(true);
      setLiveCaption("");
      pushTurn("you", msg, activeQuestionId);

      const wantsVideo = /youtube|video|videos|watch|clip|tutorial/i.test(msg);
      if (wantsVideo) {
        setFindingVideo(true);
        setSharedVideo(null);
        setVideoSearchLabel("Searching YouTube…");
        pushTurn(
          "agent",
          "On it — searching YouTube for a clip that matches this question…",
          activeQuestionId,
        );
      }

      const watchdog = window.setTimeout(() => {
        if (!replyLockRef.current) return;
        setCoachBusy(false);
        setFindingVideo(false);
        replyLockRef.current = false;
        pushTurn(
          "agent",
          "Nice try — I'm still with you. Say that again or tell me your next thought.",
          activeQuestionId,
        );
      }, 12_000);

      try {
        const res = await practiceChat(attemptId, activeQuestionId, msg, {
          mode: "voice",
          timeoutMs: 10_000,
        });
        // Ignore late replies if the student already jumped to another question.
        if (questionIdRef.current !== activeQuestionId) return;

        const clean = (
          res.reply || "Got it — tell me more about what you see on the shared screen."
        ).trim();
        if (res.video?.url) {
          setVideoSearchLabel("Opening the best match…");
          setSharedVideo(res.video);
          setSharePhase("shared");
          setFindingVideo(false);
        } else if (wantsVideo) {
          setFindingVideo(false);
        }
        if (coachConfirmsCorrect(clean) || lastCorrectRef.current) {
          lastCorrectRef.current = true;
        }
        pushTurn("agent", clean, activeQuestionId);
        cancelSpeakRef.current?.();
        setSpeaking(true);
        cancelSpeakRef.current = speakNow(forSpeech(clean), {
          onStart: () => setSpeaking(true),
          onEnd: () => setSpeaking(false),
        });
      } catch (err) {
        if (questionIdRef.current !== activeQuestionId) return;
        const fallback =
          err instanceof Error && /timed out|timeout/i.test(err.message)
            ? "Nice try — that took a second. What’s your next thought on the shared question?"
            : err instanceof Error
              ? err.message
              : "I missed that — say it one more time.";
        pushTurn("agent", fallback, activeQuestionId);
        setSpeaking(true);
        cancelSpeakRef.current = speakNow(forSpeech(fallback), {
          onEnd: () => setSpeaking(false),
        });
      } finally {
        window.clearTimeout(watchdog);
        setFindingVideo(false);
        setCoachBusy(false);
        replyLockRef.current = false;
        const queued = followUpRef.current.trim();
        followUpRef.current = "";
        if (queued && queued !== msg) {
          window.setTimeout(() => void askCoachRef.current(queued), 250);
        }
      }
    },
    [attemptId, deck, pushTurn],
  );

  const queueUserSpeech = useCallback((chunk: string) => {
    pendingSpeechRef.current = `${pendingSpeechRef.current} ${chunk}`.trim();
    setLiveCaption(pendingSpeechRef.current);
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      const full = pendingSpeechRef.current.trim();
      pendingSpeechRef.current = "";
      setLiveCaption("");
      if (full) void askCoachRef.current(full);
    }, 700);
  }, []);

  askCoachRef.current = askCoach;
  queueUserSpeechRef.current = queueUserSpeech;

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
    const startId = questionIdRef.current;
    const startIndex = question?.index ?? 1;
    const runShare = () => {
      setSharePhase("sharing");
      pushTurn("agent", buildShareLine(startIndex), startId);
    };
    const runQuestion = () => {
      setSharePhase("shared");
      pushTurn("agent", buildReadyLine(startIndex), startId);
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

    // Hard guarantee: never leave the UI stuck on "Connecting…".
    timers.push(
      setTimeout(() => {
        setSharePhase((phase) => (phase === "shared" ? phase : "shared"));
      }, Math.max(6500, questionDelay + 800)),
    );

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

  // Detect speech while muted (Meet-style “you are muted”).
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || listening || !cameraOn) {
      setTalkingWhileMuted(false);
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let cancelled = false;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let loudFrames = 0;

    try {
      ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (cancelled) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length;
        if (avg > 26) loudFrames += 1;
        else loudFrames = Math.max(0, loudFrames - 2);
        setTalkingWhileMuted(loudFrames >= 6);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      setTalkingWhileMuted(false);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close();
      setTalkingWhileMuted(false);
    };
  }, [listening, cameraOn]);

  // Rotate YouTube search status copy while the agent is looking.
  useEffect(() => {
    if (!findingVideo) return;
    const labels = [
      "Searching YouTube…",
      "Ranking study clips…",
      "Picking the best match…",
      "Opening on the shared screen…",
    ];
    let i = 0;
    setVideoSearchLabel(labels[0]);
    const timer = window.setInterval(() => {
      i = (i + 1) % labels.length;
      setVideoSearchLabel(labels[i]);
    }, 900);
    return () => window.clearInterval(timer);
  }, [findingVideo]);

  // Scroll only the chat panel — never the shared-screen window / page.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length, liveCaption, coachBusy, questionId]);

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
      onFinal: (text) => queueUserSpeechRef.current(text),
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
    if (leftover) void askCoachRef.current(leftover);
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
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="hairline-b z-20 flex shrink-0 items-center justify-between gap-4 bg-background/95 px-4 py-3 backdrop-blur md:px-6">
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

      {sharePhase !== "joining" && (
        <div className="meet-presenting-bar z-20 shrink-0 border-b border-hairline bg-secondary/70 px-4 py-2">
          <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 text-xs text-foreground md:text-sm">
            <ScreenShareIcon />
            <span className="font-medium text-primary">
              {sharePhase === "sharing"
                ? "AI Coach is presenting their screen…"
                : sharedVideo
                  ? `AI Coach is presenting · Q${question.index} + YouTube`
                  : `AI Coach is presenting · Question ${question.index}`}
            </span>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(160px,28vh)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1">
        <section className="relative flex min-h-0 flex-col overflow-hidden p-3 md:p-4">
          <div
            className={
              "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-[#1a1d24] shadow-[var(--shadow-quiet)] " +
              (sharePhase === "shared" ? "meet-share-in" : "")
            }
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#232833] px-3 py-2 md:px-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
                <span className="ml-1 hidden rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80 sm:inline">
                  Screen share
                </span>
              </div>
              <p className="truncate text-xs text-white/65">
                {sharePhase === "joining"
                  ? "Connecting…"
                  : sharePhase === "sharing"
                    ? "Starting presentation…"
                    : `${examTitle} · Q${question.index}`}
              </p>
              <span className="rounded-full bg-[var(--amber)]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--amber-strong)]">
                Q{question.index}/{question.total}
              </span>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(165deg,#f7f4ee_0%,#f3efe6_50%,#ebe4d8_100%)]">
              {sharePhase === "joining" && (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--amber)]/20 font-display text-2xl text-[var(--amber-strong)]">
                    AI
                  </div>
                  <p className="font-display text-xl text-[#1c2430]">Connecting…</p>
                  <p className="text-sm text-[#5b6573]">Your coach will present the exam next.</p>
                </div>
              )}

              {sharePhase === "sharing" && (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6">
                  <div className="meet-share-in w-full max-w-md rounded-2xl border border-black/10 bg-white/70 px-8 py-12 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <ScreenShareIcon className="h-6 w-6" />
                    </div>
                    <p className="font-display text-lg text-[#1c2430]">Presenting screen</p>
                    <p className="mt-1 text-sm text-[#5b6573]">Opening question {question.index}…</p>
                    <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--amber)]" />
                    </div>
                  </div>
                </div>
              )}

              {sharePhase === "shared" && question && (
                <div key={question.id || question.index} className="meet-share-in mx-auto max-w-3xl px-5 py-5 md:px-8 md:py-7">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-black/10 pb-3">
                    <div className="flex items-end gap-3">
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#1c2430] text-white shadow-sm">
                        <span className="text-[9px] uppercase tracking-wider text-white/60">Q</span>
                        <span className="font-display text-2xl leading-none">{question.index}</span>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a6a2f]">
                          Shared exam paper
                        </p>
                        <p className="mt-0.5 font-display text-lg text-[#1c2430] md:text-xl">{examTitle}</p>
                        {question.topic ? (
                          <p className="mt-0.5 text-xs text-[#5b6573]">{question.topic}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-md border border-black/10 bg-white/80 px-3 py-1.5 text-right text-xs text-[#4a5564]">
                      <p className="font-semibold text-[#1c2430]">
                        Question {question.index} of {question.total}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider">Live share</p>
                    </div>
                  </div>

                  {findingVideo && (
                    <div className="meet-share-in mb-5 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
                      <div className="flex items-center gap-2 border-b border-black/10 bg-[#cc0000] px-3 py-2 text-white">
                        <YouTubeIcon />
                        <span className="text-xs font-semibold tracking-wide">YouTube</span>
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-white/80">
                          Agent searching
                        </span>
                      </div>
                      <div className="px-5 py-7 text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#cc0000]/10">
                          <span className="relative flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#cc0000] opacity-60" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#cc0000]" />
                          </span>
                        </div>
                        <p className="font-display text-lg text-[#1c2430]">{videoSearchLabel}</p>
                        <p className="mt-1 text-sm text-[#5b6573]">
                          Looking up clips for Q{question.index}
                          {question.topic ? ` · ${question.topic}` : ""}
                        </p>
                        <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-black/10">
                          <div className="h-full w-3/5 animate-pulse rounded-full bg-[#cc0000]" />
                        </div>
                        <ul className="mx-auto mt-5 max-w-xs space-y-1.5 text-left text-[11px] text-[#5b6573]">
                          <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#cc0000]" /> Scanning YouTube results
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#cc0000]/70" /> Matching this exam question
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-black/20" /> Will open the best clip here
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {sharedVideo?.url && !findingVideo && (
                    <div className="meet-share-in mb-5 overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
                      <div className="flex items-center gap-2 border-b border-black/10 bg-[#cc0000] px-3 py-2 text-white">
                        <YouTubeIcon />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {sharedVideo.title || "YouTube video"}
                        </span>
                        <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          Shared by AI
                        </span>
                      </div>
                      {youtubeEmbedId(sharedVideo.url) ? (
                        <div className="aspect-video w-full bg-black">
                          <iframe
                            title={sharedVideo.title || "YouTube video"}
                            src={`https://www.youtube.com/embed/${youtubeEmbedId(sharedVideo.url)}?rel=0`}
                            className="h-full w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center text-sm">
                          <a
                            href={sharedVideo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--amber-strong)] underline-offset-2 hover:underline"
                          >
                            Open on YouTube
                          </a>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 border-t border-black/10 bg-[#f7f4ee] px-3 py-2 text-[11px] text-[#5b6573]">
                        <span>Playing on the shared screen</span>
                        <a
                          href={sharedVideo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#cc0000] underline-offset-2 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    </div>
                  )}

                  <p className="font-display text-xl leading-relaxed text-[#1a2230] md:text-2xl md:leading-[1.4]">
                    {question.text}
                  </p>
                  {question.choices.length > 0 && (
                    <ul className="mt-5 space-y-2.5">
                      {question.choices.map((choice, i) => (
                        <li
                          key={`${i}-${choice}`}
                          className="flex gap-3 rounded-lg border border-black/10 bg-white/80 px-4 py-3 text-sm leading-relaxed text-[#243041]"
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1c2430]/10 text-xs font-semibold text-[#1c2430]">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{stripChoiceLetter(choice)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Jump between exam questions on the shared screen */}
                  {deck.length > 1 && (
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
                      <button
                        type="button"
                        disabled={cursor <= 0}
                        onClick={() => goToQuestion(cursor - 1)}
                        className="rounded-lg border border-black/15 bg-white/90 px-4 py-2 text-sm font-medium text-[#1c2430] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ← Previous
                      </button>
                      <p className="text-xs text-[#5b6573]">
                        Q{question.index} / {question.total}
                      </p>
                      <button
                        type="button"
                        disabled={cursor >= deck.length - 1}
                        onClick={() => goToQuestion(cursor + 1)}
                        className="rounded-lg border border-black/15 bg-white/90 px-4 py-2 text-sm font-medium text-[#1c2430] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col gap-2 md:bottom-5 md:right-5">
            <div
              className={
                "overflow-hidden rounded-xl border border-white/20 bg-[#232833] shadow-lg " +
                (speaking || coachBusy ? "ring-2 ring-[var(--amber)]/55" : "")
              }
            >
              <div className="flex h-20 w-28 flex-col items-center justify-center md:h-24 md:w-36">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--amber)]/25 font-display text-base text-[var(--amber-strong)]">
                  AI
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-white/55">Coach</p>
              </div>
              {(speaking || coachBusy) && (
                <p className="border-t border-white/10 bg-black/30 px-2 py-1 text-center text-[10px] text-[var(--amber-strong)]">
                  {coachBusy ? (findingVideo ? "Finding video" : "Thinking") : "Speaking"}
                </p>
              )}
            </div>
            <div className="relative h-20 w-28 overflow-hidden rounded-xl border border-white/20 bg-black shadow-lg md:h-24 md:w-36">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-wider text-white/55">
                  You
                </div>
              )}
              {listening ? (
                <span className="absolute bottom-1 left-1 rounded bg-[var(--amber-strong)] px-1.5 py-0.5 text-[10px] text-white">
                  Mic on
                </span>
              ) : (
                <span
                  className={
                    "absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] text-white " +
                    (talkingWhileMuted ? "bg-[var(--rust)]" : "bg-black/55")
                  }
                >
                  {talkingWhileMuted ? "Muted!" : "Muted"}
                </span>
              )}
            </div>
          </div>

          {(talkingWhileMuted || captionText || listening) && (
            <div className="meet-caption-in pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-center lg:bottom-5">
              {talkingWhileMuted && !listening ? (
                <button
                  type="button"
                  onClick={() => void toggleMic()}
                  className="pointer-events-auto max-w-xl rounded-lg bg-[var(--rust)] px-4 py-2.5 text-center text-sm font-medium leading-relaxed text-white shadow-lg"
                >
                  You are muted — tap to unmute
                </button>
              ) : (
                <p
                  className="max-w-xl rounded-lg bg-[#1c2430]/92 px-4 py-2 text-center text-sm leading-relaxed text-white shadow-lg"
                  aria-live="polite"
                >
                  {captionText || "Listening…"}
                </p>
              )}
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden border-t border-hairline bg-background lg:border-l lg:border-t-0">
          <p className="eyebrow shrink-0 border-b border-hairline px-4 py-3">
            Call chat · Q{question?.index ?? "?"}
          </p>
          <ol
            ref={chatScrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 text-sm"
            aria-live="polite"
          >
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
                <span className={turn.who === "agent" ? "text-primary" : "text-foreground"}>
                  {turn.text}
                </span>
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
          </ol>
        </aside>
      </div>

      <footer className="z-20 shrink-0 border-t border-hairline bg-background px-4 py-3 md:px-6">
        {connectionError && (
          <p role="alert" className="mx-auto mb-2 max-w-lg text-center text-sm text-destructive">
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
              "flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[var(--shadow-quiet)] transition-transform md:h-14 md:w-14 " +
              (listening
                ? "bg-[var(--amber-strong)] hover:brightness-105"
                : "bg-primary hover:bg-primary/90")
            }
          >
            <MicIcon muted={!listening} />
          </button>
          <div className="min-w-0 text-left text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              {talkingWhileMuted && !listening
                ? "You are muted"
                : listening
                  ? "Unmuted — talk now"
                  : speaking
                    ? "Coach speaking"
                    : coachBusy
                      ? findingVideo
                        ? "Searching YouTube"
                        : "Coach thinking"
                      : "Muted"}
            </p>
            <p className="truncate">
              {talkingWhileMuted && !listening
                ? "Unmute to be heard"
                : "Chat scrolls on the side · shared screen stays put"}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function detectQuestionNav(
  message: string,
  _cursor: number,
  total: number,
): { kind: "next" } | { kind: "prev" } | { kind: "goto"; index: number } | null {
  const t = message.toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  const numbered =
    t.match(
      /\b(?:go to|jump to|open|show|move to)\s+(?:question\s+|q\s*)?(\d+)\b/,
    ) || t.match(/\b(?:question|q)\s*(\d+)\b/);
  if (numbered) {
    const n = Number(numbered[1]);
    if (Number.isFinite(n) && n >= 1 && n <= total) return { kind: "goto", index: n - 1 };
  }

  if (
    /\b(previous question|prev question|go back|go to the previous|last question|prior question)\b/.test(
      t,
    ) ||
    /^(previous|prev|go back)$/.test(t)
  ) {
    return { kind: "prev" };
  }

  if (
    /\b(next questions?|go to the next|move to the next|move on to|skip (this|ahead)|following question|next one|another question)\b/.test(
      t,
    ) ||
    /\b(can you |could you |please |let'?s |lets )?(go |move |jump |switch )?(to )?(the )?next\b/.test(
      t,
    ) ||
    /^(next|next please|next one|move on)$/.test(t)
  ) {
    return { kind: "next" };
  }

  return null;
}

/** After a correct answer, short confirmations also mean “advance”. */
function wantsAdvanceAfterCorrect(message: string): boolean {
  const t = message.toLowerCase().replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (
    /^(yes|yeah|yep|yup|ok|okay|sure|please|go ahead|let'?s go|lets go|continue|move on|next)$/.test(
      t,
    )
  ) {
    return true;
  }
  return (
    /\b(yes|yeah|ok|okay|sure).{0,24}\b(next|continue|move on|go ahead)\b/.test(t) ||
    /\b(continue|move on|go ahead|keep going)\b/.test(t)
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
  const letter = b.match(/^([a-d])\b/);
  if (letter && a.startsWith(letter[1])) return true;
  return false;
}

function messageLooksCorrect(message: string, q: QuestionCard): boolean {
  const ref = (q.referenceAnswer || "").trim();
  if (!ref) return false;
  const t = message.trim();
  if (answersRoughlyMatch(ref, t)) return true;

  const letterHit = t.match(
    /\b(?:(?:the\s+)?(?:answer|option|choice)\s*(?:is\s*)?|i\s*(?:think|pick|choose|go\s+with)\s*)([a-d])\b/i,
  ) || t.match(/^\s*([a-d])\s*[.)]?\s*$/i);
  if (letterHit) {
    const letter = letterHit[1].toUpperCase();
    if (ref.trim().toUpperCase().startsWith(letter)) return true;
    for (const choice of q.choices || []) {
      if (
        choice.trim().toUpperCase().startsWith(letter) &&
        answersRoughlyMatch(ref, choice)
      ) {
        return true;
      }
    }
  }

  for (const choice of q.choices || []) {
    const body = stripChoiceLetter(choice);
    if (body.length >= 3 && answersRoughlyMatch(ref, choice) && answersRoughlyMatch(body, t)) {
      return true;
    }
  }
  return false;
}

function coachConfirmsCorrect(reply: string): boolean {
  return /\b(that'?s correct|you(?:'re| are) correct|that is correct|that'?s right|that is right|exactly|nailed it|you got it|spot on|well done|you(?:'re| are) right)\b/i.test(
    reply,
  );
}

function stripChoiceLetter(choice: string): string {
  return choice.replace(/^[A-Da-d][.)]\s*/, "").trim() || choice;
}

function youtubeEmbedId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
  return m?.[1] ?? null;
}

function YouTubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z" />
    </svg>
  );
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
