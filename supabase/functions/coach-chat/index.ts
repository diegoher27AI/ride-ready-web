// El chat del entrenador. La app manda lo que escribio el ciclista mas sus numeros de hoy;
// esta funcion le pregunta a Claude y devuelve la respuesta, y si hace falta, el ajuste
// al entrenamiento del dia (tiempo, mas suave, descansar) para que la app lo aplique.
//
// La clave de la API es del dueno de la app y vive como secreto del servidor
// (ANTHROPIC_API_KEY). Nunca viaja al telefono ni se guarda en el repositorio.
import Anthropic from 'npm:@anthropic-ai/sdk@0.73.0';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// Tope por persona por dia: todos gastan del mismo saldo, asi que nadie se lo lleva solo.
const DAILY_LIMIT = Number(Deno.env.get('COACH_DAILY_LIMIT') || '40');
const MAX_TURNS = 20;          // cuantos mensajes de ida y vuelta se mandan de contexto
const MAX_CHARS = 2000;        // largo maximo de un mensaje del ciclista

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

// Las reglas del proyecto. Va primero y no cambia entre pedidos, para que se pueda
// reutilizar en cache; lo que si cambia (los numeros del dia) va despues, en el turno del usuario.
const SYSTEM = `Eres el entrenador de ciclismo dentro de Ride Ready, la app de un ciclista de ruta y montana.

COMO HABLAS
- Respondes en el mismo idioma en que te escriben (espanol o ingles). Por defecto, espanol.
- Frases cortas y claras. Nada de parrafos largos. Si hay pasos, van numerados.
- Nunca uses el guion largo. En espanol no uses palabras en ingles si hay traduccion.
- Hablas como un entrenador que conoce a este ciclista, no como un manual.
- No repitas de vuelta todos sus numeros si no hacen falta para la respuesta.

TU DECIDES EL ENTRENAMIENTO
Tu armas el plan y decides cada dia. El codigo de la app ya no te corrige: lo que tu
escribas con las herramientas es lo que el ciclista va a ver y hacer. Usalo con cuidado.

Estas referencias son tu punto de partida, no una camisa de fuerza. Apartate de ellas
cuando el contexto lo pida, pero siempre di por que en una frase:
- Recuperacion 67% o mas: puede con la sesion fuerte que toque en el plan.
- Recuperacion 34 a 66%: suave, alrededor de 45 min.
- Recuperacion bajo 34%: descanso.
- Pesa hacia abajo si la VFC esta mas de 10% bajo su promedio de 30 dias, o si el pulso en reposo esta 4 lpm o mas sobre el suyo.
- La relacion de carga no es confiable con menos de 28 dias de historial. Si la app te dice que no hay suficiente historial, no la uses como argumento.
- Carga diaria es el esfuerzo relativo. Forma fisica es el promedio exponencial de 42 dias, fatiga el de 7, frescura la resta de ayer.

COMO PLANIFICAS HACIA UNA META
- Mira la fecha de la meta y cuanto falta. Construye hacia atras desde ahi.
- Bloques de carga de 2 a 3 semanas seguidos de una semana suave. Afloja de 10 a 14 dias antes de un evento importante.
- Respeta lo que el ciclista te diga de su vida real (viajes, trabajo, dias que no puede). Preguntale si no sabes.
- No planifiques mas de 6 semanas de golpe. Es mejor ir armando el bloque que viene.
- Cuando planifiques varios dias, deja al menos un dia de descanso por semana.

LIMITES QUE NO SE NEGOCIAN
- Esto es ayuda de entrenamiento, no consejo medico. Nunca diagnostiques. Si te cuentan sintomas que suenan a enfermedad o lesion, dile que lo vea un profesional de salud y que descanse.
- De Whoop solo existen recuperacion, VFC, pulso en reposo y sueno. Nunca hables de entrenamientos o esfuerzo de Whoop, esos vienen de las actividades.
- Nunca inventes numeros que no esten en los datos que te pasaron. Si no sabes algo, dilo.
- Los vatios de los pasos salen de las zonas reales del ciclista. Si no tienes sus zonas, no inventes vatios: deja los pasos sin potencia y describelo por sensacion.

LAS HERRAMIENTAS
- ajustar_entrenamiento: cambios rapidos a UN dia (menos tiempo, mas suave, descansar, volver al plan). Sirve para hoy y para dias futuros.
- planificar_dias: escribe o reescribe dias completos con sus pasos. Es la que usas para armar el plan hacia la meta, y para cuando te digan "manana tengo fondo de 4 horas".
- guardar_meta y borrar_meta: para las carreras y eventos del ciclista.
- Usa las herramientas cuando de verdad haya algo que cambiar. Para preguntas, solo responde.
- Despues de usar una herramienta, confirma en una o dos frases que quedo. No repitas todo el plan.`;

