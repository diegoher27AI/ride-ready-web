// Ride Ready: el bloque de la semana.
//
// Esta es la UNICA llamada a Claude que corre sola. Cuesta unos 21 centavos y se hace
// una vez por semana, no todos los dias: el dia a dia lo arma el codigo con la
// recuperacion y la fatiga de hoy, y eso es gratis.
//
// Claude NO entrena el modelo. El modelo es matematica que corre en el telefono
// (modelo.js) y llega aqui ya calculado. Claude solo disena los entrenamientos.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODELO = 'claude-opus-4-8';

// Tope de seguridad: como mucho un bloque cada 5 dias por ciclista, salvo que el
// modelo pida uno nuevo. Sin esto, un fallo en la app podria pedirlo en bucle.
const DIAS_MINIMO = 5;
const TOPE_SEMANAL = 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM = `Eres el entrenador de ciclismo de Ride Ready. Disenas el bloque de UNA SEMANA.

COMO TRABAJA LA APP
Tu disenas la semana. El dia a dia lo ajusta el codigo de la app con la recuperacion y la
fatiga de ese dia: si el ciclista amanece mal, baja lo que tu pusiste; si esta fresco, lo
deja. Asi que diseña la semana que corresponde cuando todo sale bien, sin miedo: hay una
red de seguridad abajo.

QUE RECIBES
- El modelo propio del ciclista, ya calculado: en cuantos dias construye forma y en cuantos
  se le va la fatiga, que mueve su recuperacion, y que tan bien acierta el modelo.
- Su estado de hoy: forma fisica, fatiga, frescura, relacion de carga.
- Sus zonas y su FTP reales.
- Sus metas, si tiene.
- Lo que entreno las ultimas semanas.

Si el modelo dice que sus constantes NO son propias (son las de libro), no presumas de
personalizacion: diseña conservador y dilo en la nota.

COMO DISENAR
- Siete dias, de lunes a domingo o desde el dia que te digan.
- Respeta la relacion de carga: la suma de 7 dias no deberia pasar de 1.3 veces el promedio
  de su mes. Si ya viene alto, esta semana baja.
- Al menos un dia de descanso completo. Dos si la frescura esta muy negativa.
- Los vatios SIEMPRE dentro de sus zonas reales. Nunca inventes un FTP.
- Si hay una meta cerca, que la semana apunte ahi y dilo en el proposito.
- Varia: no repitas la misma sesion dos veces en la semana.

LIMITES QUE NO SE NEGOCIAN
- Esto es ayuda de entrenamiento, NO consejo medico. Nunca diagnostiques nada. Si algo
  sugiere un problema de salud, di que consulte a un profesional.
- Con recuperacion baja, siempre conservador.
- No inventes numeros que no te dieron. Si falta un dato, dilo en la nota.

Responde SOLO llamando a la herramienta armar_semana. Nada de texto suelto.`;

const HERRAMIENTA = {
  name: 'armar_semana',
  description: 'Guarda el bloque de la semana y lo manda al calendario del ciclista.',
  input_schema: {
    type: 'object',
    properties: {
      resumen: { type: 'string', description: 'Dos o tres frases, en el idioma del ciclista, sobre que busca esta semana y por que.' },
      dias: {
        type: 'array',
        minItems: 5,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            fecha: { type: 'string', description: 'AAAA-MM-DD' },
            decision: { type: 'string', enum: ['entrenar', 'suave', 'descanso'] },
            titulo: { type: 'string' },
            proposito: { type: 'string', description: 'Para que sirve este dia, en una frase.' },
            nota: { type: 'string', description: 'Opcional: algo que el ciclista deba saber.' },
            pasos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nombre: { type: 'string' },
                  min: { type: 'number' },
                  tipo: { type: 'string', enum: ['warmup', 'active', 'recovery', 'cooldown'] },
                  vatios: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                  pulso: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
                },
                required: ['nombre', 'min', 'tipo'],
              },
            },
          },
          required: ['fecha', 'decision', 'titulo', 'proposito'],
        },
      },
    },
    required: ['resumen', 'dias'],
  },
};

