-- Per-user progress: one JSON blob per signed-in account.
-- The shape matches the `Progress` interface in src/lib/storage.ts, so the
-- client can round-trip its whole local state without a schema migration
-- every time a field is added.
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Every read and write goes straight from the browser to Postgres, so RLS is
-- the only thing standing between users. Without it the publishable key would
-- expose every row.
alter table public.progress enable row level security;

drop policy if exists "read own progress"   on public.progress;
drop policy if exists "insert own progress" on public.progress;
drop policy if exists "update own progress" on public.progress;

create policy "read own progress"   on public.progress for select using (auth.uid() = user_id);
create policy "insert own progress" on public.progress for insert with check (auth.uid() = user_id);
create policy "update own progress" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Stamped server-side so a client with a wrong clock cannot win a merge.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_touch_updated_at on public.progress;
create trigger progress_touch_updated_at
  before update on public.progress
  for each row execute function public.touch_updated_at();
