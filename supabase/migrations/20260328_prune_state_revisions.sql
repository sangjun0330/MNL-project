-- rnest_user_state_revisions 자동 정리
-- 각 사용자별로 가장 최근 30개 revisions만 유지한다.
-- 새 revision이 INSERT될 때마다 트리거가 실행되어 30개를 초과하는 오래된 행을 삭제한다.

begin;

create or replace function public.tg_prune_rnest_user_state_revisions()
returns trigger
language plpgsql
as $$
begin
  -- 해당 user_id의 revision을 최신순으로 30개만 남기고 나머지 삭제
  delete from public.rnest_user_state_revisions
  where user_id = new.user_id
    and id not in (
      select id
      from public.rnest_user_state_revisions
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 30
    );
  return new;
end;
$$;

-- 기존 트리거가 있으면 교체
drop trigger if exists trg_prune_rnest_user_state_revisions
  on public.rnest_user_state_revisions;

create trigger trg_prune_rnest_user_state_revisions
after insert on public.rnest_user_state_revisions
for each row execute function public.tg_prune_rnest_user_state_revisions();

-- 기존에 쌓여있는 30개 초과분을 한 번에 정리 (backfill)
-- 각 유저별로 created_at desc 기준 30개를 초과하는 오래된 행을 삭제
delete from public.rnest_user_state_revisions
where id not in (
  select id
  from (
    select
      id,
      row_number() over (partition by user_id order by created_at desc, id desc) as rn
    from public.rnest_user_state_revisions
  ) ranked
  where rn <= 30
);

select pg_notify('pgrst', 'reload schema');

commit;
