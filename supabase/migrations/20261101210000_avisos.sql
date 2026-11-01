-- Avisos al telefono. Cada ciclista puede tener varios aparatos (el iPhone, un iPad),
-- asi que la clave es la direccion de la suscripcion, no el usuario.
--
-- Nada de esto cuesta plata: el aviso no llama a Claude, solo avisa que el dia ya esta
-- calculado. El calculo en si es gratis y corre en el telefono.
create table if not exists public.push_subs (
  endpoint    text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  zona        text not null default 'America/Costa_Rica',  -- para saber cuando amanece para el
  avisado_el  date,                                        -- el ultimo dia que ya se le aviso
  fallos      integer not null default 0,                  -- se borra sola tras varios fallos
  created_at  timestamptz not null default now()
);

create index if not exists push_subs_by_user on public.push_subs (user_id);

alter table public.push_subs enable row level security;

-- Cada quien maneja solo los avisos de sus propios aparatos.
drop policy if exists "cada quien ve sus avisos" on public.push_subs;
create policy "cada quien ve sus avisos"
  on public.push_subs for select using (auth.uid() = user_id);

drop policy if exists "cada quien activa sus avisos" on public.push_subs;
create policy "cada quien activa sus avisos"
  on public.push_subs for insert with check (auth.uid() = user_id);

drop policy if exists "cada quien cambia sus avisos" on public.push_subs;
create policy "cada quien cambia sus avisos"
  on public.push_subs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cada quien apaga sus avisos" on public.push_subs;
create policy "cada quien apaga sus avisos"
  on public.push_subs for delete using (auth.uid() = user_id);
