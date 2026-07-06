-- AadesiPo M9 schema additions

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "users manage their own push subscriptions"
  on push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No client-facing select policy for other users' subscriptions — only
-- the service role (used by validate-action to send "your turn" pushes)
-- reads across users, which bypasses RLS entirely as usual.
