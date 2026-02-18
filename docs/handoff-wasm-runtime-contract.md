# Handoff WASM Runtime Contract

`wasm_local` provider is wired through:
- Worker: `/public/workers/handoff-whisper.worker.js`
- Browser adapter: `src/lib/handoff/wasmAsr.ts`

현재 런타임은 PDF 권장 프로토콜과 기존 레거시 프로토콜을 모두 수용합니다.

## 1) INIT (권장)
Host sends:
```json
{
  "id": "init-...",
  "type": "INIT",
  "payload": {
    "languageHint": "ko",
    "modelUrl": "/models/ko.bin",
    "runtimeUrl": "/runtime/whisper-runtime.js"
  }
}
```

Worker responds:
```json
{ "id": "init-...", "type": "READY", "payload": { "model": "/models/ko.bin", "deviceInfo": { "runtime": "worker" } } }
```

## 2) TRANSCRIBE_CHUNK (권장)
Host sends:
```json
{
  "id": "transcribe-...",
  "type": "TRANSCRIBE_CHUNK",
  "payload": {
    "chunkId": "chunk-001",
    "startMs": 0,
    "endMs": 30000,
    "t0": 0,
    "t1": 30,
    "mimeType": "audio/webm",
    "chunkBase64": "<base64-audio>",
    "sampleRate": 16000,
    "vad": { "speechRatio": 0.42, "segments": [{ "s": 0.9, "e": 6.2 }] }
  }
}
```

Worker stream events:
```json
{ "id": "transcribe-...", "type": "PROGRESS", "payload": { "chunkId": "chunk-001", "percent": 10 } }
{ "id": "transcribe-...", "type": "PARTIAL", "payload": { "chunkId": "chunk-001", "text": "부분 전사", "t0": 1.2, "t1": 2.1 } }
```

Worker final event:
```json
{
  "id": "transcribe-...",
  "type": "FINAL",
  "payload": {
    "chunkId": "chunk-001",
    "segments": [
      { "text": "전사 결과", "startMs": 1000, "endMs": 5000, "confidence": 0.91, "t0": 1.0, "t1": 5.0 }
    ]
  }
}
```

## 3) FLUSH / RESET
- `FLUSH` -> 현재 버퍼 강제 배출 (`FINAL` + `FLUSH:ok`)
- `RESET` -> 엔진 dispose 후 초기화 (`RESET:ok`)

## 4) 레거시 호환
다음 메시지도 계속 지원합니다:
- In: `init`, `transcribe`, `stop`
- Out: `init:ok`, `transcribe:ok`, `stop:ok`, `*:err`

## 5) Runtime Injection Options
Worker supports one of:
- `self.createHandoffWhisperEngine({ lang, modelUrl })` factory with `transcribe(...)` or `transcribeChunk(...)`
- `self.HandoffWhisperEngine.transcribe(...)` global object

기본 제공 스크립트:
- `/public/runtime/whisper-runtime.js`
  - 위 두 글로벌 계약을 자동 등록합니다.
  - `self.__RNEST_WHISPER_BACKEND_FACTORY__` 또는 `self.__RNEST_WHISPER_BACKEND__`를 주입하면 실제 엔진으로 연결됩니다.
  - 백엔드가 없으면 no-op 엔진으로 동작하여 앱이 실패 없이 수동 검수 경로로 내려갑니다.

Optional teardown:
- `dispose()` method is called on `stop/reset` if provided.
