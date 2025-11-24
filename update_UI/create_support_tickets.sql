-- お問い合わせ内容を保存するテーブルを作成
create table if not exists public.support_tickets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  user_id uuid references auth.users(id) on delete set null -- ログインユーザーの場合紐付け
);

-- RLS（セキュリティ）設定
alter table public.support_tickets enable row level security;

-- 誰でも問い合わせを作成（保存）できるようにする
create policy "Allow public insert to support_tickets"
  on public.support_tickets
  for insert
  with check (true);

-- 自分の問い合わせ履歴は見れるようにする（ログインユーザーのみ）
create policy "Users can view own tickets"
  on public.support_tickets
  for select
  using (auth.uid() = user_id);

-- 管理者（service_role）は全権限を持つ（デフォルトで許可されるため明示的なポリシーは不要だが、念のため）
