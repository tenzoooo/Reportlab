-- 既存の profiles テーブルが型不一致（BigInt）の可能性があるため、一度削除して作り直します。
-- ※データは空とのことなので安全ですが、もしデータがある場合はバックアップが必要です。
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. profiles テーブルの作成（UUID型で作成）
create table public.profiles (
  id uuid not null references auth.users on delete cascade,
  updated_at timestamp with time zone,
  username text unique,
  full_name text,
  avatar_url text,
  website text,
  email text,
  university text,
  department text,
  grade text,
  plan text default 'free',
  credits integer default 0,

  primary key (id),
  unique(username),
  constraint username_length check (char_length(username) >= 3)
);

-- 2. RLS（セキュリティ）の設定
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 3. ユーザー登録時に自動で profiles を作成するトリガー
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

-- トリガーの再作成
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. 既存のユーザーのために profiles をバックフィル
insert into public.profiles (id, email)
select id, email from auth.users
where id not in (select id from public.profiles);
