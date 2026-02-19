# Supabase Full Reset + Rebuild Runbook

## 주의
- 이 작업은 RNest 앱 데이터 테이블을 전부 삭제 후 재생성합니다.
- 실행 파일: `PROJECT_ROOT/supabase/migrations/20260220_full_reset_rebuild_v2.sql`

## 1) SQL Editor 실행
1. Supabase Dashboard → SQL Editor
2. `20260220_full_reset_rebuild_v2.sql` 전체 붙여넣기
3. 실행

## 2) 실행 후 확인 SQL

```sql
-- 테이블 생성 확인
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'rnest_users',
    'rnest_user_state',
    'rnest_user_state_revisions',
    'ai_content',
    'billing_orders',
    'billing_refund_requests',
    'billing_refund_events',
    'med_safety_usage_events'
  )
order by table_name;

-- 뷰 확인
select table_name
from information_schema.views
where table_schema = 'public'
  and table_name in ('v_user_data_overview', 'v_user_billing_summary', 'v_user_credit_live')
order by table_name;

-- 현재 유저별 실시간 크레딧 조회
select *
from public.v_user_credit_live
order by user_id
limit 200;
```

## 3) 앱 연결 확인 체크리스트
- 로그인 후 일정/노트 입력 → `rnest_user_state.updated_at`이 즉시 증가하는지 확인
- AI 검색 성공 1회 실행 → `med_safety_usage_events`에 `delta=-1` 기록되는지 확인
- 크레딧 구매 승인 완료 → `billing_orders.status='DONE'` + `med_safety_usage_events` 적립 이벤트 확인

## 4) 문제 발생 시 우선 점검
- `.env`의 Supabase URL/키가 배포 환경과 동일한지
- `/api/user/state` 401/500 여부 (브라우저 네트워크 탭)
- `pg_notify('pgrst','reload schema')` 실행 후 PostgREST 스키마 캐시 갱신 반영 여부
