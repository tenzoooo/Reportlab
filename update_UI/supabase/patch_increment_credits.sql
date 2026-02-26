-- Patch for production/staging Supabase DB:
-- Make increment_credits resilient when profiles row is missing or credits is NULL.
--
-- Apply in Supabase SQL editor (or via migration tooling) BEFORE relying on webhook credit grants.

create or replace function public.increment_credits(user_id_arg uuid, amount_arg int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, credits)
  values (user_id_arg, 0)
  on conflict (id) do nothing;

  update public.profiles
  set credits = coalesce(credits, 0) + amount_arg
  where id = user_id_arg;
end;
$$;
