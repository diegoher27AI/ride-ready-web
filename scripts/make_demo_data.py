"""Genera datos de ejemplo ficticios para public/data, con la misma forma que los datos reales.

No lee los datos reales de salud; solo produce series sinteticas plausibles
para que la app se vea y funcione igual, sin exponer entrenamientos reales.

Uso: python3 scripts/make_demo_data.py
Escribe en public/data/*.json (sobrescribe). Corre antes build.py para
regenerar public/index.html si tambien tocaste src/panel.html.
"""
import json
import math
import random
from datetime import date, timedelta

random.seed(7)

ROOT = __file__.rsplit('/scripts/', 1)[0]
OUT = ROOT + '/public/data/'

TODAY = date(2026, 10, 12)


def d2s(d):
    return d.isoformat()


def write(name, data):
    with open(OUT + name + '.json', 'w') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


# ---------- WHOOP: 283 dias de recuperacion / VFC / FC reposo / sueno ----------
WHOOP_DAYS = 283
whoop_start = TODAY - timedelta(days=WHOOP_DAYS - 1)
hrv_base, rhr_base = 44.0, 58.0
rows = []
rec_prev = 60.0
for i in range(WHOOP_DAYS):
    day = whoop_start + timedelta(days=i)
    hrv = max(20.0, round(hrv_base + random.gauss(0, 6), 1))
    rhr = max(45.0, round(rhr_base + random.gauss(0, 3), 1))
    sleep = max(4.5, min(9.5, round(random.gauss(7.0, 1.0), 2)))
    need = round(random.gauss(8.3, 0.4), 2)
    sleep_perf = round(min(100, max(55, sleep / need * 100)), 0)
    debt = max(0.0, round((need - sleep) * 60, 0))
    drift = (hrv - hrv_base) * 1.1 - (rhr - rhr_base) * 1.4 + (sleep - 7.0) * 6
    rec = max(10.0, min(97.0, rec_prev * 0.35 + (60 + drift) * 0.65 + random.gauss(0, 5)))
    rec = round(rec, 1)
    rec_prev = rec
    rows.append({
        'date': d2s(day), 'recovery': rec, 'hrv': hrv, 'rhr': rhr,
        'asleep_h': sleep, 'need_h': need, 'sleep_perf': sleep_perf, 'debt_min': debt,
        'resp': round(random.gauss(13.5, 0.6), 1),
        'deep_min': round(random.gauss(85, 15), 0), 'rem_min': round(random.gauss(80, 15), 0),
        'hrv_7d': 0, 'hrv_30d': 0, 'rhr_7d': 0, 'rhr_30d': 0, 'source': 'example',
    })
for i, r in enumerate(rows):
    w7 = rows[max(0, i - 6):i + 1]
    w30 = rows[max(0, i - 29):i + 1]
    r['hrv_7d'] = round(sum(x['hrv'] for x in w7) / len(w7), 1)
    r['hrv_30d'] = round(sum(x['hrv'] for x in w30) / len(w30), 1)
    r['rhr_7d'] = round(sum(x['rhr'] for x in w7) / len(w7), 1)
    r['rhr_30d'] = round(sum(x['rhr'] for x in w30) / len(w30), 1)
whoop_rows = rows
write('whoop', whoop_rows)

# ---------- PMC: carga diaria, forma fisica, fatiga, frescura, ACWR ----------
PMC_DAYS = 282
pmc_start = TODAY - timedelta(days=PMC_DAYS - 1 - 11)  # llega 11 dias despues de hoy (proyectado)
loads = []
for i in range(PMC_DAYS):
    r = random.random()
    if r < 0.38:
        loads.append(0)
    elif r < 0.75:
        loads.append(round(random.uniform(10, 90)))
    elif r < 0.95:
        loads.append(round(random.uniform(90, 200)))
    else:
        loads.append(round(random.uniform(200, 350)))

