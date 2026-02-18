# RNest AI Handoff: Web Service System Design

## 1. Scope
- Target: Next.js web service (browser first)
- Goal: Korean free-form handoff transcription text -> de-identified structured handoff cards
- Privacy rule: raw audio/raw transcript/evidence text must stay local
- Default execution mode: `local_only` (remote sync / remote summary path blocked by policy)
- Future option: `hybrid_opt_in` can be opened later for de-identified structure sync under legal/policy controls

## 2. Web Constraints
- Browser mic capture is supported via `MediaRecorder` (16kHz mono preferred, chunk 20-40s, overlap 0.5-1.0s)
- Default ASR mode is `manual` for privacy-safe operation
- `web_speech` can use browser speech APIs, but browser vendor cloud STT may be involved
- `local_only`/`strict` policy can auto-block `web_speech`
- Optional mode `wasm_local` uses worker/plugin on-device runtime (model/runtime URL required by deployment)

## 3. Runtime Architecture
### Client (Browser)
- UI
  - `/tools` and `/tools/handoff`
  - `/handoff` alias route for direct access
- Live input
  - `src/lib/handoff/recorder.ts` for chunked recording
  - `src/lib/handoff/asr.ts` for optional web speech stream
  - `src/lib/handoff/vad.ts` for local VAD(audio decode + speech ratio gate)
  - `src/lib/handoff/wasmAsr.ts` for spec/legacy worker protocol bridge (`INIT/TRANSCRIBE_CHUNK` + legacy fallback)
  - default runtime script: `public/runtime/whisper-runtime.js` (same-origin, no-op safe fallback + pluggable backend hook)
- Pipeline
  - normalize -> PHI mask -> split -> structure -> priority
  - `src/lib/handoff/pipeline.ts`
  - optional WebLLM refine adapter: `src/lib/handoff/refine.ts` (`window.__RNEST_WEBLLM_REFINE__`)
  - default refine adapter script: `public/runtime/webllm-refine-adapter.js` (heuristic local fallback + custom backend hook)
  - optional refine backend script: `public/runtime/webllm-refine-backend.js` (if missing, adapter-only fallback still runs)
  - bootstrap loader: `src/components/system/HandoffRuntimeBootstrap.tsx`
  - medical pronunciation lexicon auto-merge pipeline (`scripts/handoff/build-medical-lexicon.mjs`)
  - confusion-pair context warning (HR/RR, DC/D-C, Cr/CRP, PR/PRN, PE/PEA)
- Storage
  - raw/evidence: encrypted local vault (`TTL=24h`)
  - de-identified structured result: local storage (`TTL=7d`)
  - periodic cleanup via `HandoffJanitor`

### Optional Native Bridge (Hybrid Compatibility)
- `src/lib/handoff/capacitorBridge.ts`
- Provides contract-compatible plugins for recorder/secure store
- Web service does not depend on native plugin presence

## 4. Data Lifecycle
1. Session created (`sessionId`, duty type)
2. Transcript segments collected (manual input and/or live ASR)
3. Pipeline generates:
   - GlobalTop
   - WardEvents
   - PatientCards
   - Uncertainties
4. 10-second review step (resolve/check + note)
5. Save de-identified result (7d TTL)
6. Runtime live view can expose alias mapping only as short-lived on-screen reveal (hold-to-reveal)
7. Keep raw/evidence local-only (`memory_only` runtime default or encrypted vault)
8. Purge on inactivity TTL/manual crypto-shred

## 5. Security Model
- No server API path for raw audio/transcript/evidence
- AES-GCM vault encryption
- User-scoped storage namespace (`wnl:handoff:{userScope}:*`) to prevent cross-account browser leakage
- Key lifecycle
  - in-memory cache + secure-store adapter persistence
  - key removal on `cryptoShredSession`
- Evidence access only by local `EvidenceRef {segmentId,startMs,endMs}`
- Strict privacy profile guard
  - blocks `web_speech` provider
  - enforces same-origin HTTPS WASM worker/model/runtime URLs
  - requires authenticated user before handoff page/detail view and run/save actions
  - web fallback key store is memory-only (no localStorage key persistence)
