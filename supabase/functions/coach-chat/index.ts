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

QUE DECIDE EL DIA (estas reglas mandan, no las cambies)
- Recuperacion 67% o mas: sesion planificada. Si la relacion de carga pasa de 1.5, mejor 60 a 75 min en zona 2.
- Recuperacion 34 a 66%: rodada suave de 45 min.
- Recuperacion bajo 34%: descanso total.
- Baja un nivel si la VFC esta mas de 10% bajo su promedio de 30 dias, o si el pulso en reposo esta 4 lpm o mas sobre el suyo.
- La relacion de carga no es confiable con menos de 28 dias de historial. Si la app te dice que no hay suficiente historial, no la uses como argumento.

LIMITES QUE NO SE NEGOCIAN
- Esto es ayuda de entrenamiento, no consejo medico. Nunca diagnostiques. Si te cuentan sintomas que suenan a enfermedad o lesion, dile que lo vea un profesional de salud y que hoy descanse.
- Cuando la recuperacion esta baja, se conservador. Es mejor pasarse de prudente que de ambicioso.
- De Whoop solo existen recuperacion, VFC, pulso en reposo y sueno. Nunca hables de entrenamientos o esfuerzo de Whoop, esos vienen de las actividades.
- Nunca inventes numeros que no esten en los datos que te pasaron. Si no sabes algo, dilo.

AJUSTAR EL ENTRENAMIENTO
- Si te piden cambiar el entrenamiento de hoy (tienen menos tiempo, se sienten mal, no pueden entrenar, o quieren volver al plan), usa la herramienta ajustar_entrenamiento.
- Usala una sola vez por mensaje, y despues confirma en una frase corta que ya quedo.
- Si lo que piden va contra la decision del dia (por ejemplo quieren entrenar duro con recuperacion baja), ajusta lo que te piden pero diles con franqueza el riesgo, en una frase.
- Para preguntas que no cambian el entrenamiento, solo responde, sin usar la herramienta.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'ajustar_entrenamiento',
    description:
      'Cambia el entrenamiento de hoy en la app del ciclista. Solo vale para hoy: manana vuelve a mandar la decision del dia. Usala cuando pidan menos tiempo, ir mas suave, descansar, o volver al plan original.',
    input_schema: {
      type: 'object',
      properties: {
        minutos: {
          type: 'integer',
          description: 'Minutos totales disponibles hoy, entre 15 y 240. Omitelo si no hablaron de tiempo.',
        },
        mas_suave: {
          type: 'boolean',
          description: 'true si se sienten mal y hay que bajar un nivel la sesion de hoy.',
        },
        descansar: {
          type: 'boolean',
          description: 'true si hoy no pueden entrenar del todo.',
        },
        volver_al_plan: {
          type: 'boolean',
          description: 'true para borrar los ajustes de hoy y volver a lo que manda la decision del dia.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
];

// Deja el ajuste en una forma que la app entiende, y descarta lo que venga fuera de rango.
function cleanAction(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const m = Number(input.minutos);
  if (Number.isFinite(m) && m >= 15 && m <= 240) out.mins = Math.round(m);
  if (input.mas_suave === true) out.rough = true;
  if (input.descansar === true) out.skip = true;
  if (input.volver_al_plan === true) { out.reset = true; }
  return Object.keys(out).length ? out : null;
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
      max_tokens: 1200,
      thinking: { type: 'adaptive' as const },
      output_config: { effort: 'medium' as const },
      system: [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }],
      tools: TOOLS,
    };

    let convo: Anthropic.MessageParam[] = withContext as Anthropic.MessageParam[];
    let res = await client.messages.create({ ...common, messages: convo });
    let action: Record<string, unknown> | null = null;

    // Una sola vuelta de herramienta: ajusta y confirma. No hace falta mas para este chat.
    if (res.stop_reason === 'tool_use') {
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = calls.map((c) => {
        if (c.name !== 'ajustar_entrenamiento') {
          return { type: 'tool_result', tool_use_id: c.id, content: 'Herramienta desconocida.', is_error: true };
        }
        const a = cleanAction((c.input || {}) as Record<string, unknown>);
        if (!a) {
          return { type: 'tool_result', tool_use_id: c.id, content: 'No se entendio el ajuste, no se cambio nada.', is_error: true };
        }
        action = { ...(action || {}), ...a };
        return { type: 'tool_result', tool_use_id: c.id, content: 'Listo, el entrenamiento de hoy ya quedo ajustado en la app.' };
      });
      convo = convo.concat([{ role: 'assistant', content: res.content }, { role: 'user', content: results }]);
      res = await client.messages.create({ ...common, messages: convo });
    }

    const text = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return json({
      text: text || 'No se me ocurrio que decir, intenta de nuevo.',
      action,
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
