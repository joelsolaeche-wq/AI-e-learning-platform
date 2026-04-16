-- =============================================================================
-- Migration: create_users_table
--
-- Creates the public.users profile table that mirrors auth.users and
-- automatically populates it via a trigger whenever a new row is inserted
-- into auth.users (i.e. on every sign-up, regardless of provider).
--
-- Default role for every new user is 'learner'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role enum
--    Centralises the set of valid roles so application code and DB constraints
--    stay in sync.
-- ---------------------------------------------------------------------------
create type public.user_role as enum (
  'learner',
  'instructor',
  'admin'
);

-- ---------------------------------------------------------------------------
-- 2. public.users table
--    One row per authenticated user.  The primary key is the same UUID used
--    by Supabase Auth so foreign keys from other tables work without a join.
-- ---------------------------------------------------------------------------
create table public.users (
  -- Matches auth.users.id exactly so we can do a direct FK.
  id            uuid          primary key references auth.users (id) on delete cascade,

  -- Copied from auth.users for convenience; kept in sync by the trigger.
  email         text          not null,

  -- Application-level role, defaulting to the least-privileged value.
  role          public.user_role not null default 'learner',

  -- Timestamps
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

comment on table public.users is
  'Application user profiles. One row per auth.users entry.';
comment on column public.users.id is
  'UUID from auth.users — serves as both PK and FK.';
comment on column public.users.email is
  'User email address, copied from auth.users on insert.';
comment on column public.users.role is
  'Application role. New users default to ''learner''.';

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger helper
--    Reuses (or creates) a generic function that stamps updated_at on every
--    UPDATE, so we do not need a bespoke function per table.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Trigger function: create a public.users row on auth sign-up
--
--    * SECURITY DEFINER so the trigger can write to public.users even when
--      the session role is the authenticator / anon role.
--    * search_path is locked down to prevent search-path injection attacks.
--    * ON CONFLICT DO NOTHING makes the function idempotent — safe to call
--      more than once for the same user (e.g. if a migration is re-run).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, role, created_at, updated_at)
  values (
    new.id,
    new.email,
    'learner',          -- default role for every new sign-up
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger function: mirrors a newly created auth.users row into public.users '
  'with a default role of ''learner''.';

-- ---------------------------------------------------------------------------
-- 5. Attach the trigger to auth.users
--    AFTER INSERT so auth.users is fully committed before we write the
--    profile row.  FOR EACH ROW so every individual sign-up is handled.
-- ---------------------------------------------------------------------------
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security (RLS)
--    Enable RLS immediately; policies added here follow the principle of
--    least privilege.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

-- Users can read their own profile row.
create policy "users: select own row"
  on public.users
  for select
  using (auth.uid() = id);

-- Users can update their own profile row, but cannot change their own role
-- (role changes must go through a privileged server-side function).
create policy "users: update own row"
  on public.users
  for update
  using  (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Prevent self-escalation: the new role must equal the existing role.
    and role = (select role from public.users where id = auth.uid())
  );

-- Service-role and admin users (role = 'admin') can read all profiles.
create policy "users: admin select all"
  on public.users
  for select
  using (
    (select role from public.users where id = auth.uid()) = 'admin'
  );