fitness, fatigue = 35.0, 25.0
af, al = 2 / 43, 2 / 8
pmc_rows = []
for i in range(PMC_DAYS):
    day = pmc_start + timedelta(days=i)
    load = loads[i]
    fitness = fitness + af * (load - fitness)
    fatigue = fatigue + al * (load - fatigue)
    form = (pmc_rows[-1]['fitness'] - pmc_rows[-1]['fatigue']) if pmc_rows else 0.0
    w7 = sum(loads[max(0, i - 6):i + 1])
    w28 = sum(loads[max(0, i - 27):i + 1])
    acwr = round(w7 / (w28 / 4), 2) if w28 else 0.0
    pmc_rows.append({
        'date': d2s(day), 'load': load, 'fitness': round(fitness, 1), 'fatigue': round(fatigue, 1),
        'form': round(form, 1), 'acwr': acwr, 'projected': day > TODAY,
    })
write('pmc', pmc_rows)

# ---------- fitness_hist: muestras semanales desde 2016 ----------
fh_start = date(2016, 1, 4)
weeks = int((TODAY - fh_start).days / 7)
fh_fit, fh_rows = 30.0, []
for i in range(weeks):
    day = fh_start + timedelta(weeks=i)
    fh_fit = max(5.0, fh_fit + random.gauss(0, 6))
    fh_fat = max(0.0, fh_fit * random.uniform(0.3, 1.6))
    fh_rows.append({'date': d2s(day), 'fitness': round(fh_fit, 1), 'fatigue': round(fh_fat, 1)})
write('fitness_hist', fh_rows)

# ---------- power: mejores esfuerzos de 20 min por salida ----------
power_dates = sorted({pmc_start + timedelta(days=random.randint(0, PMC_DAYS - 12)) for _ in range(19)})
power_rows = []
aid = 15000000000
for i, day in enumerate(power_dates):
    aid += random.randint(80000, 400000)
    ride_type = random.choice(['Thu fast', 'long', 'easy'])
    base = 150 + i * 1.2 + random.gauss(0, 10)
    avg_w = max(90, round(base * (0.72 if ride_type == 'easy' else 1.0)))
    avg_hr = round(118 + (avg_w - 150) * 0.25 + random.gauss(0, 4))
    p20_w = round(avg_w * random.uniform(1.25, 1.55))
    p5_w = round(p20_w * random.uniform(1.1, 1.3))
    weight = 75.0
    power_rows.append({
        'date': d2s(day), 'ride_type': ride_type, 'avg_w': avg_w, 'avg_hr': avg_hr,
        'p5_w': p5_w, 'p20_w': p20_w, 'avg_wkg': round(avg_w / weight, 2),
        'p5_wkg': round(p5_w / weight, 2), 'p20_wkg': round(p20_w / weight, 2),
        'ef': round(avg_w / avg_hr, 2), 'activity_id': str(aid),
    })
write('power', power_rows)

# ---------- zones ----------
ftp_w = 230
weight_kg = 75.0
zones = [{
    'weight_kg': weight_kg, 'ftp_w': ftp_w, 'ftp_wkg': round(ftp_w / weight_kg, 2), 'hr_max': 188,
    'ftp_note': 'Working FTP is an example value for this demo account; replace it once you load your own numbers.',
    'weight_note': 'W/kg uses an example weight for the whole year in this demo.',
    'heart_rate_zones': [
        {'label': 'Z1 Recovery', 'min': 0, 'max': 122}, {'label': 'Z2 Endurance', 'min': 123, 'max': 151},
        {'label': 'Z3 Tempo', 'min': 152, 'max': 166}, {'label': 'Z4 Threshold', 'min': 167, 'max': 180},
        {'label': 'Z5 VO2max', 'min': 181, 'max': None},
    ],
    'power_zones': [
        {'label': 'Z1 Recovery', 'min': 0, 'max': 126}, {'label': 'Z2 Endurance', 'min': 129, 'max': 172},
        {'label': 'Z3 Tempo', 'min': 175, 'max': 207}, {'label': 'Sweet spot', 'min': 202, 'max': 213},
        {'label': 'Z4 Threshold', 'min': 209, 'max': 241}, {'label': 'Z5 VO2max', 'min': 244, 'max': 276},
        {'label': 'Z6 Anaerobic', 'min': 279, 'max': 345},
    ],
    'device': 'example',
}]
write('zones', zones)

