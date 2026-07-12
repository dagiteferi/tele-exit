/** Browser SpeechRecognition for live study-call captions. */

export type SpeechListenHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export type SpeechListener = {
  start: () => void;
  stop: () => void;
  /** Drop results while the coach is talking (cuts echo/noise into captions). */
  pause: () => void;
  resume: () => void;
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    length: number;
    0: { transcript: string; confidence?: number };
    [index: number]: { transcript: string; confidence?: number };
  }>;
};

/** Prefer a clean mic: echo cancel + noise suppress + auto gain. */
export const CALL_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

export async function getCallMediaStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(CALL_MEDIA_CONSTRAINTS);
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechRecognitionSupported(): boolean {
  return !!getRecognitionCtor();
}

/** Normalize STT text for captions + coach (trim filler noise, keep meaning). */
export function cleanSpeechTranscript(raw: string): string {
  let t = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop leading filler that often comes from room noise.
  t = t.replace(/^(um+|uh+|erm+|ah+|hmm+|mm+)\b[\s,]*/gi, "").trim();
  t = t.replace(/\b(um+|uh+|erm+)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function isNoiseOnly(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t.length < 2) return true;
  // Single filler tokens / breath noise.
  if (/^(um+|uh+|erm+|ah+|hmm+|mm+|oh|a|i)$/i.test(t)) return true;
  // Mostly non-letters (clicks / static decoded oddly).
  const letters = (t.match(/[a-z]/gi) || []).length;
  if (letters < 2 && t.length < 6) return true;
  return false;
}

function bestAlternative(result: SpeechRecognitionEventLike["results"][number]): {
  transcript: string;
  confidence: number;
} {
  let best = { transcript: "", confidence: -1 };
  const n = result.length || 1;
  for (let i = 0; i < n; i += 1) {
    const alt = result[i];
    if (!alt) continue;
    const confidence = typeof alt.confidence === "number" ? alt.confidence : 0.5;
    if (confidence >= best.confidence) {
      best = { transcript: alt.transcript || "", confidence };
    }
  }
  if (!best.transcript && result[0]) {
    best = {
      transcript: result[0].transcript || "",
      confidence: typeof result[0].confidence === "number" ? result[0].confidence : 0.5,
    };
  }
  return best;
}

export function createSpeechListener(handlers: SpeechListenHandlers): SpeechListener {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Speech recognition isn’t supported in this browser — try Chrome.");
    return {
      start: () => undefined,
      stop: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
    };
  }

  let recognition: RecognitionLike | null = null;
  let intentionalStop = false;
  let paused = false;
  let wantListen = false;
  let restartTimer: number | null = null;

  function clearRestart() {
    if (restartTimer != null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function bindHandlers(rec: RecognitionLike) {
    rec.onresult = (event) => {
      if (paused || intentionalStop) return;
      let interim = "";
      let finalChunk = "";
      let minConfidence = 1;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const best = bestAlternative(result);
        const piece = cleanSpeechTranscript(best.transcript);
        if (!piece) continue;
        if (result.isFinal) {
          finalChunk = `${finalChunk} ${piece}`.trim();
          minConfidence = Math.min(minConfidence, best.confidence);
        } else {
          interim = `${interim} ${piece}`.trim();
        }
      }

      if (interim && !isNoiseOnly(interim)) {
        handlers.onInterim?.(interim);
      }
      if (finalChunk) {
        // Keep low-confidence finals only if they look like real words.
        if (minConfidence < 0.25 && finalChunk.split(/\s+/).length < 2) {
          return;
        }
        if (isNoiseOnly(finalChunk)) return;
        handlers.onInterim?.("");
        handlers.onFinal?.(finalChunk);
      }
    };

    rec.onerror = (event) => {
      const code = event.error || "error";
      if (code === "aborted" || code === "no-speech" || code === "audio-capture") return;
      if (paused) return;
      handlers.onError?.(
        code === "not-allowed"
          ? "Microphone permission is needed so captions can show what you say."
          : code === "network"
            ? "Speech service hiccup — keep talking; I’ll reconnect."
            : `Couldn’t hear you clearly (${code}).`,
      );
    };

    rec.onend = () => {
      if (intentionalStop || !wantListen) {
        handlers.onEnd?.();
        return;
      }
      // Chrome stops periodically — restart after a short beat while unmuted.
      clearRestart();
      restartTimer = window.setTimeout(() => {
        if (intentionalStop || !wantListen || paused) return;
        try {
          recognition?.start();
        } catch {
          try {
            bootRecognition();
          } catch {
            // ignore restart races
          }
        }
      }, 180);
    };
  }

  function bootRecognition() {
    const Recognition = getRecognitionCtor();
    if (!Recognition) return;
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.abort();
      } catch {
        // ignore
      }
    }
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 3;
    bindHandlers(recognition);
    recognition.start();
  }

  function start() {
    intentionalStop = false;
    wantListen = true;
    paused = false;
    clearRestart();
    try {
      bootRecognition();
    } catch {
      handlers.onError?.("Couldn’t start listening.");
    }
  }

  function stop() {
    intentionalStop = true;
    wantListen = false;
    paused = false;
    clearRestart();
    if (!recognition) return;
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    }
    recognition = null;
  }

  function pause() {
    if (!wantListen || paused) return;
    paused = true;
    clearRestart();
    handlers.onInterim?.("");
    if (!recognition) return;
    try {
      recognition.onend = null;
      recognition.abort();
    } catch {
      // ignore
    }
    recognition = null;
  }

  function resume() {
    if (!wantListen || !paused) return;
    paused = false;
    intentionalStop = false;
    try {
      bootRecognition();
    } catch {
      // ignore
    }
  }

  return { start, stop, pause, resume };
}

/** Strip markdown so TTS sounds natural. */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}
