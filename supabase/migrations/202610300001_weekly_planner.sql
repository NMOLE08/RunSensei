create table if not exists public.weekly_runner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  questionnaire jsonb not null,
  questionnaire_version text not null,
  consent_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_native_run_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

create table if not exists public.weekly_training_policies (
  id text not null,
  version text not null,
  status text not null check (status in ('demo', 'research_draft', 'reviewed', 'retired')),
  active boolean not null default false,
  policy jsonb not null,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  revision integer not null,
  status text not null check (status in ('draft', 'accepted', 'completed', 'superseded', 'blocked')),
  plan jsonb not null,
  input_fingerprint text not null,
  policy_version text not null,
  prompt_version text not null,
  model_id text not null,
  generated_at timestamptz not null default now(),
  validated_at timestamptz not null default now(),
  unique (user_id, start_date, revision)
);

create unique index if not exists weekly_one_active_plan
  on public.weekly_plans (user_id, start_date)
  where status in ('draft', 'accepted');

create table if not exists public.weekly_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_date date not null,
  template_id text not null,
  prescription jsonb not null,
  unique (plan_id, scheduled_date)
);

create table if not exists public.weekly_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  idempotency_key text not null,
  input_fingerprint text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  plan_id uuid references public.weekly_plans(id),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

alter table public.weekly_runner_profiles enable row level security;
alter table public.weekly_native_run_summaries enable row level security;
alter table public.weekly_training_policies enable row level security;
alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_sessions enable row level security;
alter table public.weekly_generation_requests enable row level security;

create policy "users manage own weekly questionnaire" on public.weekly_runner_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users read own weekly plans" on public.weekly_plans
  for select using (auth.uid() = user_id);
create policy "users delete own weekly plans" on public.weekly_plans
  for delete using (auth.uid() = user_id);
create policy "users read own weekly sessions" on public.weekly_plan_sessions
  for select using (auth.uid() = user_id);

create or replace function public.save_generated_weekly_plan(
  p_user_id uuid,
  p_start_date date,
  p_plan jsonb,
  p_input_fingerprint text,
  p_policy_version text,
  p_prompt_version text,
  p_model_id text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id uuid;
  day jsonb;
begin
  select id into existing_id from public.weekly_plans
    where user_id = p_user_id and start_date = p_start_date
      and status in ('draft', 'accepted') and input_fingerprint = p_input_fingerprint
    for update;
  if existing_id is not null then
    update public.weekly_generation_requests set status = 'completed', plan_id = existing_id, completed_at = now()
      where user_id = p_user_id and idempotency_key = p_idempotency_key;
    return existing_id;
  end if;
  if exists (select 1 from public.weekly_plans where user_id = p_user_id and start_date = p_start_date and status in ('draft', 'accepted')) then
    raise exception 'active_week_requires_review';
  end if;
  insert into public.weekly_plans (user_id, start_date, end_date, revision, status, plan, input_fingerprint, policy_version, prompt_version, model_id)
  values (p_user_id, p_start_date, p_start_date + 6, 1, 'draft', p_plan, p_input_fingerprint, p_policy_version, p_prompt_version, p_model_id)
  returning id into new_id;
  for day in select * from jsonb_array_elements(p_plan->'days') loop
    insert into public.weekly_plan_sessions (plan_id, user_id, scheduled_date, template_id, prescription)
    values (new_id, p_user_id, (day->>'date')::date, day->>'templateId', day);
  end loop;
  update public.weekly_generation_requests set status = 'completed', plan_id = new_id, completed_at = now()
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  return new_id;
end;
$$;

revoke all on function public.save_generated_weekly_plan(uuid,date,jsonb,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_generated_weekly_plan(uuid,date,jsonb,text,text,text,text,text) to service_role;
