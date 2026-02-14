# Handoff WASM Runtime Contract

`wasm_local` provider is wired through:
- Worker: `/public/workers/handoff-whisper.worker.js`
- Browser adapter: `src/lib/handoff/wasmAsr.ts`

## 1) Worker Init
Host sends:
```json
{
  "id": "init-...",
  "type": "init",
  "payload": {
    "lang": "ko",
    "modelUrl": "/models/ko.bin",
    "runtimeUrl": "/runtime/whisper-runtime.js"
  }
}
```

Worker responds:
```json
{ "id": "init-...", "type": "init:ok", "payload": { "ready": true } }
```

## 2) Chunk Transcribe
Host sends:
```json
{
  "id": "transcribe-...",
  "type": "transcribe",
  "payload": {
    "chunkId": "chunk-001",
    "startMs": 0,
    "endMs": 30000,
    "mimeType": "audio/webm",
    "chunkBase64": "<base64-audio>"
  }
}
```

Worker success:
```json
{
  "id": "transcribe-...",
  "type": "transcribe:ok",
  "payload": {
    "segments": [
      { "text": "전사 결과", "startMs": 1000, "endMs": 5000, "confidence": 0.91 }
    ]
  }
}
```

Worker failure:
```json
{
  "id": "transcribe-...",
  "type": "transcribe:err",
  "payload": { "message": "runtime unavailable" }
}
```

## 3) Runtime Injection Options
Worker supports one of:
- `self.createHandoffWhisperEngine({ lang, modelUrl })` factory with `transcribe(...)`
- `self.HandoffWhisperEngine.transcribe(...)` global object

Optional teardown:
- `dispose()` method is called on `stop` if provided.
