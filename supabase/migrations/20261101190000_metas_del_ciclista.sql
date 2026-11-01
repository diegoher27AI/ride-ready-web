-- Las metas las escribia solo el entrenador desde coach-chat, y el ciclista unicamente
-- las leia. Ahora las puede agregar y borrar el mismo desde la app, con el boton +.
--
-- Ademas, muchos eventos duran varios dias (una vuelta por etapas, una Haute Route),
-- asi que una sola fecha no alcanzaba.
alter table public.goals
  add column if not exists end_date   date,       -- si el evento dura varios dias
  add column if not exists distance_km numeric,   -- lo que el ciclista sepa del evento
  add column if not exists climb_m     integer,
  add column if not exists sabe_ia     text;      -- lo que el entrenador reconoce del evento

-- El ciclista maneja sus propias metas. Cada quien solo las suyas, como todo lo demas.
drop policy if exists "cada quien agrega sus metas" on public.goals;
create policy "cada quien agrega sus metas"
  on public.goals for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada quien edita sus metas" on public.goals;
create policy "cada quien edita sus metas"
  on public.goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cada quien borra sus metas" on public.goals;
create policy "cada quien borra sus metas"
  on public.goals for delete
  using (auth.uid() = user_id);
