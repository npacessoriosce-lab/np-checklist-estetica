create or replace function public.next_checklist_os()
returns bigint
language sql
security definer
as $$
  select last_value + 1 from public.checklist_os_seq;
$$;

grant execute on function public.next_checklist_os() to anon;
