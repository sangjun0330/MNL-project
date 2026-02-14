export type RecorderChunk = {
  chunkId: string;
  blob: Blob;
  startMs: number;
  endMs: number;
  durationMs: number;
  overlapMs: number;
  mimeType: string;
};

export type HandoffRecorderStatus = "idle" | "recording" | "stopping";

type HandoffRecorderOptions = {
  chunkMs?: number;
  overlapMs?: number;
  preferredMimeType?: string;
  onChunk?: (chunk: RecorderChunk) => void | Promise<void>;
  onError?: (error: unknown) => void;
};

export type HandoffRecorderController = {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  destroy: () => Promise<void>;
};

const DEFAULT_CHUNK_MS = 30_000;
const DEFAULT_OVERLAP_MS = 800;

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

function getMediaRecorderClass() {
  if (typeof window === "undefined") return null;
  return window.MediaRecorder ?? null;
}

type CapacitorChunkPayload = {
  chunkId?: string;
  startMs?: number;
  endMs?: number;
  mimeType?: string;
  chunkBase64?: string;
};

type CapacitorListenerHandle = {
  remove: () => Promise<void> | void;
};

type CapacitorHandoffRecorderPlugin = {
  start: (options: { chunkMs: number; overlapMs: number }) => Promise<void>;
  stop: () => Promise<void>;
  addListener?: (
    eventName: "handoffChunk",
    listener: (payload: CapacitorChunkPayload) => void
  ) => Promise<CapacitorListenerHandle> | CapacitorListenerHandle;
};

function getCapacitorRecorderPlugin(): CapacitorHandoffRecorderPlugin | null {
  if (typeof window === "undefined") return null;
  const plugin = (window as any)?.Capacitor?.Plugins?.HandoffRecorder;
  if (!plugin || typeof plugin.start !== "function" || typeof plugin.stop !== "function") {
    return null;
  }
  return plugin as CapacitorHandoffRecorderPlugin;
}

function base64ToBlob(base64: string, mimeType: string) {
  if (typeof atob !== "function") return null;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function isHandoffRecorderSupported() {
  if (getCapacitorRecorderPlugin()) return true;
  if (typeof window === "undefined") return false;
  if (!window.navigator?.mediaDevices?.getUserMedia) return false;
  return Boolean(getMediaRecorderClass());
}

function pickSupportedMimeType(preferred?: string) {
  const MediaRecorderClass = getMediaRecorderClass();
  if (!MediaRecorderClass) return "audio/webm";

  if (preferred && MediaRecorderClass.isTypeSupported(preferred)) return preferred;
  for (const candidate of MIME_CANDIDATES) {
    if (MediaRecorderClass.isTypeSupported(candidate)) return candidate;
  }
  return "audio/webm";
}

export function createHandoffRecorder(options?: HandoffRecorderOptions): HandoffRecorderController {
  const chunkMs = Math.max(20_000, Math.min(40_000, options?.chunkMs ?? DEFAULT_CHUNK_MS));
  const overlapMs = Math.max(500, Math.min(1_000, options?.overlapMs ?? DEFAULT_OVERLAP_MS));

  let running = false;
  let nativeMode = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let nativePlugin: CapacitorHandoffRecorderPlugin | null = null;
  let nativeListener: CapacitorListenerHandle | null = null;
  let startedAt = 0;
  let logicalEndMs = 0;
  let chunkIndex = 0;

  const onChunk = options?.onChunk;
  const onError = options?.onError;

  const detach = async () => {
    running = false;

    if (nativeMode && nativePlugin) {
      try {
        await nativePlugin.stop();
      } catch {
        // noop
      }

      try {
        await nativeListener?.remove?.();
      } catch {
        // noop
      }

      nativeListener = null;
      nativePlugin = null;
      nativeMode = false;
    }

    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        recorder?.addEventListener("stop", done, { once: true });
        try {
          recorder?.stop();
        } catch {
          resolve();
        }
      });
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    recorder = null;
    stream = null;
  };

  return {
    async start() {
      if (running) return true;
      if (!isHandoffRecorderSupported()) return false;

      try {
        const capacitorPlugin = getCapacitorRecorderPlugin();
        if (capacitorPlugin) {
          nativePlugin = capacitorPlugin;
          nativeMode = true;
          startedAt = getNowMs();
          logicalEndMs = 0;
          chunkIndex = 0;
          running = true;

          if (typeof nativePlugin.addListener === "function") {
            nativeListener = await nativePlugin.addListener("handoffChunk", (payload) => {
              if (!running) return;
              if (!payload?.chunkBase64) return;

              const mimeType = payload.mimeType ?? "audio/webm";
              const blob = base64ToBlob(payload.chunkBase64, mimeType);
              if (!blob) return;

              chunkIndex += 1;
              const startMs = typeof payload.startMs === "number"
                ? payload.startMs
                : Math.max(0, logicalEndMs - overlapMs);
              const endMs = typeof payload.endMs === "number"
                ? payload.endMs
                : Math.max(startMs + 250, Math.round(getNowMs() - startedAt));

              logicalEndMs = endMs;

              const chunk: RecorderChunk = {
                chunkId: payload.chunkId ?? `chunk-${String(chunkIndex).padStart(3, "0")}`,
                blob,
                startMs,
                endMs,
                durationMs: endMs - startMs,
                overlapMs,
                mimeType,
              };

              Promise.resolve(onChunk?.(chunk)).catch((error) => {
                onError?.(error);
              });
            });
          }

          await nativePlugin.start({ chunkMs, overlapMs });
          return true;
        }

        const MediaRecorderClass = getMediaRecorderClass();
        if (!MediaRecorderClass) return false;

        stream = await window.navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16_000,
          },
        });

        const mimeType = pickSupportedMimeType(options?.preferredMimeType);
        recorder = new MediaRecorderClass(stream, { mimeType, audioBitsPerSecond: 96_000 });

        startedAt = getNowMs();
        logicalEndMs = 0;
        chunkIndex = 0;
        running = true;

        recorder.addEventListener("dataavailable", (event: BlobEvent) => {
          if (!running) return;
          if (!event.data || event.data.size === 0) return;

          chunkIndex += 1;
          const elapsedEndMs = Math.max(1, Math.round(getNowMs() - startedAt));
          const startMs = Math.max(0, logicalEndMs - overlapMs);
          const endMs = Math.max(startMs + 250, elapsedEndMs);
          logicalEndMs = endMs;

          const chunk: RecorderChunk = {
            chunkId: `chunk-${String(chunkIndex).padStart(3, "0")}`,
            blob: event.data,
            startMs,
            endMs,
            durationMs: endMs - startMs,
            overlapMs,
            mimeType: recorder?.mimeType ?? mimeType,
          };

          Promise.resolve(onChunk?.(chunk)).catch((error) => {
            onError?.(error);
          });
        });

        recorder.addEventListener("error", (event) => {
          onError?.((event as any).error ?? new Error("녹음 처리 중 오류가 발생했습니다."));
        });

        recorder.start(chunkMs);
        return true;
      } catch (error) {
        onError?.(error);
        await detach();
        return false;
      }
    },

    async stop() {
      if (!running) return;
      await detach();
    },

    isRunning() {
      return running;
    },

    async destroy() {
      await detach();
    },
  };
}
