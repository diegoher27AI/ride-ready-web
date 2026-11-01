// Ride Ready: el aviso de cada manana.
//
// Corre cada media hora desde temprano. Para cada ciclista con avisos activados mira
// si ya llego su recuperacion de hoy. Apenas llega, le manda UN aviso con la decision
// y el entrenamiento, y lo marca como avisado para no repetir.
//
// Esto NO llama a Claude: la decision sale de las mismas reglas que usa la app, y el
// entrenamiento ya estaba guardado. El aviso es gratis.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = 'BI0sJLWBMM73_IF7up2X8HVgidRqRK6WZ0TSrWYYrTVv8MM0LfyUR_WcWH8E9jv5PpwDjfw2AsR6QKQIXzaivuk';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:diegoher27@gmail.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

// A partir de que hora local tiene sentido avisar, y hasta cuando se espera el dato
// antes de avisar igual para que el ciclista no se quede esperando.
const DESDE_HORA = 4;
const RENDIRSE_HORA = 9;
const FALLOS_PARA_BORRAR = 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// La hora y el dia que son AHORA para ese ciclista, en su propia zona horaria.
function alla(zona: string) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    });
    const p: Record<string, string> = {};
    f.formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
    return { dia: `${p.year}-${p.month}-${p.day}`, hora: parseInt(p.hour, 10) };
  } catch (e) {
    const d = new Date();
    return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
  }
}

// Las mismas reglas que usa la app. Si cambian alla, tienen que cambiar aqui.
function decidir(rec: number | null, hrv: number | null, hrvBase: number | null, rhr: number | null, rhrBase: number | null) {
  if (rec == null) return null;
  let nivel = rec >= 67 ? 2 : rec >= 34 ? 1 : 0;
  const hrvBaja = hrv != null && hrvBase != null && hrvBase > 0 && hrv < hrvBase * 0.9;
  const rhrAlto = rhr != null && rhrBase != null && rhr >= rhrBase + 4;
  if ((hrvBaja || rhrAlto) && nivel > 0) nivel -= 1;
  return nivel;
}

