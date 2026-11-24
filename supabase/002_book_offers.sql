-- Book offers and the /admin page.
-- Run after 001_progress.sql. Safe to re-run.

/* ---------------------------------------------------------------- admin */

-- The one owner account. Checked against auth.users (not the JWT claim) and
-- only once the address is confirmed, so nobody can claim it by signing up
-- with the same email unverified. Change the address here to hand over admin.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = 'farhoodiamirhosein@gmail.com'
      and email_confirmed_at is not null
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

/* --------------------------------------------------------------- offers */

create table if not exists public.book_offers (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  -- Null for anyone who offers without signing in.
  user_id       uuid default auth.uid() references auth.users (id) on delete set null,
  title         text check (char_length(title) <= 300),
  book_url      text check (book_url is null or (char_length(book_url) <= 2000 and book_url ~* '^https?://')),
  name          text check (char_length(name) <= 120),
  with_donation boolean not null default false,
  -- Explorer link or bare hash; the owner checks it by hand.
  tx_link       text check (char_length(tx_link) <= 500),
  status        text not null default 'new'
                check (status in ('new', 'planned', 'published', 'declined')),
  constraint book_offers_has_book
    check (coalesce(btrim(title), '') <> '' or coalesce(btrim(book_url), '') <> ''),
  constraint book_offers_donation_has_tx
    check (not with_donation or coalesce(btrim(tx_link), '') <> '')
);

create index if not exists book_offers_created_at on public.book_offers (created_at desc);

alter table public.book_offers enable row level security;

drop policy if exists "anyone can offer"   on public.book_offers;
drop policy if exists "admin reads offers" on public.book_offers;
drop policy if exists "admin edits offers" on public.book_offers;
drop policy if exists "admin drops offers" on public.book_offers;

-- Anyone may add an offer, but only as themselves (or anonymously) and only
-- as a fresh one. Nobody but the admin can read them back - offers can carry
-- a name, so they are not public.
create policy "anyone can offer" on public.book_offers for insert to anon, authenticated
  with check ((user_id is null or user_id = auth.uid()) and status = 'new');
create policy "admin reads offers" on public.book_offers for select using (public.is_admin());
create policy "admin edits offers" on public.book_offers for update using (public.is_admin()) with check (public.is_admin());
create policy "admin drops offers" on public.book_offers for delete using (public.is_admin());

/* --------------------------------------------------------- admin reports */
-- Security definer so they can read auth.users and every progress row, which
-- RLS otherwise hides. Each one refuses anyone but the admin.

-- Offers with the submitter's account email, when they were signed in.
create or replace function public.admin_offers()
returns table (
  id bigint, created_at timestamptz, title text, book_url text, name text,
  with_donation boolean, tx_link text, status text, email text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select o.id, o.created_at, o.title, o.book_url, o.name,
           o.with_donation, o.tx_link, o.status, u.email::text
    from public.book_offers o
    left join auth.users u on u.id = o.user_id
    order by o.created_at desc;
end;
$$;

-- One row per account, with what their progress blob says they have done.
create or replace function public.admin_users()
returns table (
  id uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz,
  last_active_at timestamptz, xp int, streak int, passed int, books int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select u.id, u.email::text,
           coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
           u.created_at, u.last_sign_in_at, p.updated_at,
           coalesce((p.data ->> 'xp')::int, 0),
           coalesce((p.data -> 'streak' ->> 'count')::int, 0),
           (select count(*)::int
              from jsonb_each(coalesce(p.data -> 'books', '{}'::jsonb)) b,
                   jsonb_each(coalesce(b.value -> 'units', '{}'::jsonb)) un
             where un.value ->> 'status' = 'passed'),
           (select count(*)::int from jsonb_object_keys(coalesce(p.data -> 'books', '{}'::jsonb)))
    from auth.users u
    left join public.progress p on p.user_id = u.id
    order by coalesce(p.updated_at, u.last_sign_in_at, u.created_at) desc;
end;
$$;

-- Headline numbers for the overview tab.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users_total',     (select count(*) from auth.users),
    'users_new_7d',    (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_new_30d',   (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_1d',       (select count(*) from public.progress where updated_at > now() - interval '1 day'),
    'active_7d',       (select count(*) from public.progress where updated_at > now() - interval '7 days'),
    'active_30d',      (select count(*) from public.progress where updated_at > now() - interval '30 days'),
    'xp_total',        (select coalesce(sum((data ->> 'xp')::int), 0) from public.progress),
    'passed_total',    (select count(*)
                          from public.progress p,
                               jsonb_each(coalesce(p.data -> 'books', '{}'::jsonb)) b,
                               jsonb_each(coalesce(b.value -> 'units', '{}'::jsonb)) un
                         where un.value ->> 'status' = 'passed'),
    'offers_total',    (select count(*) from public.book_offers),
    'offers_new',      (select count(*) from public.book_offers where status = 'new'),
    'offers_donated',  (select count(*) from public.book_offers where with_donation),
    -- Sign-ups per day for the last 30 days, gaps filled with zero.
    'signups_by_day',  (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day), '[]'::jsonb)
                          from (select g.day::date as day,
                                       (select count(*) from auth.users u where u.created_at::date = g.day::date) as n
                                  from generate_series(current_date - 29, current_date, interval '1 day') g(day)) d),
    -- Learners per book: anyone who has opened at least one of its units.
    'books',           (select coalesce(jsonb_agg(jsonb_build_object('slug', x.slug, 'learners', x.learners, 'passed', x.passed)
                                                  order by x.learners desc), '[]'::jsonb)
                          from (select b.key as slug,
                                       count(distinct p.user_id) as learners,
                                       count(un.key) filter (where un.value ->> 'status' = 'passed') as passed
                                  from public.progress p,
                                       jsonb_each(coalesce(p.data -> 'books', '{}'::jsonb)) b
                                       left join lateral jsonb_each(coalesce(b.value -> 'units', '{}'::jsonb)) un on true
                                 group by b.key) x)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_offers() from public, anon;
revoke all on function public.admin_users()  from public, anon;
revoke all on function public.admin_stats()  from public, anon;
grant execute on function public.admin_offers() to authenticated;
grant execute on function public.admin_users()  to authenticated;
grant execute on function public.admin_stats()  to authenticated;
