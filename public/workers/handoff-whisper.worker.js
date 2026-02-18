let engine = null;
let initConfig = {
  lang: "ko",
  modelUrl: "",
  runtimeUrl: "",
};
let runtimeLoaded = false;

function post(id, type, payload) {
  self.postMessage({
    id,
    type,
    payload,
  });
}

function normalizeType(type) {
  return String(type ?? "").trim();
}

function decodeBase64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeSegments(segments, fallbackStartMs, fallbackEndMs) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map((segment) => {
      const text = String(segment?.text ?? "").trim();
      if (!text) return null;
      const startMs = Number.isFinite(Number(segment?.startMs))
        ? Math.max(0, Number(segment.startMs))
        : fallbackStartMs;
      const endMs = Number.isFinite(Number(segment?.endMs))
        ? Math.max(startMs + 250, Number(segment.endMs))
        : Math.max(startMs + 250, fallbackEndMs);
      const confidence =
        typeof segment?.confidence === "number" && Number.isFinite(segment.confidence)
          ? Number(segment.confidence)
          : null;
      return {
        text,
        startMs,
        endMs,
        confidence,
      };
    })
    .filter(Boolean);
}

async function ensureRuntime() {
  if (engine) return engine;

  if (!runtimeLoaded && initConfig.runtimeUrl) {
    importScripts(initConfig.runtimeUrl);
    runtimeLoaded = true;
  }

  if (typeof self.createHandoffWhisperEngine === "function") {
    engine = await self.createHandoffWhisperEngine({
      lang: initConfig.lang,
      modelUrl: initConfig.modelUrl || undefined,
    });
    return engine;
  }

  if (self.HandoffWhisperEngine && typeof self.HandoffWhisperEngine.transcribe === "function") {
    engine = self.HandoffWhisperEngine;
    return engine;
  }

  return null;
}

async function invokeRuntimeTranscribe(runtime, payload) {
  const chunkId = payload?.chunkId;
  const startMs = Number(payload?.startMs ?? 0);
  const endMs = Number(payload?.endMs ?? 0);
  const mimeType = payload?.mimeType;
  const chunkBase64 = String(payload?.chunkBase64 ?? "");
  const audioBytes = chunkBase64 ? decodeBase64ToBytes(chunkBase64) : null;
  const pcmFloat32 = payload?.pcmFloat32 instanceof Float32Array ? payload.pcmFloat32 : null;

  const common = {
    chunkId,
    startMs,
    endMs,
    mimeType,
    lang: initConfig.lang,
    modelUrl: initConfig.modelUrl || undefined,
    t0: Number(payload?.t0 ?? startMs / 1000),
    t1: Number(payload?.t1 ?? endMs / 1000),
    sampleRate: Number(payload?.sampleRate ?? 0) || undefined,
    vad: payload?.vad,
  };

  if (typeof runtime.transcribeChunk === "function") {
    return runtime.transcribeChunk({
      ...common,
      audioBytes: audioBytes ?? undefined,
      pcmFloat32: pcmFloat32 ?? undefined,
      chunkBase64,
    });
  }

  if (typeof runtime.transcribe === "function") {
    return runtime.transcribe({
      ...common,
      audioBytes: audioBytes ?? undefined,
      pcmFloat32: pcmFloat32 ?? undefined,
      chunkBase64,
    });
  }

  throw new Error("transcribe runtime function unavailable");
}

async function transcribe(payload, requestId) {
  const runtime = await ensureRuntime();
  if (!runtime) {
    throw new Error(
      "WASM ASR runtime unavailable. Provide runtimeUrl or global createHandoffWhisperEngine/HandoffWhisperEngine."
    );
  }

  const chunkId = String(payload?.chunkId ?? "");
  post(requestId, "PROGRESS", { chunkId, percent: 10 });
  const raw = await invokeRuntimeTranscribe(runtime, payload);
  const normalized = normalizeSegments(
    raw?.segments ?? raw,
    Number(payload?.startMs ?? 0),
    Number(payload?.endMs ?? 0)
  );

  if (normalized.length) {
    const preview = normalized[normalized.length - 1];
    post(requestId, "PARTIAL", {
      chunkId,
      text: preview.text,
      t0: Number((preview.startMs / 1000).toFixed(3)),
      t1: Number((preview.endMs / 1000).toFixed(3)),
      confidence: preview.confidence ?? null,
    });
  }
  post(requestId, "PROGRESS", { chunkId, percent: 100 });
  return normalized;
}

async function resetRuntime() {
  if (engine && typeof engine.dispose === "function") {
    await engine.dispose();
  }
  engine = null;
}

self.onmessage = async (event) => {
  const message = event?.data ?? {};
  const id = message.id;
  const rawType = normalizeType(message.type);
  const typeUpper = rawType.toUpperCase();
  const payload = message.payload ?? {};

  try {
    if (typeUpper === "INIT") {
      initConfig = {
        lang: String(payload?.languageHint ?? payload?.lang ?? "ko"),
        modelUrl: String(payload?.modelUrl ?? ""),
        runtimeUrl: String(payload?.runtimeUrl ?? ""),
      };
      post(id, "READY", {
        model: initConfig.modelUrl || "default",
        deviceInfo: {
          runtime: "worker",
          userAgent: self.navigator?.userAgent ?? "",
        },
      });
      post(id, "init:ok", {
        ready: true,
        protocol: "spec+legacy",
      });
      return;
    }

    if (typeUpper === "TRANSCRIBE_CHUNK" || typeUpper === "TRANSCRIBE") {
      const segments = await transcribe(payload, id);
      post(id, "FINAL", {
        chunkId: String(payload?.chunkId ?? ""),
        segments: segments.map((segment) => ({
          t0: Number((segment.startMs / 1000).toFixed(3)),
          t1: Number((segment.endMs / 1000).toFixed(3)),
          text: segment.text,
          confidence: segment.confidence ?? null,
          startMs: segment.startMs,
          endMs: segment.endMs,
        })),
      });
      post(id, "transcribe:ok", { segments });
      return;
    }

    if (typeUpper === "FLUSH") {
      post(id, "FINAL", {
        chunkId: String(payload?.chunkId ?? ""),
        segments: [],
      });
      post(id, "FLUSH:ok", { flushed: true });
      return;
    }

    if (typeUpper === "RESET" || typeUpper === "STOP") {
      await resetRuntime();
      post(id, "RESET:ok", { stopped: true });
      post(id, "stop:ok", { stopped: true });
      return;
    }

    post(id, "ERROR", {
      message: `Unsupported worker message: ${rawType}`,
    });
    post(id, `${rawType}:err`, {
      message: `Unsupported worker message: ${rawType}`,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    post(id, "ERROR", { message: messageText });
    post(id, `${rawType}:err`, { message: messageText });
  }
};
