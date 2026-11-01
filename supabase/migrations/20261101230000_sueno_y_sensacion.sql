-- Dos cosas que faltaban para los ciclistas que NO usan Whoop.
--
-- 1. La puntuacion de sueno. Un Garmin la da (sleepScore) aunque no de "recuperacion".
--    Con eso, mas la VFC y el pulso en reposo que tambien manda, se puede armar una
--    lectura del dia sin Whoop. Antes ese dato llegaba y se tiraba.
--
-- 2. Como se siente el ciclista. Es lo mas fiable que hay, mas que cualquier aparato,
--    y es lo unico que tiene alguien que solo carga entrenamientos.
alter table public.wellness
  add column if not exists sleep_score integer,   -- 0 a 100, del reloj
  add column if not exists sensacion   integer,   -- 1 muy mal, 5 muy bien: lo que dijo el
  add column if not exists sensacion_nota text;

comment on column public.wellness.sensacion is
  'Como dijo el ciclista que se sentia ese dia, de 1 a 5. Lo escribe el, no un aparato.';
