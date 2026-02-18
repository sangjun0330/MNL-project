create table if not exists public.ai_content (
  user_id text primary key,
  date_iso text not null,
  language text not null default 'ko',
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_content_date_iso
  on public.ai_content (date_iso);

alter table public.ai_content enable row level security;

drop policy if exists "ai_content_select_own" on public.ai_content;
drop policy if exists "ai_content_insert_own" on public.ai_content;
drop policy if exists "ai_content_update_own" on public.ai_content;
drop policy if exists "ai_content_delete_own" on public.ai_content;

create policy "ai_content_select_own"
  on public.ai_content
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy "ai_content_insert_own"
  on public.ai_content
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy "ai_content_update_own"
  on public.ai_content
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);

create policy "ai_content_delete_own"
  on public.ai_content
  for delete
  to authenticated
  using ((select auth.uid())::text = user_id);
