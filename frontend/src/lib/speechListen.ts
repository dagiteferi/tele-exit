/** Browser SpeechRecognition for live study-call captions. */

export type SpeechListenHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
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
    0: { transcript: string };
  }>;
};

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

export function createSpeechListener(handlers: SpeechListenHandlers): {
  start: () => void;
  stop: () => void;
} {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Speech recognition isn’t supported in this browser — try Chrome.");
    return { start: () => undefined, stop: () => undefined };
  }

  let recognition: RecognitionLike | null = null;
  let intentionalStop = false;

  function start() {
    intentionalStop = false;
    const Recognition = getRecognitionCtor();
    if (!Recognition) {
      handlers.onError?.("Speech recognition isn’t supported in this browser — try Chrome.");
      return;
    }
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    }
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalChunk += piece;
        else interim += piece;
      }
      if (interim.trim()) handlers.onInterim?.(interim.trim());
      if (finalChunk.trim()) {
        handlers.onInterim?.("");
        handlers.onFinal?.(finalChunk.trim());
      }
    };

    recognition.onerror = (event) => {
      const code = event.error || "error";
      if (code === "aborted" || code === "no-speech") return;
      handlers.onError?.(
        code === "not-allowed"
          ? "Microphone permission is needed so captions can show what you say."
          : `Couldn’t hear you (${code}).`,
      );
    };

    recognition.onend = () => {
      // Chrome stops periodically — restart while still intended to listen.
      if (!intentionalStop && recognition) {
        try {
          recognition.start();
          return;
        } catch {
          // ignore restart races
        }
      }
      handlers.onEnd?.();
    };

    try {
      recognition.start();
    } catch {
      handlers.onError?.("Couldn’t start listening.");
    }
  }

  function stop() {
    intentionalStop = true;
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

  return { start, stop };
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
