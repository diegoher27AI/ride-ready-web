-- Perfil deportivo traido de intervals.icu: peso, FTP, pulso maximo y zonas.
-- Se guarda tambien el original (raw) por si alguna cuenta trae las zonas en otra forma
-- y hay que revisarlo despues sin volver a pedir los datos.
create table public.athlete_profile (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  weight_kg numeric,
  ftp_w integer,
  hr_max integer,
  lthr integer,
  power_zones jsonb,
  heart_rate_zones jsonb,
  raw jsonb,
  updated_at timestamptz not null default now()
);

alter table public.athlete_profile enable row level security;

create policy "cada quien ve solo su perfil deportivo"
  on public.athlete_profile for select
  using (auth.uid() = user_id);
