export type LocalAsrSegment = {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
};

type LocalAsrOptions = {
  lang?: string;
  onFinalSegment?: (segment: LocalAsrSegment) => void;
  onError?: (error: unknown) => void;
};

export type LocalAsrController = {
  start: () => boolean;
  stop: () => void;
  destroy: () => void;
  isRunning: () => boolean;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function splitFinalText(text: string) {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getAsrCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  return (ctor as SpeechRecognitionCtor | undefined) ?? null;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

export function isLocalSpeechAsrSupported() {
  return Boolean(getAsrCtor());
}

export function createLocalSpeechAsr(options?: LocalAsrOptions): LocalAsrController {
  const ctor = getAsrCtor();

  if (!ctor) {
    return {
      start: () => false,
      stop: () => undefined,
      destroy: () => undefined,
      isRunning: () => false,
    };
  }

  const recognition = new ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options?.lang ?? "ko-KR";
  recognition.maxAlternatives = 1;

  let running = false;
  let startEpoch = 0;
  let lastEndMs = 0;

  const onFinalSegment = options?.onFinalSegment;
  const onError = options?.onError;

  recognition.onresult = (event: any) => {
    const currentMs = Math.max(1, Math.round(nowMs() - startEpoch));

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const res = event.results[i];
      if (!res?.isFinal) continue;

      const alt = res[0];
      const rawText = String(alt?.transcript ?? "").trim();
      if (!rawText) continue;

      const lines = splitFinalText(rawText);
      lines.forEach((line) => {
        const endMs = Math.max(lastEndMs + 250, currentMs);
        const estimatedDuration = Math.max(1_200, Math.min(7_500, line.length * 150));
        const startMs = Math.max(0, endMs - estimatedDuration);
        lastEndMs = endMs;

        onFinalSegment?.({
          text: line,
          startMs,
          endMs,
          confidence: typeof alt?.confidence === "number" ? Number(alt.confidence) : null,
        });
      });
    }
  };

  recognition.onerror = (event: any) => {
    onError?.(event?.error ?? new Error("ASR 처리 중 오류가 발생했습니다."));
  };

  recognition.onend = () => {
    if (!running) return;
    try {
      recognition.start();
    } catch {
      // 브라우저가 중복 start를 막을 수 있으므로 무시하고 다음 이벤트를 기다린다.
    }
  };

  return {
    start() {
      if (running) return true;
      running = true;
      startEpoch = nowMs();
      try {
        recognition.start();
        return true;
      } catch (error) {
        running = false;
        onError?.(error);
        return false;
      }
    },

    stop() {
      if (!running) return;
      running = false;
      try {
        recognition.stop();
      } catch {
        // stop 실패 시 abort로 종료 시도
        try {
          recognition.abort();
        } catch {
          // noop
        }
      }
    },

    destroy() {
      running = false;
      try {
        recognition.abort();
      } catch {
        // noop
      }
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    },

    isRunning() {
      return running;
    },
  };
}