- Execution mode guard
  - `local_only`: blocks `web_speech` and remote sync regardless of UI/env attempt
  - `hybrid_opt_in`: remote sync can be enabled only by explicit flag/policy path
- Residual PHI blocker: if de-id sanitizer still detects phone/RRN/chart/email patterns, structured save is denied
- Local audit trail (de-identified metadata only): pipeline run/save/shred/purge events

## 6. Reliability Rules
- ASR continuous failure rule: every 2 consecutive ASR errors adds manual uncertainty item
- Chunk coverage rule: if a recorded chunk has no matched transcript window, add manual uncertainty for review
- Missing value/time/ambiguous patient -> uncertainty list (no hallucinated completion)
- Confusable abbreviation in wrong context -> `confusable_abbreviation` uncertainty
- 10-second review lock: save actions remain disabled while review timer is active
- De-identification guard: structured payload is re-sanitized before save/load/list
- Local storage fault tolerance: storage/quota/security exceptions fail closed without crashing UI
- Session cleanup runs on app load, visibility resume, and periodic interval
- Transcript segment hard cap for web stability (`MAX_TRANSCRIPT_SEGMENT_COUNT`): overflow lines are merged into one tail segment

## 7. Feature Flags (Web)
Recommended defaults (`.env.local`):
- `NEXT_PUBLIC_HANDOFF_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_EXECUTION_MODE=local_only`
- `NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED=false`
- `NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE=strict`
- `NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH=true`
- `NEXT_PUBLIC_HANDOFF_LOCAL_ASR_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_EVIDENCE_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_ASR_PROVIDER=manual`
- `NEXT_PUBLIC_HANDOFF_WEB_AUDIO_CAPTURE_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED=false`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_WORKER_URL=/workers/handoff-whisper.worker.js`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_MODEL_URL=`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_RUNTIME_URL=/runtime/whisper-runtime.js`
- `NEXT_PUBLIC_HANDOFF_VAD_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_VAD_MIN_SPEECH_RATIO=0.05`
- `NEXT_PUBLIC_HANDOFF_VAD_MIN_SEGMENT_MS=180`
- `NEXT_PUBLIC_HANDOFF_VAD_THRESHOLD=0.012`
- `NEXT_PUBLIC_HANDOFF_WEBLLM_REFINE_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_WEBLLM_BACKEND_URL=/runtime/webllm-refine-backend.js`
- `NEXT_PUBLIC_HANDOFF_WEBLLM_ADAPTER_URL=/runtime/webllm-refine-adapter.js`
- `NEXT_PUBLIC_HANDOFF_LIVE_MEMORY_ONLY=true`

## 8. Deployment Notes
- HTTPS required for browser microphone APIs in production
- CSP should allow only RNest domains; no third-party transcript upload endpoints
- Keep handoff routes behind authenticated user session if operational policy requires
- New hard-delete path: "전체 완전 파기" clears scoped raw/structured/draft/audit local keys and legacy handoff keys
- Handoff routes use `Cache-Control: no-store` to reduce browser/proxy caching exposure
- Handoff routes set `X-Robots-Tag: noindex` to avoid search indexing

## 9. Validation Matrix
- Lint: `npm run lint`
- Unit tests: `npm run test:handoff`
  - PHI masking
  - Vault TTL / crypto-shred
  - Vault decrypt after restart with secure key store
- Browser E2E: `npm run test:e2e:handoff`
  - prerequisite: `npm install -D playwright && npm run test:e2e:handoff:install`
  - manual transcript flow -> review lock -> save -> session detail
- Build: `npm run build`

## 10. Future Extensions
- WASM local ASR production tuning (model quantization, warmup cache, streaming alignment)
- Optional server sync for de-identified summary with per-tenant retention policy (`hybrid_opt_in` only)
- Audit event stream for review completion and purge actions
