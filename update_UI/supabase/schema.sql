-- Add credits column to profiles table
alter table profiles 
add column if not exists credits integer default 0;

-- Add theme preference to profiles table
alter table profiles
add column if not exists theme text default 'system';

-- Create subscriptions table
create table if not exists subscriptions (
  id text primary key, -- Stripe Subscription ID
  user_id uuid references auth.users not null,
  status text not null, -- 'active', 'canceled', 'past_due', etc.
  price_id text not null,
  cancel_at_period_end boolean default false,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create credit_transactions table
create table if not exists credit_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  amount integer not null, -- Positive for add, negative for spend
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table subscriptions enable row level security;
alter table credit_transactions enable row level security;

-- Policies for subscriptions
create policy "Users can view own subscriptions" 
  on subscriptions for select 
  using (auth.uid() = user_id);

-- Policies for credit_transactions
create policy "Users can view own credit transactions" 
  on credit_transactions for select 
  using (auth.uid() = user_id);

-- RPC function to increment credits
create or replace function public.increment_credits(user_id_arg uuid, amount_arg int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Safety:
  -- 1) If the profiles row doesn't exist, a plain UPDATE is a silent no-op.
  -- 2) If credits is NULL, "credits + amount" becomes NULL forever.
  insert into public.profiles (id, credits)
  values (user_id_arg, 0)
  on conflict (id) do nothing;

  update public.profiles
  set credits = coalesce(credits, 0) + amount_arg
  where id = user_id_arg;
end;
$$;