const STEP = {
  type: 'object',
  properties: {
    nombre: { type: 'string', description: 'Como se llama el paso. Por ejemplo Calentamiento, Bloque 1, Enfriamiento.' },
    minutos: { type: 'integer', description: 'Cuanto dura el paso, de 1 a 300.' },
    tipo: { type: 'string', enum: ['warmup', 'active', 'recovery', 'cooldown'], description: 'Que clase de paso es.' },
    vatios_min: { type: 'integer', description: 'Vatios de abajo del rango. Omitelo si no tienes las zonas del ciclista.' },
    vatios_max: { type: 'integer', description: 'Vatios de arriba del rango. Omitelo si no tienes las zonas del ciclista.' },
    pulso_min: { type: 'integer', description: 'Pulso de abajo del rango, opcional.' },
    pulso_max: { type: 'integer', description: 'Pulso de arriba del rango, opcional.' },
  },
  required: ['nombre', 'minutos', 'tipo'],
  additionalProperties: false,
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'ajustar_entrenamiento',
    description:
      'Cambio rapido a UN dia que ya tiene entrenamiento: menos tiempo, mas suave, descansar, o volver a lo planificado. Sirve para hoy y para dias futuros.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'El dia a cambiar, en formato 2026-11-04. Omitelo si es hoy.' },
        minutos: { type: 'integer', description: 'Minutos totales disponibles, entre 15 y 360.' },
        mas_suave: { type: 'boolean', description: 'true para bajarle un nivel a la sesion de ese dia.' },
        descansar: { type: 'boolean', description: 'true si ese dia no va a entrenar.' },
        volver_al_plan: { type: 'boolean', description: 'true para borrar los ajustes de ese dia.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'planificar_dias',
    description:
      'Escribe o reescribe dias completos del plan, con sus pasos. Es la herramienta principal: usala para armar el bloque hacia la meta, y tambien para un solo dia cuando te digan algo como "manana tengo fondo de 4 horas". Lo que escribas reemplaza lo que hubiera en esos dias.',
    input_schema: {
      type: 'object',
      properties: {
        dias: {
          type: 'array',
          description: 'Un elemento por dia. Maximo 45 dias por llamada.',
          items: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'El dia, en formato 2026-11-04.' },
              decision: { type: 'string', enum: ['entrenar', 'suave', 'descanso'], description: 'Que toca ese dia.' },
              titulo: { type: 'string', description: 'Nombre corto de la sesion. Por ejemplo Fondo largo, Sweet spot 3x12.' },
              proposito: { type: 'string', description: 'Para que sirve esa sesion, en una frase.' },
              nota: { type: 'string', description: 'Por que ese dia va asi, en una frase. Opcional.' },
              pasos: { type: 'array', description: 'Los pasos de la sesion. Vacio o ausente en dias de descanso.', items: STEP },
            },
            required: ['fecha', 'decision'],
            additionalProperties: false,
          },
        },
      },
      required: ['dias'],
      additionalProperties: false,
    },
  },
  {
    name: 'guardar_meta',
    description: 'Guarda una carrera o evento del ciclista, para planificar hacia ahi. Si ya existe una con el mismo nombre, la reemplaza.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Como se llama el evento.' },
        fecha: { type: 'string', description: 'Cuando es, en formato 2027-08-17.' },
        prioridad: { type: 'string', enum: ['A', 'B', 'C'], description: 'A es la meta grande de la temporada, C una carrera de paso.' },
        notas: { type: 'string', description: 'Que tipo de evento es y que pide. Opcional.' },
      },
      required: ['nombre', 'fecha'],
      additionalProperties: false,
    },
  },
  {
    name: 'borrar_meta',
    description: 'Borra una meta del ciclista por su nombre.',
    input_schema: {
      type: 'object',
      properties: { nombre: { type: 'string', description: 'El nombre exacto de la meta a borrar.' } },
      required: ['nombre'],
      additionalProperties: false,
    },
  },
];

