/** Browser Web Speech helpers for the study-call opening. */

import { getCoachPrefs, resolveCoachVoice } from "@/lib/coachPrefs";

let resumeTimer: number | null = null;

export function warmVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  return resolveCoachVoice(getCoachPrefs());
}

export function buildCallOpening(examTitle: string, questionIndex: number): string {
  const name = (examTitle || "").trim() || "this exam";
  const q = questionIndex;

  const openings = [
    `Hey! Great to see you. Let's jump into ${name}. I'll share my screen so you can see question ${q}. Take a look, and tell me when you're ready.`,
    `Welcome back. Today we're working through ${name}. Give me a moment to share the exam paper — here's question ${q}. What stands out to you first?`,
    `Hi there — ready to practice? We'll tackle ${name} together. I'm sharing my screen now with question ${q}. Tell me your first instinct whenever you're set.`,
    `Let's get started on ${name}. I'll pull up the shared screen so you can see question ${q}. No pressure — walk me through how you'd begin.`,
    `Nice timing. For ${name}, I'm sharing question ${q} on screen. Glance at it, then unmute and talk me through your thinking.`,
    `Alright, study call is live. We'll focus on ${name}, starting at question ${q}. Screen share coming up — are you ready to reason out loud?`,
    `Hello! I've got ${name} ready. Let me share my screen and show you question ${q}. When you're ready, tell me how you'd approach it.`,
    `Good to have you here. Let's practice ${name} from question ${q}. I'm sharing the question now — take a breath, then say what you'd try first.`,
  ];

  const pick =
    (Date.now() + q * 17 + Math.floor(Math.random() * openings.length)) % openings.length;
  return openings[pick] ?? openings[0];
}

export function buildShareLine(questionIndex: number): string {
  const lines = [
    `Let me share my screen so you can see question ${questionIndex}…`,
    `Sharing the exam paper now — question ${questionIndex} coming up…`,
    `One sec — putting question ${questionIndex} on the shared screen…`,
    `Okay, presenting my screen with question ${questionIndex}…`,
  ];
  return lines[(Date.now() + questionIndex) % lines.length] ?? lines[0];
}

export function buildReadyLine(questionIndex: number): string {
  const lines = [
    `Here's question ${questionIndex}. Unmute and talk — you'll see your words on screen.`,
    `Question ${questionIndex} is on the shared screen. When you're ready, say your first thought out loud.`,
    `Take a look at question ${questionIndex}. Unmute anytime and walk me through it.`,
    `Question ${questionIndex} is up. Tell me what you'd try first — I'm listening.`,
  ];
  return lines[(Date.now() + questionIndex * 3) % lines.length] ?? lines[0];
}

export function buildJoiningLine(): string {
  const lines = [
    "Welcome — connecting your study call…",
    "Joining your coach now…",
    "Setting up your live study session…",
    "Almost in — connecting to your AI coach…",
  ];
  return lines[Date.now() % lines.length] ?? lines[0];
}

/** @deprecated use buildCallOpening */
export function buildWelcomeLine(examTitle: string, questionIndex: number): string {
  return buildCallOpening(examTitle, questionIndex);
}

function startResumeKeepAlive() {
  stopResumeKeepAlive();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  resumeTimer = window.setInterval(() => {
    try {
      if (window.speechSynthesis.paused || window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    } catch {
      // ignore
    }
  }, 2500);
}

function stopResumeKeepAlive() {
  if (resumeTimer != null) {
    window.clearInterval(resumeTimer);
    resumeTimer = null;
  }
}

/** Stop coach TTS everywhere (leave call, navigate away, failed start). */
export function stopAllSpeech() {
  stopResumeKeepAlive();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/**
 * Speak immediately from a click handler so browsers allow audio.
 * Uses Settings → coach voice / rate / pitch when available.
 */
export function speakNow(
  text: string,
  opts?: { onEnd?: () => void; onStart?: () => void },
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    opts?.onEnd?.();
    return () => undefined;
  }

  stopAllSpeech();
  warmVoices();

  const prefs = getCoachPrefs();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = prefs.rate;
  utter.pitch = prefs.pitch;
  utter.volume = 1;
  const voice = resolveCoachVoice(prefs);
  if (voice) utter.voice = voice;

  let cancelled = false;
  utter.onstart = () => {
    if (cancelled) return;
    startResumeKeepAlive();
    opts?.onStart?.();
  };
  utter.onend = () => {
    stopResumeKeepAlive();
    if (!cancelled) opts?.onEnd?.();
  };
  utter.onerror = () => {
    stopResumeKeepAlive();
    if (!cancelled) opts?.onEnd?.();
  };

  window.speechSynthesis.speak(utter);
  window.speechSynthesis.resume();

  return () => {
    cancelled = true;
    utter.onstart = null;
    utter.onend = null;
    utter.onerror = null;
    stopAllSpeech();
  };
}

export const CALL_OPENING_CUES = {
  sharingMs: 2800,
  questionMs: 5200,
} as const;