# ---------- activities: ultimos 15 dias ----------
NAMES = {
    'Ride': 'Morning Ride', 'HIIT_am': 'Morning HIIT', 'HIIT_pm': 'Evening HIIT',
    'MTB': 'Morning Mountain Bike Ride', 'Loop': 'Weekend Gravel Loop',
}
act_rows = []
for i in range(15):
    day = TODAY - timedelta(days=14 - i)
    kind = random.choice(['Ride', 'HIIT_am', 'HIIT_pm', 'MTB', 'MTB', 'Loop'])
    is_hiit = kind.startswith('HIIT')
    sport = 'HIIT' if is_hiit else ('MTB' if kind == 'MTB' else ('MountainBikeRide' if kind == 'Loop' else 'Ride'))
    name = 'Weekend Gravel Loop' if kind == 'Loop' else NAMES[kind]
    moving = round(random.uniform(45, 70), 1) if is_hiit else round(random.uniform(55, 250), 1)
    dist = 0 if is_hiit else round(random.uniform(10, 85), 2)
    hr = round(random.uniform(105, 125)) if is_hiit else round(random.uniform(110, 155))
    eff = round(moving * random.uniform(0.15, 1.3))
    act_rows.append({
        'date': d2s(day), 'name': name, 'sport': sport, 'moving_min': moving, 'distance_km': dist,
        'relative_effort': eff, 'calories': round(moving * random.uniform(6, 11)),
        'avg_hr': hr, 'max_hr': round(hr * random.uniform(1.25, 1.5)),
        'avg_watts': None if is_hiit else round(random.uniform(95, 165), 1),
    })
write('activities', act_rows)

# ---------- monthly + ytd_summary ----------
monthly_rows = []
for m in range(1, 11):
    sessions = random.randint(18, 29)
    hours = round(random.uniform(18, 58), 1)
    monthly_rows.append({
        'month': f'2026-{m:02d}', 'sessions': sessions, 'hours': hours,
        'relative_effort_total': round(hours * random.uniform(35, 65)),
        'calories_total': round(hours * random.uniform(500, 620)),
        'training_days': max(1, sessions - random.randint(0, 4)),
        'rest_days': random.randint(2, 12),
    })
write('monthly', monthly_rows)

ytd = [{
    'period_start': '2026-01-01', 'period_end': d2s(TODAY - timedelta(days=3)),
    'total_days': sum(1 for _ in range(1)) or 282,
    'total_activities': sum(m['sessions'] for m in monthly_rows),
    'training_days': sum(m['training_days'] for m in monthly_rows),
    'rest_days': sum(m['rest_days'] for m in monthly_rows),
    'total_hours': round(sum(m['hours'] for m in monthly_rows), 1),
    'total_relative_effort': sum(m['relative_effort_total'] for m in monthly_rows),
    'longest_no_rest_streak_days': 14, 'longest_no_rest_streak_start': '2026-02-02',
    'longest_no_rest_streak_end': '2026-02-15',
    'sport_counts': {'Ride': 70, 'MountainBikeRide': 40, 'WeightTraining': 18, 'VirtualRide': 10, 'Walk': 12, 'HighIntensityIntervalTraining': 20},
    'note': 'Example season summary for this demo account.',
}]
write('ytd_summary', ytd)

