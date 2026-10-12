-- Actividades y bienestar diario traidos de intervals.icu (Garmin, Karoo, Whoop).
create table public.activities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id text not null,
  date date not null,
  name text,
  sport text,
  moving_min numeric,
  distance_km numeric,
  relative_effort integer,
  calories integer,
  avg_hr integer,
  max_hr integer,
  avg_watts numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_id)
);

alter table public.activities enable row level security;

create policy "cada quien ve solo sus actividades"
  on public.activities for select
  using (auth.uid() = user_id);

-- Bienestar diario (recuperacion, VFC, pulso en reposo, sueno) de Whoop via intervals.icu.
create table public.wellness (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  readiness numeric,
  hrv numeric,
  resting_hr integer,
  sleep_min integer,
  respiration numeric,
  raw jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.wellness enable row level security;

create policy "cada quien ve solo su bienestar"
  on public.wellness for select
  using (auth.uid() = user_id);
