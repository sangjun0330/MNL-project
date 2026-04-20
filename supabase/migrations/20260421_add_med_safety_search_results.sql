create table if not exists public.med_safety_search_results (
  id bigserial primary key,
  user_id text not null references public.rnest_users(user_id) on delete cascade,
  query text not null,
  query_hash text not null,
  search_type text not null,
  language text not null default 'ko',
  model text not null,
  route_decision jsonb,
  grounding_summary jsonb,
  answer_schema jsonb not null,
  quality jsonb,
  verifier_flags jsonb,
  latency_ms integer,
  token_usage jsonb,
  user_feedback jsonb,
  created_at timestamptz not null default now(),
  constraint med_safety_search_results_search_type_check
    check (search_type in ('standard', 'premium')),
  constraint med_safety_search_results_language_check
    check (language in ('ko', 'en')),
  constraint med_safety_search_results_answer_schema_object_check
    check (jsonb_typeof(answer_schema) = 'object')
);

create index if not exists idx_med_safety_search_results_created
  on public.med_safety_search_results (created_at desc);

create index if not exists idx_med_safety_search_results_user_created
  on public.med_safety_search_results (user_id, created_at desc);

create index if not exists idx_med_safety_search_results_query_hash
  on public.med_safety_search_results (query_hash);

alter table public.med_safety_search_results enable row level security;

drop policy if exists "med_safety_search_results_select_own" on public.med_safety_search_results;
create policy "med_safety_search_results_select_own"
  on public.med_safety_search_results for select to authenticated
  using ((select auth.uid())::text = user_id);

grant select on table public.med_safety_search_results to authenticated;
