-- Mejor potencia de 5 y 20 minutos de cada salida, y el peso con el que se midio.
-- Sin esto, la tarjeta "Mejor 5 min" mostraba el numero del ciclista de ejemplo
-- (307 W, 4.09 W/kg) como si fuera del ciclista de verdad.
alter table public.activities
  add column if not exists p5_w       integer,
  add column if not exists p20_w      integer,
  add column if not exists weight_kg  numeric;

-- Para buscar rapido las salidas que si tienen potencia.
create index if not exists activities_user_p5 on public.activities (user_id, date) where p5_w is not null;
