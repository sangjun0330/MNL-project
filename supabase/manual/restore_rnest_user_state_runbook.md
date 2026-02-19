# `rnest_user_state` 복구 런북

## 1) 현재 상태 확인 (SQL Editor)
```sql
select count(*) as total_rows from public.rnest_user_state;

select
  count(*) filter (where user_id like '%:%') as legacy_style_ids,
  count(*) filter (where user_id ~ '^[0-9a-f-]{36}$') as uuid_style_ids
from public.rnest_user_state;
```

## 2) legacy ID 매핑 복구 (권장 1차)
`supabase/manual/restore_rnest_user_state_legacy_ids.sql` 를 SQL Editor에서 실행.

이 스크립트는:
- `google:user@email` 같은 legacy `user_id`를 `auth.users.id`(UUID)로 매핑
- UUID 쪽 행이 비어있을 때만 채움

## 3) 로컬 백업 파일 복구 (권장 2차)
로컬 `.rnest_users/**/state.json`에서 SQL 생성:
```bash
node scripts/restore-rnest-user-state-from-local.mjs
```

생성 파일:
- `supabase/manual/restore_rnest_user_state_from_local.sql`

해당 SQL을 SQL Editor에서 실행.

## 4) 물리 삭제(행 자체 소실)인 경우
위 2,3으로 복구되지 않으면 Supabase 백업(PITR)로 복구 필요.

권장 순서:
1. 현재 DB 백업(스냅샷) 생성
2. 소실 직전 시점으로 PITR 복원 (새 프로젝트/새 DB 권장)
3. 복원본에서 `public.rnest_user_state`만 CSV 또는 SQL로 추출
4. 운영 DB에 `upsert`로 재적용

