// Ride Ready: el modelo propio de cada ciclista. Todo esto es matematica y corre aqui
// mismo, asi que no cuesta nada y se puede recalcular cuantas veces haga falta.
// Claude no entrena nada: solo usa estos numeros, una vez por semana, para disenar el bloque.
//
// Tres cosas:
//   1. Constantes de forma y fatiga ajustadas a TUS datos, en vez de los 42 y 7 dias de libro.
//   2. Prediccion de la recuperacion de manana, con validacion hacia adelante (siempre se
//      entrena con el pasado y se prueba con el futuro, nunca al reves).
//   3. Acierto: lo que predijo contra lo que de verdad paso.
(function () {
  const DAY = 864e5;
  const iso = (d) => new Date(d).toISOString().slice(0, 10);
  const pd = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const num = (v) => (v == null || v === '' ? NaN : +v);

  // ---------- algebra ----------
  // Minimos cuadrados por eliminacion gaussiana sobre las ecuaciones normales.
  // Las matrices aqui son de 3 a 6 columnas, asi que esto alcanza y sobra.
  function resolver(X, y, ridge) {
    const n = X.length, m = X[0].length;
    const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < n; k++) s += X[k][i] * X[k][j]; A[i][j] = s; }
      let s = 0; for (let k = 0; k < n; k++) s += X[k][i] * y[k];
      A[i][m] = s;
      // Un pellizco en la diagonal evita que el sistema se vuelva inestable cuando dos
      // columnas se parecen demasiado (por ejemplo VFC y su promedio).
      A[i][i] += ridge || 1e-6;
    }
    for (let i = 0; i < m; i++) {
      let p = i;
      for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      if (Math.abs(A[p][i]) < 1e-12) return null;
      const t = A[i]; A[i] = A[p]; A[p] = t;
      for (let r = 0; r < m; r++) {
        if (r === i) continue;
        const f = A[r][i] / A[i][i];
        for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c];
      }
    }
    return A.map((row, i) => row[m] / A[i][i]);
  }
  const predecir = (coef, fila) => coef.reduce((s, c, i) => s + c * fila[i], 0);

  function bondad(real, pred) {
    const n = real.length; if (!n) return { r2: null, mae: null, n: 0 };
    const media = real.reduce((a, b) => a + b, 0) / n;
    let ss = 0, sr = 0, ae = 0;
    for (let i = 0; i < n; i++) { ss += (real[i] - media) ** 2; sr += (real[i] - pred[i]) ** 2; ae += Math.abs(real[i] - pred[i]); }
    return { r2: ss > 0 ? Math.round((1 - sr / ss) * 1000) / 1000 : null, mae: Math.round((ae / n) * 10) / 10, n };
  }

  // ---------- serie diaria de carga ----------
  function cargaDiaria(activities) {
    const m = new Map();
    (activities || []).forEach((a) => {
      const d = String(a.date || '').slice(0, 10); if (d.length !== 10) return;
      m.set(d, (m.get(d) || 0) + (num(a.relative_effort) || 0));
    });
    if (!m.size) return null;
    const dias = [...m.keys()].sort();
    const ini = pd(dias[0]).getTime(), fin = pd(dias[dias.length - 1]).getTime();
    const fechas = [], cargas = [];
    for (let t = ini; t <= fin; t += DAY) { const d = iso(t); fechas.push(d); cargas.push(m.get(d) || 0); }
    return { fechas, cargas };
  }

  // Promedio exponencial con la constante que se le pase.
  function ema(cargas, tau) {
    const out = []; let v = 0; const a = 1 - Math.exp(-1 / tau);
    cargas.forEach((c) => { v += a * (c - v); out.push(v); });
    return out;
  }

  // ---------- 1. constantes propias de forma y fatiga ----------
  // Modelo de respuesta a impulsos: rendimiento = k1*forma - k2*fatiga + base.
  // Se prueban combinaciones de constantes y se queda la que mejor explica TUS potencias.
  // Si no hay suficientes salidas con potenciometro, se devuelven las de libro y se dice.
  function ajustarForma(activities) {
    const serie = cargaDiaria(activities);
    if (!serie) return null;
    const idx = new Map(serie.fechas.map((d, i) => [d, i]));
    const puntos = (activities || [])
      .filter((a) => num(a.p20_w) > 0 && idx.has(String(a.date).slice(0, 10)))
      .map((a) => ({ i: idx.get(String(a.date).slice(0, 10)), y: num(a.p20_w) }));
    // Con menos de 8 mediciones cualquier ajuste es ruido disfrazado de ciencia.
    if (puntos.length < 8) {
      return { tau_forma: 42, tau_fatiga: 7, propio: false, n: puntos.length,
        motivo: 'pocas-potencias', r2: null, k1: null, k2: null };
    }
    let mejor = null; const todos = [];
    for (let tf = 20; tf <= 60; tf += 2) {
      for (let ta = 3; ta <= 16; ta += 1) {
        if (ta >= tf) continue;
        const F = ema(serie.cargas, tf), A = ema(serie.cargas, ta);
        const X = puntos.map((p) => [1, F[p.i], -A[p.i]]);
        const y = puntos.map((p) => p.y);
        const coef = resolver(X, y);
        if (!coef) continue;
        // k1 y k2 negativos no tienen sentido fisico: mas forma no puede bajar la potencia.
        if (coef[1] < 0 || coef[2] < 0) continue;
        const pred = X.map((f) => predecir(coef, f));
        const b = bondad(y, pred);
        if (b.r2 == null) continue;
        todos.push({ tf, ta, r2: b.r2 });
        if (!mejor || b.r2 > mejor.r2) mejor = { tau_forma: tf, tau_fatiga: ta, r2: b.r2, k1: coef[1], k2: coef[2], base: coef[0] };
      }
    }
    if (!mejor || mejor.r2 < 0.15) {
      return { tau_forma: 42, tau_fatiga: 7, propio: false, n: puntos.length,
        motivo: 'sin-senal', r2: mejor ? mejor.r2 : null, k1: null, k2: null };
    }
    // ¿De verdad se pueden distinguir estas constantes, o hay muchas que explican lo mismo?
    // Se mide sobre lo que el ajuste NO explica, no sobre el r2 pelado: con r2 de 0.99 una
    // banda fija de 0.01 aceptaria casi cualquier constante, y con r2 de 0.4 no aceptaria
    // ninguna. Entran las que dejan sin explicar hasta un 10% mas que la mejor.
    const sinExplicar = 1 - mejor.r2;
    const empatan = todos.filter((t) => (1 - t.r2) <= sinExplicar * 1.1);
    const minF = Math.min(...empatan.map((t) => t.tf)), maxF = Math.max(...empatan.map((t) => t.tf));
    const minA = Math.min(...empatan.map((t) => t.ta)), maxA = Math.max(...empatan.map((t) => t.ta));
    // Si la banda es muy ancha, los datos no alcanzan para afinar: se admite en vez de
    // elegir una constante al azar y presentarla como si fuera suya.
    if (maxF - minF > 20 || maxA - minA > 8) {
      return { tau_forma: 42, tau_fatiga: 7, propio: false, n: puntos.length,
        motivo: 'datos-no-alcanzan', r2: mejor.r2, k1: null, k2: null,
        rango_forma: [minF, maxF], rango_fatiga: [minA, maxA] };
    }
    return {
      tau_forma: mejor.tau_forma, tau_fatiga: mejor.tau_fatiga, propio: true, n: puntos.length,
      motivo: null, r2: mejor.r2,
      rango_forma: [minF, maxF], rango_fatiga: [minA, maxA],
      k1: Math.round(mejor.k1 * 1000) / 1000, k2: Math.round(mejor.k2 * 1000) / 1000,
    };
  }

  // ---------- 2. recuperacion de manana ----------
  // Lo que se le da de comer: la carga de hoy, la VFC y el pulso en reposo comparados con
  // su propia base, el sueno, y la recuperacion de hoy. Todo relativo a uno mismo, para que
  // el modelo sea de este ciclista y no de un promedio de nadie.
  const CAMPOS = [
    ['base', () => 1, 'constante'],
    ['rec_hoy', (f) => f.rec / 100, 'tu recuperación de hoy'],
    ['carga_hoy', (f) => Math.min(f.carga, 300) / 100, 'la carga de hoy'],
    ['hrv_rel', (f) => f.hrv / f.hrv_base - 1, 'tu VFC contra tu base'],
    ['rhr_rel', (f) => (f.rhr - f.rhr_base) / 10, 'tu pulso en reposo contra tu base'],
    ['sueno', (f) => (f.sueno - 7.5) / 2, 'cuánto dormiste'],
  ];

  function filas(whoop, activities) {
    const serie = cargaDiaria(activities);
    const carga = new Map(serie ? serie.fechas.map((d, i) => [d, serie.cargas[i]]) : []);
    const w = (whoop || []).map((r) => ({
      date: String(r.date).slice(0, 10), rec: num(r.recovery), hrv: num(r.hrv), rhr: num(r.rhr),
      hrv_base: num(r.hrv_30d), rhr_base: num(r.rhr_30d), sueno: num(r.asleep_h),
    })).filter((r) => isFinite(r.rec)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const porFecha = new Map(w.map((r) => [r.date, r]));
    const out = [];
    w.forEach((r) => {
      const manana = porFecha.get(iso(pd(r.date).getTime() + DAY));
      if (!manana) return;                       // sin el dia siguiente no hay nada que aprender
      const f = {
        ...r, carga: carga.get(r.date) || 0,
        hrv_base: isFinite(r.hrv_base) && r.hrv_base > 0 ? r.hrv_base : r.hrv,
        rhr_base: isFinite(r.rhr_base) && r.rhr_base > 0 ? r.rhr_base : r.rhr,
        sueno: isFinite(r.sueno) ? r.sueno : 7.5,
      };
      const x = CAMPOS.map(([, fn]) => fn(f));
      if (x.some((v) => !isFinite(v))) return;
      out.push({ date: r.date, x, y: manana.rec, manana: manana.date });
    });
    return out;
  }

  // Validacion hacia adelante: se entrena solo con lo anterior y se predice el dia siguiente.
  // Nunca se usa el futuro para predecir el pasado, que es la trampa facil de hacer sin querer.
  function recuperacion(whoop, activities) {
    const f = filas(whoop, activities);
    const MIN = 30;
    if (f.length < MIN) return { listo: false, n: f.length, falta: MIN - f.length };
    const pruebas = [];
    for (let i = MIN; i < f.length; i++) {
      const tr = f.slice(Math.max(0, i - 400), i);
      const coef = resolver(tr.map((r) => r.x), tr.map((r) => r.y), 0.05);
      if (!coef) continue;
      const p = Math.max(1, Math.min(100, predecir(coef, f[i].x)));
      pruebas.push({ date: f[i].manana, predicho: Math.round(p), real: Math.round(f[i].y), error: Math.round(p - f[i].y) });
    }
    const coefFinal = resolver(f.map((r) => r.x), f.map((r) => r.y), 0.05);
    const b = bondad(pruebas.map((p) => p.real), pruebas.map((p) => p.predicho));
    // Que tanto pesa cada cosa, en puntos de recuperacion, para poder explicarlo en palabras.
    const pesos = coefFinal ? CAMPOS.slice(1).map(([k, , etiqueta], i) => ({
      campo: k, etiqueta, peso: Math.round(coefFinal[i + 1] * 10) / 10,
    })).sort((a, b2) => Math.abs(b2.peso) - Math.abs(a.peso)) : [];
    // La prediccion para manana, con la fila de hoy.
    const ultimo = f.length ? f[f.length - 1] : null;
    let manana = null;
    if (coefFinal && ultimo) {
      const hoy = (whoop || []).map((r) => String(r.date).slice(0, 10)).sort().slice(-1)[0];
      const fHoy = filasDeHoy(whoop, activities, hoy);
      if (fHoy) manana = Math.round(Math.max(1, Math.min(100, predecir(coefFinal, fHoy))));
    }
    return {
      listo: true, n: f.length, probados: pruebas.length,
      // Los coeficientes finales, para poder simular "que pasa si hoy hago X".
      coef: coefFinal,
      mae: b.mae, r2: b.r2,
      dentro_10: pruebas.length ? Math.round((pruebas.filter((p) => Math.abs(p.error) <= 10).length / pruebas.length) * 100) : null,
      pesos, pruebas: pruebas.slice(-60), prediccion_manana: manana,
    };
  }

  // La fila de hoy, para predecir manana (hoy todavia no tiene "dia siguiente").
  function filasDeHoy(whoop, activities, hoyIso) {
    const serie = cargaDiaria(activities);
    const carga = new Map(serie ? serie.fechas.map((d, i) => [d, serie.cargas[i]]) : []);
    const r = (whoop || []).map((x) => ({ ...x, date: String(x.date).slice(0, 10) })).find((x) => x.date === hoyIso);
    if (!r || !isFinite(num(r.recovery))) return null;
    const f = {
      rec: num(r.recovery), hrv: num(r.hrv), rhr: num(r.rhr),
      hrv_base: num(r.hrv_30d) > 0 ? num(r.hrv_30d) : num(r.hrv),
      rhr_base: num(r.rhr_30d) > 0 ? num(r.rhr_30d) : num(r.rhr),
      sueno: isFinite(num(r.asleep_h)) ? num(r.asleep_h) : 7.5,
      carga: carga.get(hoyIso) || 0,
    };
    const x = CAMPOS.map(([, fn]) => fn(f));
    return x.some((v) => !isFinite(v)) ? null : x;
  }

  // ---------- que dias vale la pena preguntar ----------
  // Sin potenciometro el modelo se queda sin con que ajustar. En vez de pedirle al ciclista
  // que escriba los vatios de todas sus salidas, se eligen las pocas donde un esfuerzo de
  // 20 min de verdad cabe y pudo ser fuerte: asi son 6 preguntas en vez de 300.
  //
  // Se busca variedad en el tiempo a proposito: 8 salidas del mismo mes no dicen nada del
  // efecto del entrenamiento, que es lo que hay que medir.
  function candidatos20min(activities, cuantos) {
    const n = cuantos || 6;
    const yaTiene = new Set((activities || []).filter((a) => num(a.p20_w) > 0).map((a) => String(a.date).slice(0, 10)));
    const aptas = (activities || []).filter((a) => {
      const min = num(a.moving_min), esf = num(a.relative_effort);
      if (!(min >= 25)) return false;                    // un esfuerzo de 20 min tiene que caber
      if (!isFinite(esf) || esf <= 0) return false;
      const dep = String(a.sport || '');
      if (/Walk|Hike|Swim|WeightTraining/i.test(dep)) return false;
      return !yaTiene.has(String(a.date).slice(0, 10));
    }).map((a) => ({
      date: String(a.date).slice(0, 10), name: a.name, sport: a.sport,
      moving_min: Math.round(num(a.moving_min)), relative_effort: Math.round(num(a.relative_effort)),
      avg_hr: isFinite(num(a.avg_hr)) ? Math.round(num(a.avg_hr)) : null,
      max_hr: isFinite(num(a.max_hr)) ? Math.round(num(a.max_hr)) : null,
      // Lo duro que fue por minuto: lo que mejor separa una salida fuerte de un paseo largo.
      intensidad: num(a.relative_effort) / num(a.moving_min),
    }));
    if (!aptas.length) return [];
    // Se reparten por meses y se toma la mas intensa de cada uno, de lo mas nuevo a lo mas viejo.
    const porMes = new Map();
    aptas.forEach((a) => {
      const k = a.date.slice(0, 7);
      const q = porMes.get(k);
      if (!q || a.intensidad > q.intensidad) porMes.set(k, a);
    });
    const meses = [...porMes.keys()].sort().reverse();
    const out = meses.slice(0, n).map((k) => porMes.get(k));
    // Si no hay suficientes meses, se completa con las mas intensas que queden.
    if (out.length < n) {
      const puestas = new Set(out.map((a) => a.date));
      aptas.filter((a) => !puestas.has(a.date))
        .sort((x, y) => y.intensidad - x.intensidad)
        .slice(0, n - out.length)
        .forEach((a) => out.push(a));
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({ ...a, intensidad: Math.round(a.intensidad * 100) / 100 }));
  }

  // ¿Que le falta al modelo para poder trabajar? Sirve para pedir solo lo necesario.
  function queFalta(activities, perfil) {
    const conPotencia = (activities || []).filter((a) => num(a.p20_w) > 0).length;
    return {
      potencias: Math.max(0, 8 - conPotencia),          // cuantas mediciones faltan para ajustar
      tiene: conPotencia,
      peso: !(perfil && num(perfil.weight_kg) > 0),
      hr_max: !(perfil && num(perfil.hr_max) > 0),
    };
  }

  // ---------- todo junto ----------
  function calcular(activities, whoop) {
    const forma = ajustarForma(activities);
    const rec = recuperacion(whoop, activities);
    return {
      forma, recuperacion: rec,
      // ¿Hace falta volver a pedirle el bloque a Claude antes de tiempo? Si el modelo
      // dejo de acertar, el plan de la semana ya no encaja con este ciclista.
      // Si no acierta dentro de 10 puntos ni la mitad de las veces, el plan de la semana
      // ya no encaja con este ciclista y conviene pedirle uno nuevo a Claude.
      necesitaReplan: !!(rec.listo && rec.dentro_10 != null && rec.dentro_10 < 50),
      calculado: new Date().toISOString(),
    };
  }

  window.rrModelo = { calcular, ajustarForma, recuperacion, cargaDiaria, ema, resolver, bondad, candidatos20min, queFalta, CAMPOS };
})();
