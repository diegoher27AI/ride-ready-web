// Trae actividades y bienestar (Garmin, Karoo, Whoop) desde intervals.icu para el
// ciclista que hizo el llamado, usando la clave que el guardo en intervals_connections.
// No recibe ni guarda la clave en el cuerpo del pedido: siempre la lee de la base de datos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DAYS_BACK = 1100; // como 3 anos, para traer el historial real de Whoop y de actividades, no solo el ultimo mes

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

// intervals.icu entrega las zonas como limites de arriba. Las de potencia normalmente van en
// porcentaje del FTP; las de pulso pueden venir en porcentaje o en latidos. Se detecta por el
// tamano de los numeros en vez de suponer, y si no cuadra se devuelve vacio antes que inventar.
function toBands(tops: number[] | null | undefined, ref: number | null, names: string[] | null | undefined, kind: 'power' | 'hr') {
  if (!Array.isArray(tops) || !tops.length) return null;
  const clean = tops.filter((t) => typeof t === 'number' && t > 0);
  if (!clean.length) return null;
  const top = Math.max(...clean);
  // Si el mayor es chico, son porcentajes y hace falta la referencia (FTP o pulso maximo).
  const isPercent = kind === 'power' ? top <= 250 : top <= 100;
  if (isPercent && (!ref || ref <= 0)) return null;
  const abs = clean.map((t) => (isPercent ? Math.round((t * (ref as number)) / 100) : t));
  const out: { label: string; min: number; max: number | null }[] = [];
  let min = 0;
  abs.forEach((max, i) => {
    const label = (names && names[i]) || `Z${i + 1}`;
    const last = i === abs.length - 1;
    out.push({ label, min, max: last ? null : max });
    min = max + 1;
  });
  return out;
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
    const [activities, wellness, athlete] = await Promise.all([
      fetchIntervals(`/api/v1/athlete/0/activities?oldest=${oldest}`, conn.api_key),
      fetchIntervals(`/api/v1/athlete/0/wellness?oldest=${oldest}`, conn.api_key),
      fetchIntervals(`/api/v1/athlete/0`, conn.api_key).catch(() => null),
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

    // Perfil deportivo: peso, FTP, pulso maximo y zonas, de los ajustes de bici.
    let profileSaved = false;
    if (athlete) {
      const settings: any[] = (athlete as any).sportSettings || [];
      const isRide = (s: any) => Array.isArray(s?.types) && s.types.some((t: string) => /Ride|Cycling|Velomobile|Handcycle/i.test(t));
      const bike = settings.find(isRide) || settings[0] || null;
      if (bike) {
        const ftp = bike.ftp ?? null;
        const hrMax = bike.max_hr ?? null;
        await admin.from('athlete_profile').upsert({
          user_id: userId,
          weight_kg: (athlete as any).weight ?? (athlete as any).icu_weight ?? null,
          ftp_w: ftp,
          hr_max: hrMax,
          lthr: bike.lthr ?? null,
          power_zones: toBands(bike.power_zones, ftp, bike.power_zone_names, 'power'),
          heart_rate_zones: toBands(bike.hr_zones, hrMax ?? bike.lthr ?? null, bike.hr_zone_names, 'hr'),
          raw: bike,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        profileSaved = true;
      }
    }

    return new Response(JSON.stringify({ activities: actRows.length, wellness: wellRows.length, profile: profileSaved }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS_HEADERS });
  }
});