# ---------- compliance ----------
comp_templates = [
    ('Easy day: a light zone-2 spin or full rest depending on how recovered he was.',
     'Low-intensity session only; no hard ride that day.', 'yes',
     'A genuinely light day, the right call after a hard effort earlier in the week.'),
    ('45-min recovery spin, kept easy.',
     'Longer road ride than planned, more effort than the day called for.', 'no',
     'Good aerobic volume, but it added fatigue on a day that needed recovery.'),
    ('Full rest.',
     'Short easy ride, kept mostly in zone 1-2 with a low effort score.', 'partial',
     'Not the rest day, but low enough load that it barely adds fatigue.'),
]
comp_rows = []
for i, (rec, act, fol, imp) in enumerate(comp_templates):
    day = TODAY - timedelta(days=3 - i)
    comp_rows.append({'date': d2s(day), 'recommended': rec, 'actual': act, 'followed': fol, 'impact': imp})
write('compliance', comp_rows)

# ---------- sessions: proximos entrenamientos planificados ----------
def session(day, title, purpose, steps, duration):
    return {
        'date': d2s(day), 'when': 'AM', 'title': title, 'purpose': purpose,
        'condition': 'Road bike, power + HR.', 'steps': steps, 'duration_min': duration,
        'fit_power_name': f'{d2s(day)}_example_POWER.fit', 'fit_power_b64': '',
        'fit_hr_name': f'{d2s(day)}_example_HR.fit', 'fit_hr_b64': '',
    }

sessions_rows = [
    session(TODAY + timedelta(days=1), 'Endurance plus Openers',
            'Aerobic base plus short openers to read how the heart rate answers.',
            [
                {'name': 'Warmup', 'min': 15, 'int': 'warmup', 'p': [120, 145], 'hr': [105, 128]},
                {'name': 'Steady Z2', 'min': 40, 'int': 'active', 'p': [140, 185], 'hr': [125, 155]},
                {'name': 'Opener 1', 'min': 1, 'int': 'active', 'p': [260, 285], 'hr': None},
                {'name': 'Recovery', 'min': 3, 'int': 'recovery', 'p': [100, 130], 'hr': [100, 130]},
                {'name': 'Cooldown', 'min': 10, 'int': 'cooldown', 'p': [110, 140], 'hr': [100, 125]},
            ], 69),
    session(TODAY + timedelta(days=2), 'Sweet Spot 3x10',
            'Three 10-minute sweet-spot blocks to bank durable fitness.',
            [
                {'name': 'Warmup', 'min': 15, 'int': 'warmup', 'p': [120, 160], 'hr': [105, 140]},
                {'name': 'Sweet Spot 1', 'min': 10, 'int': 'active', 'p': [205, 218], 'hr': [148, 158]},
                {'name': 'Recovery', 'min': 5, 'int': 'recovery', 'p': [110, 140], 'hr': [120, 140]},
                {'name': 'Sweet Spot 2', 'min': 10, 'int': 'active', 'p': [205, 218], 'hr': [148, 158]},
                {'name': 'Cooldown', 'min': 10, 'int': 'cooldown', 'p': [110, 140], 'hr': [100, 125]},
            ], 50),
]
write('sessions', sessions_rows)

# ---------- whoop_fx: que mueve tu recuperacion ----------
whoop_fx = [
    {'factor': 'big_day', 'label': 'Day after a big ride (relative effort 150+)', 'compare': 'vs days under 50', 'rec_delta': round(random.uniform(-20, -10), 1), 'hrv_delta': round(random.uniform(-9, -3), 1), 'n': random.randint(20, 40)},
    {'factor': 'short_sleep', 'label': 'Slept under 6 hours', 'compare': 'vs 7+ hours', 'rec_delta': round(random.uniform(-17, -9), 1), 'hrv_delta': round(random.uniform(-2, 2), 1), 'n': random.randint(50, 80)},
    {'factor': 'alcohol', 'label': 'Had alcohol the day before', 'compare': 'vs no alcohol', 'rec_delta': round(random.uniform(-6, -2), 1), 'hrv_delta': round(random.uniform(-3, 0), 1), 'n': random.randint(80, 120)},
    {'factor': 'sugar', 'label': 'Added sugar the day before', 'compare': 'vs none', 'rec_delta': round(random.uniform(-5, -1), 1), 'hrv_delta': round(random.uniform(-3, 0), 1), 'n': random.randint(90, 130)},
    {'factor': 'late_meal', 'label': 'Ate close to bedtime', 'compare': 'vs not', 'rec_delta': round(random.uniform(-2, 3), 1), 'hrv_delta': round(random.uniform(-1, 1), 1), 'n': random.randint(30, 55)},
]
write('whoop_fx', whoop_fx)

