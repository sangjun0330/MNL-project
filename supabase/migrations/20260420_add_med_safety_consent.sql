begin;

alter table public.user_service_consents
  add column if not exists med_safety_consented_at timestamptz;

create index if not exists idx_user_service_consents_med_safety_consented
  on public.user_service_consents (user_id, med_safety_consented_at)
  where med_safety_consented_at is not null;

commit;
