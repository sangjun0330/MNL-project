begin;

create or replace function public.tg_log_rnest_user_state_revision()
returns trigger
language plpgsql
as $$
begin
  -- Avoid revision spam on no-op updates where payload content is unchanged.
  if tg_op = 'UPDATE' and new.payload is not distinct from old.payload then
    return new;
  end if;

  insert into public.rnest_user_state_revisions (user_id, payload, source)
  values (new.user_id, new.payload, 'api');

  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');

commit;