# ---------- model + model_log ----------
last_whoop = whoop_rows[-1]
last_pmc = [r for r in pmc_rows if not r['projected']][-1]
forecast_rec = max(15, min(90, last_whoop['recovery'] + random.gauss(5, 8)))
model = [{
    'trained_at': d2s(TODAY) + 'T07:00:00Z', 'data_through': d2s(TODAY),
    'history_from': d2s(fh_start), 'history_days': (TODAY - fh_start).days, 'activities_years': 10.0,
    'recovery': {
        'n_days': 280, 'since': d2s(TODAY - timedelta(days=280)), 'mae': round(random.uniform(11, 16), 1),
        'mae_naive': round(random.uniform(17, 21), 1), 'sigma': round(random.uniform(13, 17), 1),
        'live_n': 1, 'live_mae': round(random.uniform(10, 16), 1),
        'effects': [
            {'factor': 'load_yday', 'label': '+100 relative effort yesterday', 'points': -11.0},
            {'factor': 'sleep_h', 'label': '+1 hour of sleep', 'points': 7.4},
            {'factor': 'fitness', 'label': '+10 fitness (42-day load)', 'points': -4.7},
            {'factor': 'fatigue', 'label': '+10 fatigue (7-day load)', 'points': 4.0},
            {'factor': 'late_meal', 'label': 'Late meal the night before', 'points': 3.4},
        ],
        'forecast': {
            'date': d2s(TODAY + timedelta(days=1)), 'based_on_load': last_pmc['load'],
            'sleep_assumed': last_whoop['asleep_h'], 'recovery': round(forecast_rec),
            'recovery_if_8h': round(min(95, forecast_rec + 16)),
            'low': round(max(5, forecast_rec - 16)), 'high': round(min(95, forecast_rec + 16)),
        },
        'scenarios': [
            {'day': 'Rest', 'load': 0, 'recovery': round(min(95, forecast_rec + 8)), 'recovery_8h': round(min(97, forecast_rec + 22))},
            {'day': 'Recovery spin 45 min', 'load': 12, 'recovery': round(min(93, forecast_rec + 7)), 'recovery_8h': round(min(96, forecast_rec + 21))},
            {'day': 'Zone 2, 2 h', 'load': 70, 'recovery': round(forecast_rec), 'recovery_8h': round(min(93, forecast_rec + 15))},
            {'day': 'Long ride 4 h', 'load': 150, 'recovery': round(max(10, forecast_rec - 8)), 'recovery_8h': round(max(15, forecast_rec + 6))},
            {'day': 'Race / very hard', 'load': 300, 'recovery': round(max(5, forecast_rec - 18)), 'recovery_8h': round(max(10, forecast_rec - 4))},
        ],
        'scenario_for': d2s(TODAY + timedelta(days=1)), 'scenario_wake': d2s(TODAY + timedelta(days=2)),
    },
    'fitness': {
        'n_markers': len(power_rows), 'since': d2s(power_dates[0]), 'tau_fitness': 36, 'tau_fatigue': 18,
        'r2': round(random.uniform(0.2, 0.4), 2), 'rmse_w': round(random.uniform(20, 35), 1),
        'watts_per_10_fitness': round(random.uniform(7, 12), 1), 'watts_per_10_fatigue': round(random.uniform(-7, -3), 1),
        'peak_day': 16, 'breakeven_day': 0, 'virtual_offset_w': round(random.uniform(-30, -15), 1),
        'trend_w_per_year': round(random.uniform(-9, -4), 1),
        'best_marks': sorted(({'date': d2s(d), 'p20': r['p20_w']} for d, r in zip(power_dates, power_rows)), key=lambda x: -x['p20'])[:3],
    },
    'history': {
        'years': [{'year': str(y), 'peak_fitness': round(random.uniform(40, 120), 1),
                    'peak_date': f'{y}-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
                    'hours': round(random.uniform(150, 580)), 'load': round(random.uniform(8000, 30000)),
                    'active_days': round(random.uniform(100, 270))} for y in range(2016, 2027)],
        'all_time_peak': {}, 'max_6wk_ramp': round(random.uniform(30, 60), 1),
        'max_ramp_end': f'{random.randint(2017,2024)}-07-{random.randint(10,28):02d}',
        'long_breaks': random.randint(4, 12), 'current_fitness': round(last_pmc['fitness'], 1),
    },
}]
model[0]['history']['all_time_peak'] = max(model[0]['history']['years'], key=lambda y: y['peak_fitness'])
write('model', model)

