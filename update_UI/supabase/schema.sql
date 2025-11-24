-- Add credits column to profiles table
alter table profiles 
add column if not exists credits integer default 0;

-- Create subscriptions table
create table if not exists subscriptions (
  id text primary key, -- Stripe Subscription ID
  user_id uuid references auth.users not null,
  status text not null, -- 'active', 'canceled', 'past_due', etc.
  price_id text not null,
  cancel_at_period_end boolean default false,
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
create or replace function increment_credits(user_id_arg uuid, amount_arg int)
returns void
language plpgsql
security definer
as $$
begin
  update profiles
  set credits = credits + amount_arg
  where id = user_id_arg;
end;
$$;
