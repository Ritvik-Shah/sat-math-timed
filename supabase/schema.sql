-- SAT Math Timed — Supabase schema.
--
-- Idempotent: safe to paste into the Supabase SQL editor and re-run after
-- future edits (uses `if not exists` / `create or replace` throughout).
--
-- ---------------------------------------------------------------------------
-- TRUST MODEL (read this before editing RLS policies)
-- ---------------------------------------------------------------------------
-- There is no self-serve signup and no billing integration in this build.
-- The site owner provisions every account by hand from the Supabase
-- dashboard (Authentication → Users → "Invite user") and grants paid access
-- by hand-inserting a row into `subscriptions`. That split shapes the RLS
-- policies below:
--
--   * profiles           — user-writable (own row only). Low-stakes: it's
--                           just a display name, and the row is
--                           auto-created by a trigger anyway so a user can't
--                           create extras or impersonate someone else.
--   * subscriptions       — READ-ONLY for the owning user. No insert/update/
--                           delete policy exists for the `authenticated`
--                           role at all, which means Postgres denies those
--                           operations by default (RLS is deny-by-default;
--                           absence of a policy = no access). Only the
--                           service-role key (used from the SQL editor, or
--                           a service-role script/Worker) can write here.
--                           This is the actual paywall: a client can never
--                           grant itself access no matter what it sends.
--   * question_attempts   — user-writable, but gated by
--                           is_subscription_active() so a signed-in user
--                           without an active subscription can't write
--                           practice history either. This is product
--                           behavior, not a security boundary.
--   * sessions            — same as question_attempts: insert/select only,
--                           gated on an active subscription. No update/
--                           delete — a finished session is a fact, not
--                           something the client should be able to edit
--                           after the fact.
--   * tutor_usage          — READ-ONLY for the owning user, same reasoning
--                           as subscriptions: the Worker increments this
--                           with the service-role key so a client can't
--                           reset or inflate its own quota.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- profiles
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for regular users on purpose: rows are created
-- only by the trigger below (as the table owner, which bypasses RLS) and
-- removed only via the auth.users cascade when an account is deleted.

-- Table-level GRANTs are a separate, coarser gate that Postgres checks
-- BEFORE row-level security policies — without these, RLS policies above
-- never even get evaluated and every query is denied outright, including
-- a user reading their own row. Grants below mirror exactly the operations
-- each table's RLS policies already permit; nothing wider.
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Auto-creates a profiles row whenever a new auth.users row appears, so
-- profile creation can't be skipped or spoofed from the client. Runs as
-- security definer (the function owner, not the caller) so it can insert
-- into public.profiles regardless of the new user's own RLS visibility.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- subscriptions — one row per user; write access is service-role only.
-- ============================================================================

create table if not exists public.subscriptions (
  user_id uuid unique not null references auth.users(id) on delete cascade,
  plan text check (plan in ('monthly', 'yearly', 'admin_grant')),
  status text check (status in ('active', 'canceled', 'past_due')),
  current_period_end timestamptz,
  -- Forward-compat placeholders only — nothing in this build uses Stripe.
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- Deliberately no insert/update/delete policy for the authenticated role:
-- RLS denies by default when no policy grants an operation, so regular
-- users have zero ability to write this table. Only the service-role key
-- (SQL editor, or a service-role script) can create/modify rows.
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- Reusable check for "does this uid currently have paid access". security
-- definer so it can read public.subscriptions regardless of the caller's
-- own RLS visibility into that table (the caller can only SELECT their own
-- row directly, but this function needs to evaluate the same fact from
-- inside other tables' RLS policies below).
create or replace function public.is_subscription_active(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = uid
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

grant execute on function public.is_subscription_active(uuid) to authenticated;

-- ============================================================================
-- question_attempts — per-user spaced-practice history.
-- ============================================================================

create table if not exists public.question_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  signature text not null,
  category text,
  subcategory text,
  last_correct boolean,
  attempts_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, signature)
);

alter table public.question_attempts enable row level security;

drop policy if exists "question_attempts_select_own" on public.question_attempts;
create policy "question_attempts_select_own"
  on public.question_attempts for select
  using (user_id = auth.uid() and public.is_subscription_active(auth.uid()));

drop policy if exists "question_attempts_insert_own" on public.question_attempts;
create policy "question_attempts_insert_own"
  on public.question_attempts for insert
  with check (user_id = auth.uid() and public.is_subscription_active(auth.uid()));

drop policy if exists "question_attempts_update_own" on public.question_attempts;
create policy "question_attempts_update_own"
  on public.question_attempts for update
  using (user_id = auth.uid() and public.is_subscription_active(auth.uid()))
  with check (user_id = auth.uid() and public.is_subscription_active(auth.uid()));

-- Upserts one row per (user, question signature) from the caller's own JWT
-- identity — user_id is never taken as a parameter, so a client can't
-- spoof another user's attempt history. security definer so it can run
-- even though the row-level checks above would otherwise apply the same
-- way twice; invoker's auth.uid() still governs which row gets touched.
create or replace function public.upsert_question_attempt(
  p_signature text,
  p_category text,
  p_subcategory text,
  p_correct boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_subscription_active(auth.uid()) then
    raise exception 'subscription required';
  end if;

  insert into public.question_attempts
    (user_id, signature, category, subcategory, last_correct, attempts_count, first_seen_at, last_seen_at)
  values
    (auth.uid(), p_signature, p_category, p_subcategory, p_correct, 1, now(), now())
  on conflict (user_id, signature) do update
    set attempts_count = public.question_attempts.attempts_count + 1,
        last_correct = excluded.last_correct,
        category = excluded.category,
        subcategory = excluded.subcategory,
        last_seen_at = now();
end;
$$;

grant execute on function public.upsert_question_attempt(text, text, text, boolean) to authenticated;
grant select, insert, update on public.question_attempts to authenticated;
grant all on public.question_attempts to service_role;

-- ============================================================================
-- sessions — one row per completed practice session. Append-only from the
-- client (select/insert only; no update/delete policy).
-- ============================================================================

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_filter text,
  question_count int,
  timed boolean,
  correct_count int,
  total_count int,
  flagged_count int,
  category_breakdown jsonb,
  started_at timestamptz,
  finished_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select
  using (user_id = auth.uid() and public.is_subscription_active(auth.uid()));

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert
  with check (user_id = auth.uid() and public.is_subscription_active(auth.uid()));

-- No update/delete policy on purpose: a finished session is a historical
-- fact, not something the client should be able to edit or erase.
grant select, insert on public.sessions to authenticated;
grant all on public.sessions to service_role;

-- ============================================================================
-- tutor_usage — per-user, per-month AI Tutor request count. Read-only for
-- the owning user; the Worker increments this with the service-role key.
-- ============================================================================

create table if not exists public.tutor_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null, -- first-of-month, e.g. 2026-08-01
  request_count int not null default 0,
  unique (user_id, period_start)
);

alter table public.tutor_usage enable row level security;

drop policy if exists "tutor_usage_select_own" on public.tutor_usage;
create policy "tutor_usage_select_own"
  on public.tutor_usage for select
  using (user_id = auth.uid());

-- Deliberately no insert/update/delete policy for the authenticated role,
-- same reasoning as subscriptions: only the service-role key (used by the
-- Worker) can write usage counts, so a client can't reset or inflate its
-- own quota.
grant select on public.tutor_usage to authenticated;
grant all on public.tutor_usage to service_role;
