-- Perfil de cada ciclista, uno por cuenta.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  lang text not null default 'es',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "cada quien ve y edita solo su perfil"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Crea el perfil solo cuando se confirma el correo (entrada por enlace).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Clave de intervals.icu de cada ciclista. Protegida: solo el dueno la lee o la cambia.
-- El servidor (funcion programada) la lee aparte, con la llave de servicio, nunca desde el navegador.
create table public.intervals_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  api_key text not null,
  athlete_id text,
  connected_at timestamptz not null default now()
);

alter table public.intervals_connections enable row level security;

create policy "cada quien ve y edita solo su propia conexion"
  on public.intervals_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
