-- Metas del ciclista (carreras, eventos) y el plan que arma el entrenador hacia ellas.
-- El entrenador escribe aqui desde la funcion coach-chat; el ciclista solo lee.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  goal_date date not null,
  priority text not null default 'A',          -- A, B o C: que tan importante es
  notes text,
  created_at timestamptz not null default now()
);

create index goals_by_user on public.goals (user_id, goal_date);

alter table public.goals enable row level security;

create policy "cada quien ve solo sus metas"
  on public.goals for select
  using (auth.uid() = user_id);

-- Un dia planificado. Lo escribe el entrenador; puede ser un entrenamiento con pasos,
-- o simplemente la decision del dia (descanso, suave) sin pasos.
create table public.planned_sessions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  decision text,                               -- entrenar, suave, descanso
  title text,
  purpose text,
  steps jsonb,                                 -- [{name, min, int, p:[lo,hi], hr:[lo,hi]|null}]
  note text,                                   -- por que, en una frase
  source text not null default 'ai',           -- ai o manual
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.planned_sessions enable row level security;

create policy "cada quien ve solo su plan"
  on public.planned_sessions for select
  using (auth.uid() = user_id);
