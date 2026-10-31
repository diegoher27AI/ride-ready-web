-- Cuenta cuantos mensajes al entrenador manda cada ciclista por dia.
-- La clave de la API es una sola (la del dueno de la app) y la pagan sus creditos,
-- asi que esto evita que un solo usuario se gaste el saldo de todos.
create table public.coach_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.coach_usage enable row level security;

create policy "cada quien ve solo su propio uso"
  on public.coach_usage for select
  using (auth.uid() = user_id);

-- Suma uno y devuelve cuantos lleva hoy. La funcion corre con permisos del dueno
-- para que el conteo no se pueda alterar desde el telefono.
create function public.bump_coach_usage(p_user uuid, p_limit integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  insert into public.coach_usage (user_id, day, messages)
  values (p_user, current_date, 1)
  on conflict (user_id, day)
    do update set messages = coach_usage.messages + 1, updated_at = now()
  returning messages into n;
  return n;
end;
$$;
