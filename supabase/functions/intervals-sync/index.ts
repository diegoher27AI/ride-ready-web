// Trae actividades y bienestar (Garmin, Karoo, Whoop) desde intervals.icu para el
// ciclista que hizo el llamado, usando la clave que el guardo en intervals_connections.
// No recibe ni guarda la clave en el cuerpo del pedido: siempre la lee de la base de datos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAYS_BACK = 30;

// Deja que la app (en localhost o ya publicada) pueda llamar a esta funcion desde el navegador.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function fetchIntervals(path: string, apiKey: string) {
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
  const res = await fetch(`https://intervals.icu${path}`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`intervals.icu ${path} -> ${res.status}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: CORS_HEADERS });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: conn, error: connErr } = await admin
      .from('intervals_connections')
      .select('api_key')
      .eq('user_id', userId)
      .maybeSingle();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: 'No hay clave de intervals.icu guardada' }), { status: 400, headers: CORS_HEADERS });
    }

    const oldest = isoDaysAgo(DAYS_BACK);
    const [activities, wellness] = await Promise.all([
      fetchIntervals(`/api/v1/athlete/0/activities?oldest=${oldest}`, conn.api_key),
      fetchIntervals(`/api/v1/athlete/0/wellness?oldest=${oldest}`, conn.api_key),
    ]);

    const actRows = (activities as any[]).map((a) => ({
      user_id: userId,
      source_id: String(a.id),
      date: (a.start_date_local || '').slice(0, 10),
      name: a.name,
      sport: a.type,
      moving_min: a.moving_time != null ? Math.round((a.moving_time / 60) * 10) / 10 : null,
      distance_km: a.distance != null ? Math.round((a.distance / 1000) * 100) / 100 : null,
      relative_effort: a.icu_training_load ?? null,
      calories: a.calories ?? null,
      avg_hr: a.average_heartrate ?? null,
      max_hr: a.max_heartrate ?? null,
      avg_watts: a.icu_average_watts ?? null,
      updated_at: new Date().toISOString(),
    }));

    const wellRows = (wellness as any[]).map((w) => ({
      user_id: userId,
      date: w.id,
      readiness: w.readiness ?? null,
      hrv: w.hrv ?? null,
      resting_hr: w.restingHR ?? null,
      sleep_min: w.sleepSecs != null ? Math.round(w.sleepSecs / 60) : null,
      respiration: w.respiration ?? null,
      raw: w,
      updated_at: new Date().toISOString(),
    }));

    if (actRows.length) await admin.from('activities').upsert(actRows, { onConflict: 'user_id,source_id' });
    if (wellRows.length) await admin.from('wellness').upsert(wellRows, { onConflict: 'user_id,date' });

    // Para revisar juntos que campo trae la recuperacion de Whoop (sin imprimir la clave ni datos de salud).
    const last = (wellness as any[])[wellness.length - 1];
    if (last) console.log('ultimo dia de bienestar, campos con datos:', Object.keys(last).filter((k) => last[k] != null));

    return new Response(JSON.stringify({ activities: actRows.length, wellness: wellRows.length }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
