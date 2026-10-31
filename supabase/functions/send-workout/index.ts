// Manda el entrenamiento del dia al calendario de intervals.icu. De ahi, intervals.icu lo
// empuja solo al Garmin y al Karoo del ciclista (eso ya lo hace intervals.icu, no esta funcion).
// La app calcula el entrenamiento (dayCall/callTargets en el panel); esta funcion solo lo sube,
// usando la clave del usuario que esta guardada en la base de datos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

    const body = await req.json().catch(() => null);
    const date = body?.date, name = body?.name, description = body?.description;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || !description) {
      return new Response(JSON.stringify({ error: 'Faltan datos del entrenamiento' }), { status: 400, headers: CORS_HEADERS });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: conn, error: connErr } = await admin
      .from('intervals_connections')
      .select('api_key')
      .eq('user_id', userId)
      .maybeSingle();
    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: 'No hay clave de intervals.icu guardada' }), { status: 400, headers: CORS_HEADERS });
    }

    const auth = 'Basic ' + btoa(`API_KEY:${conn.api_key}`);
    const res = await fetch('https://intervals.icu/api/v1/athlete/0/events', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'WORKOUT',
        type: 'Ride',
        start_date_local: `${date}T00:00:00`,
        name,
        description,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return new Response(JSON.stringify({ error: `intervals.icu dijo que no (${res.status})`, detail }), { status: 502, headers: CORS_HEADERS });
    }
    const created = await res.json();
    return new Response(JSON.stringify({ ok: true, id: created?.id ?? null }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