const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };

// Deja el ajuste de un dia en la forma que la app entiende, y descarta lo que venga fuera de rango.
function cleanAction(input: Record<string, unknown>, today: string) {
  const out: Record<string, unknown> = { day: isDay(input.fecha) ? input.fecha : today };
  const m = num(input.minutos, 15, 360);
  if (m != null) out.mins = m;
  if (input.mas_suave === true) out.rough = true;
  if (input.descansar === true) out.skip = true;
  if (input.volver_al_plan === true) out.reset = true;
  return Object.keys(out).length > 1 ? out : null;
}

// Pasa los dias que escribio el entrenador a filas de la tabla, descartando lo que no cuadre.
function cleanDays(input: Record<string, unknown>, userId: string) {
  const list = Array.isArray(input.dias) ? input.dias.slice(0, 45) : [];
  const rows: Record<string, unknown>[] = [];
  for (const d of list as Record<string, unknown>[]) {
    if (!isDay(d?.fecha)) continue;
    const decision = ['entrenar', 'suave', 'descanso'].includes(String(d.decision)) ? String(d.decision) : null;
    if (!decision) continue;
    const steps = (Array.isArray(d.pasos) ? d.pasos : []).slice(0, 30).map((s: Record<string, unknown>) => {
      const min = num(s?.minutos, 1, 300);
      if (!min || typeof s?.nombre !== 'string') return null;
      const pLo = num(s.vatios_min, 0, 2000), pHi = num(s.vatios_max, 0, 2000);
      const hLo = num(s.pulso_min, 30, 230), hHi = num(s.pulso_max, 30, 230);
      return {
        name: String(s.nombre).slice(0, 60),
        min,
        int: ['warmup', 'active', 'recovery', 'cooldown'].includes(String(s.tipo)) ? String(s.tipo) : 'active',
        p: pLo != null && pHi != null && pHi >= pLo ? [pLo, pHi] : null,
        hr: hLo != null && hHi != null && hHi >= hLo ? [hLo, hHi] : null,
      };
    }).filter(Boolean);
    rows.push({
      user_id: userId,
      day: d.fecha,
      decision,
      title: typeof d.titulo === 'string' ? d.titulo.slice(0, 80) : null,
      purpose: typeof d.proposito === 'string' ? d.proposito.slice(0, 400) : null,
      note: typeof d.nota === 'string' ? d.nota.slice(0, 300) : null,
      steps: steps.length ? steps : null,
      source: 'ai',
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'El entrenador todavia no tiene su clave configurada en el servidor.' }, 503);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'No autenticado' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    const incoming = Array.isArray(body?.messages) ? body.messages : [];
    const context = body?.context ?? {};
    if (!incoming.length) return json({ error: 'No hay nada que responder' }, 400);

    // Solo texto, solo los dos roles, y recortado: nada de payloads gigantes.
    const messages = incoming
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
      .slice(-MAX_TURNS)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MAX_CHARS) }));
    if (!messages.length || messages[0].role !== 'user') {
      return json({ error: 'No hay nada que responder' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: used, error: useErr } = await admin.rpc('bump_coach_usage', { p_user: userId, p_limit: DAILY_LIMIT });
    if (!useErr && typeof used === 'number' && used > DAILY_LIMIT) {
      return json({ error: `Por hoy llegaste al limite de ${DAILY_LIMIT} mensajes al entrenador. Manana se reinicia.` }, 429);
    }

    // Los numeros de hoy van en el ultimo turno del usuario, no en el system: asi el system
    // queda igual entre pedidos y se puede reutilizar en cache.
    const last = messages[messages.length - 1];
    const withContext = messages.slice(0, -1).concat([{
      role: 'user',
      content: `<datos_de_hoy>\n${JSON.stringify(context, null, 1)}\n</datos_de_hoy>\n\n${last.content}`,
    }]);

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const common = {
      model: 'claude-opus-4-8',
      // Armar un bloque de varias semanas con sus pasos ocupa bastante mas que una respuesta
      // de chat, por eso el margen. Sigue bajo el limite que obliga a usar streaming.
      max_tokens: 8000,
      thinking: { type: 'adaptive' as const },
      output_config: { effort: 'medium' as const },
      system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
      tools: TOOLS,
    };

    const today = typeof context?.hoy === 'string' && isDay(context.hoy)
      ? context.hoy
      : new Date().toISOString().slice(0, 10);

    // Lo que el entrenador cambia: ajustes de un dia (los aplica la app) y lo que ya quedo
    // guardado en el servidor (plan y metas), para que la app sepa que tiene que recargar.
    const actions: Record<string, unknown>[] = [];
    let touched = false;

    async function runTool(c: Anthropic.ToolUseBlock): Promise<string> {
      const input = (c.input || {}) as Record<string, unknown>;
      if (c.name === 'ajustar_entrenamiento') {
        const a = cleanAction(input, today);
        if (!a) return 'No se entendio el ajuste, no se cambio nada.';
        actions.push(a);
        return `Listo, el ${a.day} quedo ajustado.`;
      }
      if (c.name === 'planificar_dias') {
        const rows = cleanDays(input, userId);
        if (!rows.length) return 'Ningun dia quedo bien formado, no se guardo nada. Revisa las fechas y la decision de cada dia.';
        const { error } = await admin.from('planned_sessions').upsert(rows, { onConflict: 'user_id,day' });
        if (error) { console.error('planificar_dias', error); return 'No se pudo guardar el plan, intenta de nuevo.'; }
        touched = true;
        return `Guardados ${rows.length} dias: del ${rows[0].day} al ${rows[rows.length - 1].day}.`;
      }
      if (c.name === 'guardar_meta') {
        if (typeof input.nombre !== 'string' || !input.nombre.trim() || !isDay(input.fecha)) return 'Falta el nombre o la fecha de la meta.';
        const name = input.nombre.trim().slice(0, 120);
        await admin.from('goals').delete().eq('user_id', userId).eq('name', name);
        const { error } = await admin.from('goals').insert({
          user_id: userId, name, goal_date: input.fecha,
          priority: ['A', 'B', 'C'].includes(String(input.prioridad)) ? String(input.prioridad) : 'A',
          notes: typeof input.notas === 'string' ? input.notas.slice(0, 500) : null,
        });
        if (error) { console.error('guardar_meta', error); return 'No se pudo guardar la meta.'; }
        touched = true;
        return `Meta guardada: ${name}, el ${input.fecha}.`;
      }
      if (c.name === 'borrar_meta') {
        if (typeof input.nombre !== 'string') return 'Falta el nombre de la meta.';
        const { error } = await admin.from('goals').delete().eq('user_id', userId).eq('name', input.nombre.trim());
        if (error) { console.error('borrar_meta', error); return 'No se pudo borrar la meta.'; }
        touched = true;
        return 'Meta borrada.';
      }
      return 'Herramienta desconocida.';
    }

    let convo: Anthropic.MessageParam[] = withContext as Anthropic.MessageParam[];
    let res = await client.messages.create({ ...common, messages: convo });

    // Varias vueltas: planificar puede tomarle mas de un paso (por ejemplo guardar la meta
    // y despues armar el bloque). Se corta en 4 para que no se vaya de largo ni de gasto.
    for (let round = 0; round < 4 && res.stop_reason === 'tool_use'; round++) {
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const c of calls) {
        const out = await runTool(c);
        results.push({ type: 'tool_result', tool_use_id: c.id, content: out });
      }
      convo = convo.concat([{ role: 'assistant', content: res.content }, { role: 'user', content: results }]);
      res = await client.messages.create({ ...common, messages: convo });
    }

    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return json({
      text: text || 'No se me ocurrio que decir, intenta de nuevo.',
      // 'action' se queda por compatibilidad: es el ajuste de hoy, si hubo uno.
      action: actions.find((a) => a.day === today) || null,
      actions,
      reload: touched,
      left: typeof used === 'number' ? Math.max(0, DAILY_LIMIT - used) : null,
    });
  } catch (e) {
    console.error('coach-chat', e);
    const msg = String(e);
    if (/authentication|api[_ ]?key/i.test(msg)) return json({ error: 'La clave del entrenador no sirve. Revisala en el servidor.' }, 502);
    if (/rate[_ ]?limit|429/i.test(msg)) return json({ error: 'El entrenador esta saturado. Intenta en un minuto.' }, 429);
    if (/credit|billing|quota/i.test(msg)) return json({ error: 'Se acabo el saldo de la cuenta de Claude. Hay que recargar.' }, 402);
    return json({ error: 'Algo salio mal con el entrenador.' }, 500);
  }
});
