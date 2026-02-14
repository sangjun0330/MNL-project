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

function decodeBase64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

async function transcribe(payload) {
  const runtime = await ensureRuntime();
  if (!runtime || typeof runtime.transcribe !== "function") {
    throw new Error(
      "WASM ASR runtime unavailable. Provide runtimeUrl or global createHandoffWhisperEngine/HandoffWhisperEngine."
    );
  }

  const bytes = decodeBase64ToBytes(String(payload?.chunkBase64 ?? ""));
  const result = await runtime.transcribe({
    chunkId: payload?.chunkId,
    startMs: Number(payload?.startMs ?? 0),
    endMs: Number(payload?.endMs ?? 0),
    mimeType: payload?.mimeType,
    audioBytes: bytes,
    lang: initConfig.lang,
  });

  return normalizeSegments(result?.segments, Number(payload?.startMs ?? 0), Number(payload?.endMs ?? 0));
}

self.onmessage = async (event) => {
  const message = event?.data ?? {};
  const id = message.id;
  const type = message.type;
  const payload = message.payload ?? {};

  try {
    if (type === "init") {
      initConfig = {
        lang: String(payload?.lang ?? "ko"),
        modelUrl: String(payload?.modelUrl ?? ""),
        runtimeUrl: String(payload?.runtimeUrl ?? ""),
      };
      post(id, "init:ok", {
        ready: true,
      });
      return;
    }

    if (type === "transcribe") {
      const segments = await transcribe(payload);
      post(id, "transcribe:ok", { segments });
      return;
    }

    if (type === "stop") {
      if (engine && typeof engine.dispose === "function") {
        await engine.dispose();
      }
      engine = null;
      post(id, "stop:ok", { stopped: true });
      return;
    }

    post(id, `${type}:err`, {
      message: `Unsupported worker message: ${String(type)}`,
    });
  } catch (error) {
    post(id, `${type}:err`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