function textoDelDia(nivel: number, rec: number | null, plan: Record<string, unknown> | null, es: boolean) {
  const titulo = nivel === 0
    ? (es ? 'Hoy toca descansar' : 'Rest today')
    : nivel === 1 ? (es ? 'Hoy ve suave' : 'Go easy today')
    : (es ? 'Hoy puedes entrenar' : 'Good to train today');
  const partes: string[] = [];
  if (rec != null) partes.push(es ? `Recuperación ${Math.round(rec)}%` : `Recovery ${Math.round(rec)}%`);
  if (plan && plan.decision !== 'descanso' && plan.title) {
    const min = Array.isArray(plan.steps)
      ? (plan.steps as Record<string, unknown>[]).reduce((n, s) => n + (Number(s.min) || 0), 0)
      : 0;
    partes.push(String(plan.title) + (min ? ` · ${min} min` : ''));
  } else if (nivel === 0) {
    partes.push(es ? 'Caminar, estirar, dormir temprano' : 'Walk, stretch, sleep early');
  }
  return { titulo, cuerpo: partes.join('. ') + (partes.length ? '.' : '') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const salida = (o: unknown, code = 200) =>
    new Response(JSON.stringify(o), { status: code, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    // Dos formas de entrar, y nada mas:
    //  1. El ciclista desde la app, con su sesion, y SOLO para sus propios aparatos.
    //  2. La tarea programada, con un secreto que solo conoce el servidor.
    // Sin esto, cualquiera con una sesion valida podria disparar los avisos de TODOS.
    let soloUsuario: string | null = null;
    const esTarea = !!CRON_SECRET && req.headers.get('x-rr-cron') === CRON_SECRET;
    if (!esTarea) {
      const auth = req.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) return salida({ error: 'Falta la sesion' }, 401);
      const { data: u } = await admin.auth.getUser(auth.replace('Bearer ', ''));
      if (!u || !u.user) return salida({ error: 'Sesion no valida' }, 401);
      soloUsuario = u.user.id;      // solo los suyos, pida lo que pida
    }

    let q = admin.from('push_subs').select('*');
    if (soloUsuario) q = q.eq('user_id', soloUsuario);
    const { data: subs, error } = await q;
    if (error) return salida({ error: error.message }, 500);
    if (!subs || !subs.length) return salida({ ok: true, mandados: 0, motivo: 'nadie suscrito' });

    let mandados = 0, saltados = 0, borrados = 0;

    for (const s of subs) {
      const { dia, hora } = alla(s.zona || 'America/Costa_Rica');
      const prueba = !!soloUsuario;
      if (!prueba) {
        if (s.avisado_el === dia) { saltados++; continue; }        // ya se le aviso hoy
        if (hora < DESDE_HORA) { saltados++; continue; }           // todavia es de madrugada
      }

      // ¿Ya llego su recuperacion de hoy?
      const { data: w } = await admin.from('wellness')
        .select('date, readiness, hrv, resting_hr')
        .eq('user_id', s.user_id).eq('date', dia).maybeSingle();
      const rec = w && w.readiness != null ? Number(w.readiness) : null;

      // Sus promedios de 30 dias, para poder bajar un nivel si hace falta.
      let hrvBase: number | null = null, rhrBase: number | null = null;
      if (rec != null) {
        const desde = new Date(Date.parse(dia + 'T00:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
        const { data: hist } = await admin.from('wellness')
          .select('hrv, resting_hr').eq('user_id', s.user_id).gte('date', desde).lt('date', dia);
        const hs = (hist || []).map((x) => Number(x.hrv)).filter((x) => isFinite(x) && x > 0);
        const rs = (hist || []).map((x) => Number(x.resting_hr)).filter((x) => isFinite(x) && x > 0);
        if (hs.length) hrvBase = hs.reduce((a, b) => a + b, 0) / hs.length;
        if (rs.length) rhrBase = rs.reduce((a, b) => a + b, 0) / rs.length;
      }

      const nivel = decidir(rec, w ? Number(w.hrv) : null, hrvBase, w ? Number(w.resting_hr) : null, rhrBase);
      if (nivel == null && !prueba) {
        // Todavia no llegan sus numeros. Se espera, salvo que ya sea tarde: ahi se avisa
        // igual para que no se quede esperando un aviso que no va a llegar.
        if (hora < RENDIRSE_HORA) { saltados++; continue; }
      }

      const { data: plan } = await admin.from('planned_sessions')
        .select('decision, title, steps').eq('user_id', s.user_id).eq('day', dia).maybeSingle();

      const es = !String(s.zona || '').startsWith('Europe/London') && !String(s.zona || '').startsWith('America/New');
      const msg = nivel == null
        ? { titulo: es ? 'Tus números no han llegado' : 'Your numbers have not arrived',
            cuerpo: es ? 'Abre la app y toca Actualizar para ver tu día.' : 'Open the app and tap Refresh to see your day.' }
        : textoDelDia(nivel, rec, plan, es);

      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...msg, tag: 'rr-' + dia }),
          { TTL: 6 * 3600 },
        );
        mandados++;
        if (!prueba) await admin.from('push_subs').update({ avisado_el: dia, fallos: 0 }).eq('endpoint', s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404 y 410 significan que ese aparato ya no existe: se borra y listo.
        if (code === 404 || code === 410) {
          await admin.from('push_subs').delete().eq('endpoint', s.endpoint); borrados++;
        } else {
          const n = (s.fallos || 0) + 1;
          if (n >= FALLOS_PARA_BORRAR) { await admin.from('push_subs').delete().eq('endpoint', s.endpoint); borrados++; }
          else await admin.from('push_subs').update({ fallos: n }).eq('endpoint', s.endpoint);
          console.error('push', code, String(e).slice(0, 200));
        }
      }
    }

    return salida({ ok: true, mandados, saltados, borrados, total: subs.length });
  } catch (e) {
    console.error(e);
    return salida({ error: 'Algo salio mal mandando los avisos.' }, 500);
  }
});
