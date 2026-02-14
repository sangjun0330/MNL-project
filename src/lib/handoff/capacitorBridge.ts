const SECURE_PREFIX = "wnl:secure:";
const STRICT_PROFILE = "strict";

type CapacitorChunkPayload = {
  chunkId: string;
  startMs: number;
  endMs: number;
  mimeType: string;
  chunkBase64: string;
};

type ChunkListener = (payload: CapacitorChunkPayload) => void;

type HandoffRecorderPlugin = {
  start: (options: { chunkMs: number; overlapMs: number }) => Promise<void>;
  stop: () => Promise<void>;
  addListener: (
    eventName: "handoffChunk",
    listener: ChunkListener
  ) => Promise<{ remove: () => Promise<void> }>;
};

type HandoffSecureStorePlugin = {
  set: (input: { key: string; value: string }) => Promise<void>;
  get: (input: { key: string }) => Promise<{ value: string | null }>;
  remove: (input: { key: string }) => Promise<void>;
};

function getWindow() {
  if (typeof window === "undefined") return null;
  return window;
}

function isStrictProfile() {
  return String(process.env.NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE ?? "").trim().toLowerCase() === STRICT_PROFILE;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  return toBase64(new Uint8Array(buffer));
}

export function ensureHandoffCapacitorBridge() {
  const w = getWindow();
  if (!w) return;

  const cap = ((w as any).Capacitor ??= {});
  const plugins = (cap.Plugins ??= {});

  if (!plugins.HandoffSecureStore) {
    const memoryStore: Record<string, string> = {};
    const securePlugin: HandoffSecureStorePlugin = {
      async set({ key, value }) {
        if (isStrictProfile()) {
          memoryStore[key] = value;
          return;
        }
        w.localStorage.setItem(`${SECURE_PREFIX}${key}`, value);
      },
      async get({ key }) {
        if (isStrictProfile()) {
          return { value: typeof memoryStore[key] === "string" ? memoryStore[key] : null };
        }
        return { value: w.localStorage.getItem(`${SECURE_PREFIX}${key}`) };
      },
      async remove({ key }) {
        if (isStrictProfile()) {
          delete memoryStore[key];
          return;
        }
        w.localStorage.removeItem(`${SECURE_PREFIX}${key}`);
      },
    };

    plugins.HandoffSecureStore = securePlugin;
  }

  const canInstallWebRecorder =
    typeof w.navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof (w as any).MediaRecorder !== "undefined";

  if (!plugins.HandoffRecorder && canInstallWebRecorder) {
    const listeners = new Set<ChunkListener>();
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let chunkIndex = 0;
    let startedAt = 0;
    let logicalEndMs = 0;
    let overlapMs = 800;

    const emitChunk = async (blob: Blob, mimeType: string) => {
      if (!blob.size) return;

      chunkIndex += 1;
      const elapsed = Math.max(1, Math.round(performance.now() - startedAt));
      const startMs = Math.max(0, logicalEndMs - overlapMs);
      const endMs = Math.max(startMs + 250, elapsed);
      logicalEndMs = endMs;

      const payload: CapacitorChunkPayload = {
        chunkId: `chunk-${String(chunkIndex).padStart(3, "0")}`,
        startMs,
        endMs,
        mimeType,
        chunkBase64: await blobToBase64(blob),
      };

      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {
          // noop
        }
      });
    };

    const recorderPlugin: HandoffRecorderPlugin = {
      async addListener(eventName, listener) {
        if (eventName !== "handoffChunk") {
          return { remove: async () => undefined };
        }
        listeners.add(listener);
        return {
          remove: async () => {
            listeners.delete(listener);
          },
        };
      },

      async start(options) {
        overlapMs = Math.max(500, Math.min(1_000, options.overlapMs));

        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 16_000,
          },
        });

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";

        recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96_000 });
        chunkIndex = 0;
        startedAt = performance.now();
        logicalEndMs = 0;

        recorder.addEventListener("dataavailable", (event) => {
          void emitChunk(event.data, recorder?.mimeType ?? mimeType);
        });

        recorder.start(Math.max(20_000, Math.min(40_000, options.chunkMs)));
      },

      async stop() {
        if (recorder && recorder.state !== "inactive") {
          await new Promise<void>((resolve) => {
            recorder?.addEventListener("stop", () => resolve(), { once: true });
            try {
              recorder?.stop();
            } catch {
              resolve();
            }
          });
        }

        stream?.getTracks().forEach((track) => track.stop());
        recorder = null;
        stream = null;
      },
    };

    plugins.HandoffRecorder = recorderPlugin;
  }
}