model_log = [
    {'date': d2s(TODAY - timedelta(days=1)), 'predicted': round(last_whoop['recovery'] + random.gauss(0, 10)),
     'low': 0, 'high': 0, 'actual': last_whoop['recovery'], 'error': 0},
    {'date': d2s(TODAY), 'predicted': round(forecast_rec), 'low': round(max(5, forecast_rec - 16)),
     'high': round(min(95, forecast_rec + 16)), 'actual': None, 'error': None},
]
model_log[0]['low'] = round(max(5, model_log[0]['predicted'] - 16))
model_log[0]['high'] = round(min(95, model_log[0]['predicted'] + 16))
model_log[0]['error'] = round(model_log[0]['actual'] - model_log[0]['predicted'], 1)
write('model_log', model_log)

# ---------- brief: resumen de hoy ----------
es_rows = []


def pair(en, es):
    es_rows.append({'en': en, 'es': es})
    return en


headline = pair(
    f"You logged a light session ({act_rows[-1]['moving_min']:.0f} min, relative effort {act_rows[-1]['relative_effort']}) "
    f"on a {last_whoop['recovery']:.0f}% recovery day. This is example data: load yours with \"Load data\".",
    f"Registraste una sesion ligera ({act_rows[-1]['moving_min']:.0f} min, esfuerzo relativo {act_rows[-1]['relative_effort']}) "
    f"en un dia de {last_whoop['recovery']:.0f}% de recuperacion. Esto es un dato de ejemplo: carga el tuyo con \"Cargar datos\"."
)
verdict = pair('Example day: train, go easy, or rest, based on demo data', 'Dia de ejemplo: entrenar, ir suave o descansar, segun datos de muestra')
ev1 = pair(
    f"Whoop example: recovery {last_whoop['recovery']:.0f}%, HRV {last_whoop['hrv']:.0f} ms vs 30-day {last_whoop['hrv_30d']:.1f}, "
    f"resting HR {last_whoop['rhr']:.0f} vs 30-day {last_whoop['rhr_30d']:.1f}.",
    f"Ejemplo de Whoop: recuperacion {last_whoop['recovery']:.0f}%, VFC {last_whoop['hrv']:.0f} ms vs {last_whoop['hrv_30d']:.1f} de 30 dias, "
    f"FC en reposo {last_whoop['rhr']:.0f} vs {last_whoop['rhr_30d']:.1f} de 30 dias."
)
ev2 = pair(
    f"Fitness is {last_pmc['fitness']:.1f} and form is {last_pmc['form']:.1f}, load ratio (ACWR) at {last_pmc['acwr']:.2f}.",
    f"La forma fisica es {last_pmc['fitness']:.1f} y la frescura es {last_pmc['form']:.1f}, relacion de carga (ACWR) en {last_pmc['acwr']:.2f}."
)
ev3 = pair('This whole screen is example data so you can try the app before loading your own.',
           'Toda esta pantalla es un dato de ejemplo para que pruebes la app antes de cargar la tuya.')