function stepsToText(steps: Record<string, unknown>[]) {
  const head: Record<string, string> = { warmup: 'Warmup', cooldown: 'Cooldown', recovery: 'Main Set' };
  return steps.map((s) => {
    const p = Array.isArray(s.p) ? (s.p as number[]) : null;
    const title = head[String(s.int)] || 'Main Set';
    const watts = p && p.length === 2 ? ` ${Math.max(0, Math.round(p[0]))}-${Math.round(p[1])}W` : '';
    return `${title}\n- ${s.min}m${watts}`;
  }).join('\n\n');
}

// Manda los dias al calendario de intervals.icu. Cada evento lleva su propia etiqueta y
// antes de escribir se borran solo los que la llevan: lo que el ciclista creo a mano
// nunca se toca.
async function pushToIntervals(apiKey: string, rows: Record<string, unknown>[]) {
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };
  const ids = rows.map((r) => ({ external_id: `rideready-${r.day}` }));
  const del = await fetch('https://intervals.icu/api/v1/athlete/0/events/bulk-delete', {
    method: 'PUT', headers, body: JSON.stringify(ids),
  });
  if (!del.ok && del.status !== 404) return { ok: false, sent: 0, detail: `no se pudieron limpiar los dias viejos (${del.status})` };
  const events = rows
    .filter((r) => r.decision !== 'descanso' && Array.isArray(r.steps) && (r.steps as unknown[]).length)
    .map((r) => ({
      category: 'WORKOUT', type: 'Ride',
      start_date_local: `${r.day}T00:00:00`,
      external_id: `rideready-${r.day}`,
      name: (r.title as string) || 'Ride Ready',
      description: stepsToText(r.steps as Record<string, unknown>[]),
    }));
  if (!events.length) return { ok: true, sent: 0 };
  const res = await fetch('https://intervals.icu/api/v1/athlete/0/events/bulk', {
    method: 'POST', headers, body: JSON.stringify(events),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, sent: 0, detail: `intervals.icu dijo que no (${res.status}) ${detail.slice(0, 120)}` };
  }
  return { ok: true, sent: events.length };
}

