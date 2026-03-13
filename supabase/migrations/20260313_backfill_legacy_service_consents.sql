begin;

with eligible_users as (
  select u.user_id
  from public.rnest_users as u
  left join public.rnest_user_state as s
    on s.user_id = u.user_id
  left join public.user_service_consents as c
    on c.user_id = u.user_id
  where c.user_id is null
    and (
      u.created_at < '2026-03-12T00:00:00+09:00'::timestamptz
      or s.user_id is not null
    )
),
inserted_consents as (
  insert into public.user_service_consents (
    user_id,
    records_storage_consented_at,
    ai_usage_consented_at,
    consent_completed_at,
    consent_version,
    privacy_version,
    terms_version,
    created_at,
    updated_at
  )
  select
    eligible_users.user_id,
    now(),
    now(),
    now(),
    '2026-03-12-1',
    '2026-03-12',
    '2026-03-12',
    now(),
    now()
  from eligible_users
  on conflict (user_id) do nothing
  returning user_id
)
insert into public.user_service_consent_events (
  user_id,
  event_type,
  payload
)
select
  inserted_consents.user_id,
  'legacy_backfill',
  jsonb_build_object(
    'source', 'legacy_backfill',
    'consentVersion', '2026-03-12-1',
    'privacyVersion', '2026-03-12',
    'termsVersion', '2026-03-12'
  )
from inserted_consents;

commit;
