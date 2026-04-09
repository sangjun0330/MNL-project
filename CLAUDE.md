# RNest

## 프로젝트 성격
- RNest는 한국어 우선의 간호사/교대근무자용 회복 + 임상 AI 서비스다. 일반 웰니스 데모처럼 단순화하지 말 것.
- 핵심 표면은 Home, Schedule, Insights/Recovery, Tools, Social, Shop, Billing/Admin이다.
- Social, Shop, Billing, AI 검색은 실제 운영 기능이다. mock 또는 임시 화면처럼 다루지 말 것.

## 기본 기술 기준
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS, Supabase를 사용한다.
- 패키지 매니저는 `npm`이다. `package-lock.json` 기준으로 작업한다.
- 이 저장소는 Edge 런타임 전제가 강하다. 많은 페이지와 API가 `runtime = "edge"`이며, 새 코드도 가능하면 Edge-safe하게 유지한다.
- Node 전용 API가 꼭 필요하면 추가 전에 런타임 영향과 배포 영향부터 확인한다.
- import alias는 `@/* -> src/*`를 사용한다.

## 자주 쓰는 명령
- 설치: `npm install`
- 개발 서버: `npm run dev`
- 린트: `npm run lint`
- 타입 체크: `npx tsc --noEmit`
- 빌드 검증: `npm run build`
- `next build`를 직접 실행하지 말고 `npm run build`를 사용한다. `scripts/run-next-build.mjs`가 Desktop 작업공간용 dist 처리까지 맡는다.
- 정식 `npm test` 스크립트는 없다. 위험한 변경은 lint, typecheck, build와 수동 검증으로 끝낸다.

## 현재 코드베이스의 핵심 경로
- 앱 부트스트랩/인증 게이트: `src/components/shell/AppShell.tsx`, `src/lib/auth.ts`
- 전역 상태와 도메인 모델: `src/lib/store.ts`, `src/lib/model.ts`
- 사용자 상태 저장의 단일 소유자: `src/components/system/CloudStateSync.tsx`
- 사용자 상태 API/저장: `src/app/api/user/state/route.ts`, `src/lib/server/userStateStore.ts`
- 결제/플랜 단일 진실 소스: `src/lib/billing/plans.ts`, `src/lib/billing/entitlements.ts`
- AI 임상 검색: `src/app/api/tools/med-safety/analyze/route.ts`, `src/lib/server/openaiMedSafety.ts`
- AI 회복/오더: `src/lib/server/openaiRecovery.ts`, `src/lib/server/recoveryOrderStore.ts`
- 보안 응답 헬퍼: `src/lib/server/requestSecurity.ts`
- Supabase 스키마 변경점: `supabase/migrations/`, `src/types/supabase.ts`

## 작업 원칙
- 먼저 영향 범위를 읽고, 기존 패턴을 재사용하고, 필요한 만큼만 수정한다.
- 새 store, 새 sync 경로, 새 billing 계산 경로를 만들기 전에 기존 helper와 server store를 먼저 확장할 수 있는지 본다.
- README보다 현재 `src/`, `docs/`, `supabase/migrations/` 상태를 우선 신뢰한다.
- 플랜/권한/크레딧 관련 판단은 반드시 `src/lib/billing/plans.ts`와 `src/lib/billing/entitlements.ts`를 기준으로 맞춘다.
- 경로 전용 규칙이 필요해지면 루트 파일을 비대하게 늘리지 말고 `.claude/rules/`로 분리하는 것을 우선 고려한다.

## 제품/UX 가드레일
- 기본 카피와 UX는 한국어 우선이다. 영어 변경이 필요하면 기존 `src/lib/i18n.ts`, `src/lib/useI18n.ts` 흐름을 따른다.
- 모바일 퍼스트, PWA 친화적 흐름, 좁은 화면 기준 레이아웃을 유지한다.
- 현재 시각 톤은 light UI, lavender identity, rounded card, Apple-like spacing/motion이다. `src/app/globals.css`와 기존 `src/components/ui/*` 패턴을 우선 재사용한다.
- 교대근무, 수면부채, 피로, 생리주기, 카페인, 간호 workflow는 1급 도메인 입력이다. generic wellness copy로 흐리지 말 것.
- Free / Plus / Pro의 가치 차이를 무너뜨리지 말 것.
- 통합 간호 계산기는 현재 모든 플랜 공통 제공이다. 명시적 요구 없이 유료 제한을 새로 만들지 않는다.

## 보안/데이터 가드레일
- 건강 관련 데이터, 결제 상태, AI 결과를 다루므로 과도한 로그, 넓은 에러 노출, 불필요한 영구 저장을 피한다.
- mutating route에서는 same-origin 검사와 `no-store` 응답 정책을 유지한다.
- 서비스 동의, 인증, 관리자 권한, 크레딧 차감/복원, 환불 권한 경계를 약화시키지 말 것.
- 보안성 있는 식별자나 주문 ID가 필요하면 `Math.random()` 대신 Web Crypto(`crypto.randomUUID()`, `crypto.getRandomValues`)를 사용한다.
- `.env*`, `.wnl_users`, `.wnl_logs`, 로컬 복구 산출물, 실제 사용자 데이터는 절대 커밋하지 않는다.
- Supabase 스키마 변경은 migration 없이 가정하지 말고, 타입 및 서버 계약까지 함께 맞춘다.

## 검증 기준
- UI 변경: 영향을 받은 모바일 화면을 직접 확인한다.
- 인증/상태 저장 변경: 로그인 -> bootstrap -> local draft -> remote load/save -> 새로고침 흐름을 확인한다.
- 결제 변경: checkout -> confirm/fail -> subscription/refund/admin 흐름을 확인한다.
- AI 검색/회복 변경: quota, history retention, continuation, timeout, 이미지 제한 경계를 확인한다.
- PWA 변경: production build 기준 service worker/manifest 동작을 확인한다.
- 개발 중 빠른 로그인은 `GET /api/dev/login?user=1&redirect=/path`를 사용한다.

## 참고 문서
- `docs/supabase-storage-map.md`
- `next.config.mjs`
- `src/app/globals.css`
