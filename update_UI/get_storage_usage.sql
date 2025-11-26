create or replace function get_storage_usage(user_id uuid)
returns bigint
language plpgsql
security definer
as $$
declare
  total_size bigint;
begin
  select sum((metadata->>'size')::bigint)
  into total_size
  from storage.objects
  where owner = user_id;
  
  return coalesce(total_size, 0);
end;
$$;
