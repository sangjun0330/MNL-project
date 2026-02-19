# RNest Supabase Storage Map (Current System)

## 1) 사용자 기록 저장 플로우
- 클라이언트 상태 변경: `/Users/osangjun/Desktop/RNEST_updated/src/components/system/CloudStateSync.tsx`
- 저장 API: `/Users/osangjun/Desktop/RNEST_updated/src/app/api/user/state/route.ts`
- 서버 저장 구현: `/Users/osangjun/Desktop/RNEST_updated/src/lib/server/userStateStore.ts`

저장 순서:
1. 앱 상태 변경 발생
2. `CloudStateSync`가 짧은 디바운스 후 `/api/user/state` POST 호출
3. API가 sanitize/serialize 후 `rnest_user_state` upsert
4. `rnest_users`는 `ensureUserRow`로 사용자 기본 row 보장
5. 페이지 숨김/종료 시 keepalive flush로 마지막 변경 즉시 동기화

## 2) 테이블별 저장 데이터

### `public.rnest_users`
- 사용자 기본 상태/구독/크레딧 요약
- 주요 컬럼:
  - `subscription_*`
  - `med_safety_extra_credits`
  - `med_safety_daily_used`
  - `med_safety_usage_date`
  - `last_seen`

### `public.rnest_user_state`
- 사용자 실제 기록 JSON 스냅샷(캘린더/노트/감정/바이오/설정)
- `payload` 1행(user당 1행) 최신본

### `public.rnest_user_state_revisions`
- `rnest_user_state` insert/update 이력(감사/복구용 append-only)

### `public.ai_content`
- AI 결과 캐시(맞춤회복/약물·기구 분석 결과)

### `public.billing_orders`
- Toss 결제 주문 원장
- 구독/크레딧팩 주문 모두 저장

### `public.billing_refund_requests`
- 환불 요청 상태머신 본문

### `public.billing_refund_events`
- 환불 상태 전이 이벤트 로그

### `public.med_safety_usage_events`
- AI 검색 크레딧 증감 ledger
- 차감/복원/구매 적립 이벤트를 시간순 추적

## 3) 운영자가 한눈에 보는 뷰
- `public.v_user_data_overview`: 기록 저장 현황 요약
- `public.v_user_billing_summary`: 누적 결제/크레딧 구매 요약
- `public.v_user_credit_live`: KST 기준 실시간 잔여 크레딧 계산

## 4) 실시간 저장 안정화 포인트
- 저장 경로를 `/api/user/state` 단일 경로로 통일
- 백그라운드 전환(`visibilitychange`)·탭 종료(`pagehide`, `beforeunload`)에서 즉시 flush
- 저장 실패 시 지수 백오프 재시도
- 빈 payload로 기존 유의미 데이터가 덮어써지는 상황 서버단 차단
