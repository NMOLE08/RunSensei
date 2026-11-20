-- Account-first RunSensei identity and resumable onboarding.
-- This migration deliberately contains no service-role credential and does not
-- grant a client permission to read another account's information.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 100)
);

create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  current_step text,
  schema_version integer not null default 1 check (schema_version > 0),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.onboarding_progress enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "onboarding_select_own" on public.onboarding_progress for select to authenticated using (user_id = auth.uid());

create or replace function public.runsensei_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.runsensei_touch_updated_at();
drop trigger if exists onboarding_progress_touch_updated_at on public.onboarding_progress;
create trigger onboarding_progress_touch_updated_at before update on public.onboarding_progress for each row execute function public.runsensei_touch_updated_at();

create or replace function public.runsensei_create_account_rows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''), nullif(new.raw_user_meta_data ->> 'avatar_url', ''))
  on conflict (id) do nothing;
  insert into public.onboarding_progress (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_runsensei on auth.users;
create trigger on_auth_user_created_runsensei after insert on auth.users for each row execute function public.runsensei_create_account_rows();

-- Backfill accounts created before this migration.
insert into public.profiles (id, display_name, avatar_url)
select id, nullif(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'), ''), nullif(raw_user_meta_data ->> 'avatar_url', '') from auth.users
on conflict (id) do nothing;
insert into public.onboarding_progress (user_id) select id from auth.users on conflict (user_id) do nothing;

create or replace function public.ensure_own_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.onboarding_progress (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

create or replace function public.update_own_profile(p_display_name text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.profiles set display_name = nullif(trim(p_display_name), '') where id = auth.uid();
  select * into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

create or replace function public.save_own_onboarding_progress(p_current_step text, p_schema_version integer, p_answers jsonb)
returns public.onboarding_progress language plpgsql security definer set search_path = public as $$
declare result public.onboarding_progress;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_schema_version is null or p_schema_version < 1 then raise exception 'invalid onboarding schema version'; end if;
  insert into public.onboarding_progress (user_id, status, current_step, schema_version, answers)
  values (auth.uid(), 'in_progress', nullif(trim(p_current_step), ''), p_schema_version, coalesce(p_answers, '{}'::jsonb))
  on conflict (user_id) do update set status = case when onboarding_progress.status = 'completed' then 'completed' else 'in_progress' end,
    current_step = excluded.current_step, schema_version = excluded.schema_version, answers = excluded.answers;
  select * into result from public.onboarding_progress where user_id = auth.uid();
  return result;
end;
$$;

create or replace function public.complete_own_onboarding(p_schema_version integer, p_answers jsonb)
returns public.onboarding_progress language plpgsql security definer set search_path = public as $$
declare result public.onboarding_progress;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_schema_version is null or p_schema_version < 1 then raise exception 'invalid onboarding schema version'; end if;
  if not coalesce(p_answers, '{}'::jsonb) ?& array['goal', 'planStartDate', 'trainingDays', 'minuteLimits', 'interruption', 'adultAgeConfirmed', 'canWalk30MinutesComfortably', 'first5kExperience'] then
    raise exception 'required onboarding answers are missing';
  end if;
  insert into public.onboarding_progress (user_id, status, current_step, schema_version, answers, completed_at)
  values (auth.uid(), 'completed', 'assessment', p_schema_version, p_answers, now())
  on conflict (user_id) do update set status = 'completed', current_step = 'assessment', schema_version = excluded.schema_version, answers = excluded.answers, completed_at = now();
  select * into result from public.onboarding_progress where user_id = auth.uid();
  return result;
end;
$$;

revoke all on public.profiles, public.onboarding_progress from anon, authenticated;
grant select on public.profiles, public.onboarding_progress to authenticated;
grant execute on function public.ensure_own_profile() to authenticated;
grant execute on function public.update_own_profile(text) to authenticated;
grant execute on function public.save_own_onboarding_progress(text, integer, jsonb) to authenticated;
grant execute on function public.complete_own_onboarding(integer, jsonb) to authenticated;