hardest_note = pair('Example hard effort used to illustrate this screen.', 'Esfuerzo duro de ejemplo para mostrar esta pantalla.')
plan_items = [
    pair('Easy day, bike optional', 'Dia suave, bici opcional'),
    pair('Rest or short walk', 'Descanso o caminata corta'),
    pair('Endurance 70 min + openers', 'Resistencia 70 min + aperturas'),
    pair('Sweet spot 3x10 min', 'Sweet spot 3x10 min'),
    pair('Example block continues', 'El bloque de ejemplo continua'),
]
plan_detail = [
    pair('Nothing to prove today. Example plan: adjust once you load your own data.',
         'Nada que probar hoy. Plan de ejemplo: ajustalo cuando cargues tus datos.'),
    pair('Example rest day in this demo plan.', 'Dia de descanso de ejemplo en este plan de muestra.'),
    pair('Example endurance ride with a few short openers.', 'Rodada de resistencia de ejemplo con aperturas cortas.'),
    pair('Example sweet-spot session.', 'Sesion de ejemplo en sweet spot.'),
    pair('Keep exploring the demo, then load your real numbers.', 'Sigue explorando la demo y luego carga tus numeros reales.'),
]
goal_note = pair(
    'Example goal for this demo account: a long event worth building toward over several months.',
    'Meta de ejemplo para esta cuenta de muestra: un evento largo para construir forma durante varios meses.'
)
race1_note = pair('Example tune-up race a few weeks out.', 'Carrera de ajuste de ejemplo, a pocas semanas.')
race2_note = pair('Example goal event later in the season.', 'Evento meta de ejemplo, mas adelante en la temporada.')

brief = [{
    'generated_at': d2s(TODAY), 'verdict': verdict, 'verdict_level': 'ok' if last_whoop['recovery'] >= 60 else ('mid' if last_whoop['recovery'] >= 34 else 'bad'),
    'headline': headline, 'streak_days_no_rest': random.randint(1, 10),
    'hardest_effort': {'date': d2s(power_dates[-1]), 'name': 'Example hard ride', 'relative_effort': 180, 'max_hr': 182, 'note': hardest_note},
    'evidence': [ev1, ev2, ev3],
    'plan': [{'day': d2s(TODAY + timedelta(days=i)), 'label': plan_items[i], 'detail': plan_detail[i]} for i in range(5)],
    'goal': {'event': 'Example Gran Fondo', 'target_date': d2s(TODAY + timedelta(days=280)), 'months_out': 9,
             'intermediate': 'Example regional race in 5 weeks', 'note': goal_note},
    'whoop': {'date': d2s(TODAY), 'recovery': last_whoop['recovery'], 'hrv': last_whoop['hrv'], 'hrv_30d': last_whoop['hrv_30d'],
              'rhr': last_whoop['rhr'], 'rhr_30d': last_whoop['rhr_30d'], 'asleep_h': last_whoop['asleep_h'],
              'need_h': last_whoop['need_h'], 'debt_min': last_whoop['debt_min'], 'sleep_7d': round(sum(r['asleep_h'] for r in whoop_rows[-7:]) / 7, 1),
              'today_pending': False},
    'races': [
        {'n': 'Example Regional Race', 'd': d2s(TODAY + timedelta(days=33)), 'from': d2s(TODAY - timedelta(days=17)), 'note': race1_note},
        {'n': 'Example Gran Fondo', 'd': d2s(TODAY + timedelta(days=280)), 'from': d2s(TODAY - timedelta(days=90)), 'note': race2_note},
    ],
}]
write('brief', brief)

# compliance narrative translations (english text already simple/generic; add passthrough pairs so lookup is stable)
for row in comp_rows:
    for k in ('recommended', 'actual', 'impact'):
        es_rows.append({'en': row[k], 'es': row[k]})

write('i18n_es', es_rows)

print('Datos de ejemplo generados en', OUT)
