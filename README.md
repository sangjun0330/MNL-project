# RNest • Shift Body Battery (PWA)

간호사/간호대학생을 위한 **일정(3교대) 기반 회복/피로 인사이트** 웹 기반 앱입니다.  
Google/Kakao 로그인으로 기록을 **계정에 안전하게 저장**하며, PWA로 설치하면 **모바일 앱처럼** 사용할 수 있어요.

## 포함 기능 (v0.1)
- ✅ 로그인 기반 동기화 : Google/Kakao 계정에 기록 저장 (앱 삭제/기기 변경에도 복원)
- ✅ 홈(오늘 컨디션) : 회복 점수 + 추천 수면/카페인 컷오프 + 케어 멘트
- ✅ 7일 피로 예보 : 숫자(0-100) + 위험/주의/양호 컬러
- ✅ 근무표 입력 : 월 캘린더에서 날짜 탭 → D/E/N/OFF/VAC 선택
- ✅ 선택 날짜 디테일 : 전날 복사 / 일정 변경
- ✅ 인사이트 : 최근 14일 평균/최저/최고/위험일수 요약
- ✅ 인사이트 잠금 : 건강 기록이 **7일 이상** 누적되어야 열림
- ✅ PWA : manifest + service worker(프로덕션에서만 등록)

## 실행 방법
> Node.js 18+ 권장

```bash
npm install
npm run dev
```

- 브라우저에서 http://localhost:3000 접속

## 환경 변수 설정
`.env.local`에 아래 값을 넣어주세요. (예시는 `.env.example` 참고)

- `AUTH_SECRET` (필수)
- `NEXTAUTH_URL` (예: `http://localhost:3000`)
- `AUTH_TRUST_HOST=true` (로컬 개발용)
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET`

> Kakao 로그인은 **리디렉션 URI/도메인** 설정이 정확히 일치해야 합니다.

### AI 인계(웹 모드) 설정
- `NEXT_PUBLIC_HANDOFF_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_EXECUTION_MODE=local_only` (권장 기본값)
- `NEXT_PUBLIC_HANDOFF_REMOTE_SYNC_ENABLED=false` (`local_only`에서 정책상 강제 false)
- `NEXT_PUBLIC_HANDOFF_PRIVACY_PROFILE=strict` (의료/민감정보 운영 권장)
- `NEXT_PUBLIC_HANDOFF_REQUIRE_AUTH=true` (strict에서 사실상 필수)
- `NEXT_PUBLIC_HANDOFF_LOCAL_ASR_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_EVIDENCE_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_ASR_PROVIDER=manual` (권장 기본값)
- `NEXT_PUBLIC_HANDOFF_WEB_AUDIO_CAPTURE_ENABLED=true`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_ENABLED=false` (`wasm_local` 사용 시 `true`)
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_WORKER_URL=/workers/handoff-whisper.worker.js`
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_MODEL_URL=` (선택)
- `NEXT_PUBLIC_HANDOFF_WASM_ASR_RUNTIME_URL=` (선택)

> `local_only` 모드는 handoff 데이터 원격 전송 경로를 정책 레벨에서 차단합니다.
> `web_speech` 모드는 브라우저 구현에 따라 외부 STT를 사용할 수 있으므로 `hybrid_opt_in`에서만 제한적으로 사용하세요.
> `wasm_local` 모드는 worker/plugin 온디바이스 런타임이 필요하며, 준비되지 않으면 자동 전사가 동작하지 않습니다.
> `strict` 프로필은 인증/secure context를 강제하고, `web_speech`를 차단하며, WASM URL을 same-origin으로 제한합니다.
> `strict` 웹 환경에서는 Vault 키를 localStorage에 남기지 않고 메모리로만 유지합니다(새로고침 시 raw/evidence 복구 불가, 안전성 우선).
> 상세 설계 문서: `docs/handoff-web-system-design.md`
> WASM 런타임 메시지 계약: `docs/handoff-wasm-runtime-contract.md`
> AI 인계 저장 전에는 10초 검수 창이 적용되며, 구조화 결과는 저장 시점에 비식별 안전가드가 한 번 더 수행됩니다.

### AI 인계 E2E
```bash
npm install -D playwright
npm run test:e2e:handoff:install
npm run test:e2e:handoff
```
- Playwright 기반 시나리오: 수동 전사 입력 -> 분석 -> 10초 검수 락 해제 -> 저장 -> 세션 상세 진입.

## 프로덕션 빌드
```bash
npm run build
npm start
```

## PWA(앱처럼 설치) 안내
- iPhone(Safari): **공유 버튼 → “홈 화면에 추가”**
- Android/Chrome: 주소창 메뉴 → “앱 설치” 또는 “홈 화면에 추가”

> ⚠️ 서비스워커는 개발환경에서 캐시 혼선을 줄이기 위해 **production에서만 등록**됩니다.

## 회복/피로 알고리즘(간단 버전)
- 수면/근무/스트레스/카페인/생리주기/기분 정보를 통합해
- 0–100 스케일의 “회복 지표”로 보여줍니다.

> 이후 버전에서 “개인 수면 패턴/카페인 민감도” 설정만 추가해도 정확도가 크게 올라갑니다.

## 커스터마이징 포인트
- `src/lib/bodyBattery.ts` : 규칙(가중치/멘트/컷오프)을 병동/개인 스타일에 맞게 수정
- `src/components/home/*` : UI(카드/캘린더/게이지) 커스터마이징
- `public/icons/*` : 앱 아이콘 교체

---
Made for a clean, Apple-like aesthetic: soft shadows, generous spacing, subtle borders.


## 바디 배터리 알고리즘 (NurseBioRhythmAI 포팅)
- `src/lib/bodyBattery.ts` 는 사용자가 제공한 Python `NurseBioRhythmAI`를 TypeScript로 포팅한 버전입니다.
- 1시간 단위로 (Work/Rest/Sleep) 상태를 추정하고, **새벽 2~6시 생체리듬 페널티(peak 04:00)** 를 적용합니다.
- 캘린더/예보 숫자는 근무시간대에서의 **최저 배터리**를 사용하여 위험도를 더 현실적으로 표시합니다.
