(function initHandoffWhisperRuntime(globalScope) {
  "use strict";

  var RUNTIME_NAME = "rnest-whisper-runtime";
  var singletonEngine = null;

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeSegment(segment, fallbackStartMs, fallbackEndMs) {
    if (!segment || typeof segment !== "object") return null;
    var text = String(segment.text || "").trim();
    if (!text) return null;

    var startMs = Math.max(0, toNumber(segment.startMs, fallbackStartMs));
    var endMs = Math.max(startMs + 250, toNumber(segment.endMs, fallbackEndMs));
    var confidence = Number.isFinite(Number(segment.confidence)) ? Number(segment.confidence) : null;

    return {
      text: text,
      startMs: startMs,
      endMs: endMs,
      confidence: confidence,
    };
  }

  function normalizeTranscribeOutput(raw, fallbackStartMs, fallbackEndMs) {
    if (Array.isArray(raw)) {
      return raw
        .map(function (segment) {
          return normalizeSegment(segment, fallbackStartMs, fallbackEndMs);
        })
        .filter(Boolean);
    }

    if (raw && typeof raw === "object") {
      if (Array.isArray(raw.segments)) {
        return raw.segments
          .map(function (segment) {
            return normalizeSegment(segment, fallbackStartMs, fallbackEndMs);
          })
          .filter(Boolean);
      }

      if (typeof raw.text === "string" && raw.text.trim()) {
        return [
          {
            text: raw.text.trim(),
            startMs: fallbackStartMs,
            endMs: Math.max(fallbackStartMs + 250, fallbackEndMs),
            confidence: Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : null,
          },
        ];
      }
    }

    return [];
  }

  function resolveBackendFactory() {
    if (typeof globalScope.__RNEST_WHISPER_BACKEND_FACTORY__ === "function") {
      return globalScope.__RNEST_WHISPER_BACKEND_FACTORY__;
    }

    var backend = globalScope.__RNEST_WHISPER_BACKEND__;
    if (backend && typeof backend === "object") {
      if (typeof backend.createEngine === "function") {
        return function createFromObject(options) {
          return backend.createEngine(options);
        };
      }

      if (typeof backend.transcribe === "function" || typeof backend.transcribeChunk === "function") {
        return function useBackendObject() {
          return backend;
        };
      }
    }

    return null;
  }

  function createNoopBackend() {
    return {
      runtime: "noop",
      async transcribeChunk() {
        return { segments: [] };
      },
      async transcribe() {
        return { segments: [] };
      },
      async dispose() {
        return undefined;
      },
    };
  }

  async function createBackend(options) {
    var factory = resolveBackendFactory();
    if (!factory) return createNoopBackend();

    try {
      var backend = await factory(options || {});
      if (backend && (typeof backend.transcribe === "function" || typeof backend.transcribeChunk === "function")) {
        return backend;
      }
    } catch (error) {
      console.warn("[handoff-runtime] backend factory failed", error);
    }

    return createNoopBackend();
  }

  function buildTranscribePayload(payload, defaults) {
    var startMs = Math.max(0, toNumber(payload && payload.startMs, 0));
    var endMs = Math.max(startMs + 250, toNumber(payload && payload.endMs, startMs + 30000));

    return {
      chunkId: String((payload && payload.chunkId) || ""),
      lang: String((payload && payload.lang) || defaults.lang || "ko"),
      modelUrl: String((payload && payload.modelUrl) || defaults.modelUrl || ""),
      mimeType: String((payload && payload.mimeType) || "audio/webm"),
      startMs: startMs,
      endMs: endMs,
      t0: toNumber(payload && payload.t0, startMs / 1000),
      t1: toNumber(payload && payload.t1, endMs / 1000),
      sampleRate: Number.isFinite(Number(payload && payload.sampleRate))
        ? Number(payload.sampleRate)
        : undefined,
      audioBytes: payload && payload.audioBytes,
      pcmFloat32: payload && payload.pcmFloat32,
      chunkBase64: payload && payload.chunkBase64,
      vad: payload && payload.vad,
    };
  }

  async function createEngine(options) {
    var defaults = {
      lang: String((options && options.lang) || "ko"),
      modelUrl: String((options && options.modelUrl) || ""),
    };

    var backend = await createBackend(defaults);
    var disposed = false;

    async function runTranscribe(payload) {
      if (disposed) return { segments: [] };

      var request = buildTranscribePayload(payload || {}, defaults);
      var fallbackStartMs = request.startMs;
      var fallbackEndMs = request.endMs;

      var raw;
      if (typeof backend.transcribeChunk === "function") {
        raw = await backend.transcribeChunk(request);
      } else if (typeof backend.transcribe === "function") {
        raw = await backend.transcribe(request);
      } else {
        raw = { segments: [] };
      }

      return {
        segments: normalizeTranscribeOutput(raw, fallbackStartMs, fallbackEndMs),
        runtime: backend.runtime || RUNTIME_NAME,
      };
    }

    return {
      runtime: backend.runtime || RUNTIME_NAME,
      model: defaults.modelUrl || "default",
      async transcribe(payload) {
        return runTranscribe(payload);
      },
      async transcribeChunk(payload) {
        return runTranscribe(payload);
      },
      async dispose() {
        disposed = true;
        if (backend && typeof backend.dispose === "function") {
          try {
            await backend.dispose();
          } catch {
            // noop
          }
        }
      },
    };
  }

  globalScope.createHandoffWhisperEngine = createEngine;

  globalScope.HandoffWhisperEngine = {
    async transcribe(payload) {
      if (!singletonEngine) {
        singletonEngine = await createEngine({
          lang: payload && payload.lang,
          modelUrl: payload && payload.modelUrl,
        });
      }
      return singletonEngine.transcribe(payload || {});
    },
    async transcribeChunk(payload) {
      if (!singletonEngine) {
        singletonEngine = await createEngine({
          lang: payload && payload.lang,
          modelUrl: payload && payload.modelUrl,
        });
      }
      return singletonEngine.transcribeChunk(payload || {});
    },
    async dispose() {
      if (!singletonEngine) return;
      await singletonEngine.dispose();
      singletonEngine = null;
    },
  };
})(self);
