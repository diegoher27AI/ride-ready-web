-- La tarea que manda los avisos. Corre cada media hora, y la funcion decide a quien le
-- toca: solo avisa una vez por dia a cada quien, y solo cuando ya amanecio para el.
--
-- Media hora es a proposito: los datos de Whoop llegan a una hora distinta cada dia, y
-- asi el aviso sale apenas entran, en vez de a una hora fija que casi nunca cuadra.
--
-- El secreto NO esta aqui: vive en la boveda de la base (vault). Antes de aplicar esta
-- migracion hay que guardarlo, con el mismo valor que tiene CRON_SECRET en la funcion:
--
--   select vault.create_secret('<el secreto>', 'rr_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

-- Si ya existia de antes, se quita para no dejar dos corriendo.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ride-ready-avisos') then
    perform cron.unschedule('ride-ready-avisos');
  end if;
end $$;

select cron.schedule(
  'ride-ready-avisos',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://dbyewzuvpknamkpcaqcc.supabase.co/functions/v1/enviar-avisos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rr-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'rr_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
