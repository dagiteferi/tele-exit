/** Browser Web Speech helpers for the study-call opening. */

let resumeTimer: number | null = null;

export function warmVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}

export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find(
      (v) =>
        /en(-|_)?(US|GB)/i.test(v.lang) &&
        /Google|Natural|Samantha|Neural|Microsoft/i.test(v.name),
    ) ||
    voices.find((v) => v.lang.toLowerCase().startsWith("en")) ||
    voices[0] ||
    null
  );
}

export function buildCallOpening(examTitle: string, questionIndex: number): string {
  const name = (examTitle || "").trim() || "this exam";
  return (
    `Hi! Welcome to your study call. Let's work through ${name}. ` +
    `Give me a second — let me share my screen so you can see the exam question. ` +
    `Alright, sharing now. Here's question ${questionIndex}. ` +
    `Take a look at the screen, and tell me when you're ready.`
  );
}

/** @deprecated use buildCallOpening */
export function buildWelcomeLine(examTitle: string, questionIndex: number): string {
  return buildCallOpening(examTitle, questionIndex);
}

function startResumeKeepAlive() {
  stopResumeKeepAlive();
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  // Chrome often pauses TTS mid-sentence; nudge it back.
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

/**
 * Speak immediately from a click handler so browsers allow audio.
 * Keeps speaking across SPA navigation to /call.
 */
export function speakNow(
  text: string,
  opts?: { onEnd?: () => void; onStart?: () => void },
): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    opts?.onEnd?.();
    return () => undefined;
  }

  window.speechSynthesis.cancel();
  warmVoices();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.92;
  utter.pitch = 1.02;
  utter.volume = 1;
  const voice = pickEnglishVoice();
  if (voice) utter.voice = voice;

  utter.onstart = () => {
    startResumeKeepAlive();
    opts?.onStart?.();
  };
  utter.onend = () => {
    stopResumeKeepAlive();
    opts?.onEnd?.();
  };
  utter.onerror = () => {
    stopResumeKeepAlive();
    opts?.onEnd?.();
  };

  // Must stay synchronous with the user gesture — no setTimeout before speak().
  window.speechSynthesis.speak(utter);
  window.speechSynthesis.resume();

  return () => {
    utter.onstart = null;
    utter.onend = null;
    utter.onerror = null;
    stopResumeKeepAlive();
    window.speechSynthesis.cancel();
  };
}

/** Estimated UI cue times for the opening script (ms from speak start). */
export const CALL_OPENING_CUES = {
  sharingMs: 4200,
  questionMs: 7800,
} as const;