// Pasa lo que devolvio Claude a filas de planned_sessions, limpiando y acotando todo.
// Nada de lo que venga del modelo se guarda sin revisar.
function aFilas(userId: string, dias: Record<string, unknown>[], ftp: number | null) {
  const out: Record<string, unknown>[] = [];
  for (const d of dias) {
    const fecha = String(d.fecha || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const decision = ['entrenar', 'suave', 'descanso'].includes(String(d.decision)) ? String(d.decision) : 'suave';
    const pasos = Array.isArray(d.pasos) ? d.pasos : [];
    const steps = pasos.map((s: Record<string, unknown>) => {
      const min = Math.max(1, Math.min(360, Math.round(Number(s.min) || 0)));
      const v = Array.isArray(s.vatios) ? (s.vatios as number[]).map(Number) : null;
      const h = Array.isArray(s.pulso) ? (s.pulso as number[]).map(Number) : null;
      // Tope de cordura: nadie sostiene el triple de su FTP. Si no hay FTP, 600 W.
      const techo = ftp && ftp > 0 ? ftp * 3 : 600;
      return {
        name: String(s.nombre || '').slice(0, 60),
        min,
        int: ['warmup', 'active', 'recovery', 'cooldown'].includes(String(s.tipo)) ? String(s.tipo) : 'active',
        p: v && v.length === 2 && v.every((x) => isFinite(x) && x >= 0 && x <= techo) ? v.map(Math.round) : [0, 0],
        hr: h && h.length === 2 && h.every((x) => isFinite(x) && x > 30 && x < 230) ? h.map(Math.round) : null,
      };
    }).filter((s) => s.min > 0);
    out.push({
      user_id: userId, day: fecha, decision,
      title: typeof d.titulo === 'string' ? d.titulo.slice(0, 80) : null,
      purpose: typeof d.proposito === 'string' ? d.proposito.slice(0, 400) : null,
      note: typeof d.nota === 'string' ? d.nota.slice(0, 300) : null,
      steps: steps.length ? steps : null,
      source: 'ai',
      updated_at: new Date().toISOString(),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const malo = (msg: string, code = 400) =>
    new Response(JSON.stringify({ error: msg }), { status: code, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return malo('Falta la sesion', 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: u, error: uErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (uErr || !u || !u.user) return malo('Sesion no valida', 401);
    const userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    const forzar = body && body.forzar === true;
    const modelo = (body && body.modelo) || null;      // ya calculado en el telefono, gratis
    const contexto = (body && body.contexto) || {};
    const idioma = contexto.idioma === 'en' ? 'en' : 'es';

    // ¿Hace falta de verdad? El tope protege el saldo de quien paga la clave.
    const desde = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const { data: ult } = await admin.from('planned_sessions')
      .select('day, updated_at').eq('user_id', userId).eq('source', 'ai')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!forzar && ult && ult.updated_at) {
      const dias = (Date.now() - Date.parse(ult.updated_at)) / 864e5;
      const pide = modelo && modelo.necesitaReplan === true;
      if (dias < DIAS_MINIMO && !pide) {
        return new Response(JSON.stringify({ ok: true, saltado: true, motivo: 'reciente', dias: Math.round(dias) }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }
    const { data: veces } = await admin.from('planned_sessions')
      .select('day', { count: 'exact', head: true }).eq('user_id', userId).gte('day', desde);
    if (!forzar && typeof veces === 'number' && veces > TOPE_SEMANAL * 8) return malo('Demasiados planes esta semana', 429);

    const { data: conn } = await admin.from('intervals_connections').select('api_key').eq('user_id', userId).maybeSingle();

    const hoy = new Date().toISOString().slice(0, 10);
    const payload = {
      idioma, hoy,
      modelo,                     // constantes propias, pesos, acierto
      estado: contexto.forma,     // forma fisica, fatiga, frescura, relacion de carga
      zonas: contexto.zonas,
      metas: contexto.metas,
      ultimas_semanas: contexto.ultimos_entrenamientos,
      recuperacion_reciente: contexto.whoop,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },     // una vez por semana: que piense bien
        // El sistema es siempre igual, asi que se guarda en cache y la segunda llamada
        // en adelante cuesta una decima parte por esa parte del mensaje.
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: [HERRAMIENTA],
        tool_choice: { type: 'tool', name: 'armar_semana' },
        messages: [{
          role: 'user',
          content: `Arma el bloque de los proximos 7 dias, empezando manana. Responde en ${idioma === 'en' ? 'ingles' : 'espanol'}.\n\n${JSON.stringify(payload)}`,
        }],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      if (res.status === 400 && /credit balance/i.test(t)) return malo('Se acabo el saldo de la cuenta de Claude.', 402);
      if (res.status === 429) return malo('Demasiadas peticiones a Claude, intenta en un minuto.', 429);
      console.error('anthropic', res.status, t.slice(0, 300));
      return malo('El entrenador no pudo responder.', 502);
    }
    const data = await res.json();
    const uso = data.usage || {};
    const bloque = (data.content || []).find((c: Record<string, unknown>) => c.type === 'tool_use');
    if (!bloque) return malo('El entrenador no devolvio un plan.', 502);

    const ftp = contexto.zonas && Number(contexto.zonas.ftp_w) > 0 ? Number(contexto.zonas.ftp_w) : null;
    const filas = aFilas(userId, bloque.input.dias || [], ftp);
    if (!filas.length) return malo('El plan vino vacio.', 502);

    const { error: insErr } = await admin.from('planned_sessions').upsert(filas, { onConflict: 'user_id,day' });
    if (insErr) return malo(`No se pudo guardar el plan: ${insErr.message}`, 500);

    let enviados = 0, aviso: string | null = null;
    if (conn && conn.api_key) {
      const r = await pushToIntervals(conn.api_key, filas);
      if (r.ok) enviados = r.sent; else aviso = r.detail || null;
    }

    return new Response(JSON.stringify({
      ok: true, dias: filas.length, enviados, resumen: bloque.input.resumen || '', aviso,
      // Para poder vigilar el gasto de verdad, en vez de estimarlo.
      uso: { entrada: uso.input_tokens, salida: uso.output_tokens, cache_lectura: uso.cache_read_input_tokens },
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return malo('Algo salio mal armando el plan.', 500);
  }
});
