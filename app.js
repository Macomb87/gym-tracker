'use strict';
const IMG = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const EX = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const KEY = 'gym-tracker';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const ex = (id, sets, reps) => ({ id, sets, reps });

// Fat loss with a sore shoulder: Push / Pull / Push / Pull / Legs, each followed by 30 min cardio (5 × 30 = 150 min/week).
// Shoulder exercises (sh) are light and high-rep; push and pull days start with one as a rotator-cuff warm-up.
// Their weight follows the shoulder pain logged last time (see newActiveEx).
// Goal is to get lean, not big: 2 sets per exercise keep the muscle while dieting, ~30 min of weights.
// Exercises and their order change every rotation block (A/B).
const sh = (id, sets, reps) => ({ ...ex(id, sets, reps), sh: true });
const NEUTRAL_PRESS = 'Dumbbell_Bench_Press_with_Neutral_Grip', PULLDOWN = 'Close-Grip_Front_Lat_Pulldown';
const DEFAULT_PROGRAM = {
  v: 7, rotateDays: 14, flip: 0,
  // Mon..Sun → index into days (-1 = no gym). Basketball on Wednesday, Saturday is rest, legs on Sunday
  // (in kid weeks Sunday's legs move to Saturday, see scheduled()).
  week: [0, 1, -1, 0, 1, -1, 2],
  sports: [{ name: 'Basketball', weekday: 3 }],
  days: [
    { name: 'Push',
      A: [sh('External_Rotation_with_Cable', 2, '15-20'), sh(NEUTRAL_PRESS, 2, '12-15'), sh('Cable_Crossover', 2, '12-15'), sh('Side_Lateral_Raise', 2, '15-20'), ex('Triceps_Pushdown', 2, '12-15')],
      B: [sh('Cable_Internal_Rotation', 2, '15-20'), sh('Leverage_Chest_Press', 2, '10-12'), sh('Butterfly', 2, '12-15'), sh('Side_Lateral_Raise', 2, '15-20'), ex('Triceps_Pushdown_-_Rope_Attachment', 2, '12-15')] },
    { name: 'Pull',
      A: [sh('Face_Pull', 2, '15-20'), sh(PULLDOWN, 2, '12-15'), ex('Seated_Cable_Rows', 2, '12-15'), ex('Straight-Arm_Pulldown', 2, '12-15'), ex('Hammer_Curls', 2, '10-12')],
      B: [sh('Band_Pull_Apart', 2, '15-20'), sh(PULLDOWN, 2, '12-15'), ex('One-Arm_Dumbbell_Row', 2, '10-12'), sh('Reverse_Flyes', 2, '15-20'), ex('Standing_Biceps_Cable_Curl', 2, '10-12')] },
    { name: 'Legs', legs: true,
      A: [ex('Leg_Press', 2, '10-12'), ex('Stiff-Legged_Dumbbell_Deadlift', 2, '10-12'), ex('Dumbbell_Lunges', 2, '10-12'), ex('Lying_Leg_Curls', 2, '10-12'), ex('Standing_Calf_Raises', 2, '12-15')],
      B: [ex('Goblet_Squat', 2, '10-12'), ex('Barbell_Hip_Thrust', 2, '10-12'), ex('Dumbbell_Step_Ups', 2, '10-12'), ex('Seated_Leg_Curl', 2, '10-12'), ex('Leg_Extensions', 2, '12-15')] },
    { name: 'Cardio', A: [], B: [] }, // not in the week: used when basketball is cancelled or legs have to move
  ],
};
const CARDIO_WEEK_GOAL = 150; // minutes; 150–300 min/week of moderate cardio is the usual advice for fatty liver
const CARDIO = ['Treadmill', 'Bike', 'Elliptical', 'Rower', 'Stairs', 'Walk', 'Other'];

let S = load();
let peek = null; // date of the week row opened to show its exercises
let view = 'today', progVar = 'A', progEx = null, charts = [], pickCb = null;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.program) return withDefaults(s); } catch {}
  return withDefaults({ program: { ...structuredClone(DEFAULT_PROGRAM), startDate: today() }, sessions: [], active: null });
}
function withDefaults(s) {
  // Older saved programs (bodybuilding split) get the new program; settings and history stay.
  if ((s.program.v || 1) < DEFAULT_PROGRAM.v) {
    // The old weekly schedule pointed at the old days, so it's replaced too.
    const { startDate, sports, sportBuffer, kid } = s.program;
    s.program = { ...structuredClone(DEFAULT_PROGRAM), startDate, sportBuffer, kid, ...(sports && { sports }) };
  }
  s.weights ??= [];
  const p = s.program;
  p.sports ??= []; p.sportBuffer ??= 2; p.week ??= [...DEFAULT_PROGRAM.week]; p.kid ??= { on: false, anchor: null };
  p.days.forEach(d => d.legs ??= /leg/i.test(d.name));
  return s;
}
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// ---- helpers
function today(d = new Date()) { return d.toLocaleDateString('sv'); } // YYYY-MM-DD, local time
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function addDays(ds, n) { const d = new Date(ds + 'T00:00'); d.setDate(d.getDate() + n); return today(d); }
function weekStart(ds) { const d = new Date(ds + 'T00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return today(d); }
const shortDate = ds => new Date(ds + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmtDate = ds => new Date(ds + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const sum = a => a.reduce((x, y) => x + y, 0);
const r1 = n => Math.round(n * 10) / 10;
const fmtKg = n => Math.round(n).toLocaleString() + ' kg';
const vol = s => sum(s.exercises.map(e => sum(e.sets.map(x => x.kg * x.reps))));
const e1rm = x => x.kg * (1 + x.reps / 30); // Epley estimate
const name = id => EX[id]?.name ?? id;
const img = (id, n = 0) => `${IMG}${encodeURIComponent(id)}/${n}.jpg`;
const setsText = sets => sets.map(x => `${x.kg}×${x.reps}`).join(' · ');
const empty = msg => `<div class="empty">${msg}</div>`;
const thumbs = list => `<div class="thumbs">${list.map(e => `<figure><img loading="lazy" crossorigin="anonymous" src="${img(e.id)}" alt="" data-act="info" data-id="${esc(e.id)}">
  <figcaption>${e.sh ? '🩹 ' : ''}${esc(name(e.id))}</figcaption></figure>`).join('')}</div>`;

// Last sets of an exercise, preferring the same day (heavy and volume days use different weights).
function lastSets(id, day) {
  const find = same => {
    for (let i = S.sessions.length - 1; i >= 0; i--) {
      const s = S.sessions[i], e = (!same || s.day === day) && s.exercises.find(e => e.id === id);
      if (e) return e.sets;
    }
    return null;
  };
  return find(true) || find(false);
}

// Every second week (counted from the anchor week) is a kid week: no gym on Sunday.
function isKidWeek(ds = today()) {
  const k = S.program.kid;
  return k.on && !!k.anchor && (daysBetween(k.anchor, weekStart(ds)) / 7) % 2 === 0;
}
const isKidDay = () => isKidWeek() && new Date(today() + 'T00:00').getDay() === 0;
// Weights only (cardio comes after): kid weeks keep every exercise but only 2 sets each.
const trim = (list, short) => short ? list.map(e => ({ ...e, sets: Math.min(2, e.sets) })) : list;
const estMins = list => Math.round(5 + sum(list.map(e => e.sets)) * 2.5);
// Fixed: 30 min after weights, 45 min on cardio-only days, so no visit is longer than ~1 h.
const cardioTarget = only => only ? '45' : '30';

function rotation(ds = today()) {
  const p = S.program, d = Math.max(0, daysBetween(p.startDate, ds));
  const block = Math.floor(d / p.rotateDays);
  return { variant: (block + p.flip) % 2 ? 'B' : 'A', left: p.rotateDays - d % p.rotateDays, block: block + 1 };
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const sportOn = (sp, ds) => sp.date ? sp.date === ds : new Date(ds + 'T00:00').getDay() === sp.weekday;

// Nearest sport from today up to `sportBuffer` days ahead, e.g. { name: 'Basketball', inDays: 2 }
function upcomingSport() {
  for (let k = 0; k <= S.program.sportBuffer; k++) {
    const ds = addDays(today(), k), sp = S.program.sports.find(sp => sportOn(sp, ds));
    if (sp) return { name: sp.name, inDays: k };
  }
  return null;
}

// Fixed weekly schedule: program.week maps Mon..Sun to a program day (-1 = no gym).
// A leg day within `sportBuffer` days of a sport (e.g. an extra match) becomes a non-leg
// strength day not done yet this week, else cardio.
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dow = ds => (new Date(ds + 'T00:00').getDay() + 6) % 7; // Monday = 0
// Kid weeks: Sunday is off, so Sunday's workout moves to Saturday when Saturday is a rest day.
const scheduled = (k, ds) => {
  const w = S.program.week;
  return isKidWeek(ds) && k === 5 && !S.program.days[w[5]] ? w[6] : w[k];
};
function plan() {
  const p = S.program, days = p.days, sched = scheduled(dow(today()), today()), sport = upcomingSport();
  if (isKidDay()) return { rest: 'kid', sport };
  if (!days[sched]) return { rest: 'rest', sport };
  if (!(sport && days[sched].legs)) return { day: sched, skipped: null, sport };
  const wk = weekStart(today()), done = i => S.sessions.some(s => s.dayIndex === i && s.date >= wk);
  const pick = [days.findIndex((d, i) => !d.legs && d.A.length && !done(i)), days.findIndex(d => !d.A.length)].find(i => i >= 0) ?? sched;
  return { day: pick, skipped: pick !== sched ? sched : null, sport };
}

// What each day of the current week holds, for the week overview.
function weekPlan() {
  const p = S.program, ws = weekStart(today()), pl = plan();
  return DAY_SHORT.map((label, k) => {
    const ds = addDays(ws, k), sport = p.sports.find(sp => sportOn(sp, ds));
    const di = ds === today() ? pl.day : scheduled(k, ds);
    const what = isKidWeek(ds) && k === 6 ? '👨‍👧 Kid day' : p.days[di] ? p.days[di].name : '😴 Rest';
    return { label, ds, day: what === p.days[di]?.name && p.days[di].A.length ? di : -1, what: !sport ? what : what === '😴 Rest' ? `🏅 ${sport.name}` : `${what} · 🏅 ${sport.name}`, done: S.sessions.some(s => s.date === ds) };
  });
}
const when = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- views
function render() {
  charts.forEach(c => c.destroy()); charts = [];
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  const views = { today: () => S.active ? workoutView() : todayView(), history: historyView, progress: progressView, program: programView };
  $('#main').innerHTML = views[view]();
  if (view === 'progress' && (S.sessions.length || S.weights.length)) drawCharts();
}

function todayView() {
  const r = rotation(), p = S.program, pl = plan(), n = pl.day, day = p.days[n];
  const thisWeek = S.sessions.filter(s => s.date >= weekStart(today()));
  const short = isKidWeek(), list = day ? trim(day[r.variant], short) : [], pain = lastPain();
  const doneToday = S.sessions.filter(s => s.date === today());
  const lw = S.weights.at(-1), fw = S.weights[0], cardioWk = sum(thisWeek.map(s => s.cardio?.mins || 0));
  return `
  <div class="card rot"><div><b>Variant ${r.variant}</b> · block ${r.block}</div>
    <small>Switches to ${r.variant === 'A' ? 'B' : 'A'} in ${r.left} day${r.left === 1 ? '' : 's'}</small></div>
  ${short && !isKidDay() ? `<div class="card sport">👨‍👧 <b>Kid week</b>: no gym on Sunday, so Sunday's workout moves to Saturday.</div>` : ''}
  ${pl.sport && pl.sport.inDays > 0 ? `<div class="card sport">🏅 <b>${esc(pl.sport.name)} ${when(pl.sport.inDays)}</b> · no leg training until after it.
    ${pl.skipped !== null ? `<br><small>${esc(p.days[pl.skipped].name)} moved, doing ${esc(day.name)} instead.</small>` : ''}</div>` : ''}
  ${pain >= 6 ? `<div class="card sport">🩹 <b>Shoulder pain was ${pain}/10</b> last time. Skip the 🩹 exercises today and get the shoulder checked by a physio.</div>`
    : pain >= 4 ? `<div class="card sport">🩹 <b>Shoulder pain was ${pain}/10</b> last time, so 🩹 exercises are set 20% lighter today.</div>` : ''}
  ${doneToday.length ? `<div class="card"><small>Today</small><h2>✅ Done: ${doneToday.map(s => esc(s.day)).join(' + ')}</h2>
    <small>Great work. See the week below for what's next.</small></div>`
  : pl.rest ? `<div class="card"><small>Today</small>
    <h2>${pl.rest === 'kid' ? '👨‍👧 Kid day' : pl.sport?.inDays === 0 ? `🏅 ${esc(pl.sport.name)}` : '😴 Rest day'}</h2>
    <small>No gym today.${pl.rest === 'kid' ? ' Enjoy the day!' : pl.sport?.inDays === 0 ? ' Have a good game, it counts as hard cardio.' : ''}</small>
    ${pl.rest !== 'kid' && pl.sport?.inDays === 0 ? `<button class="ghost" data-act="start" data-day="${p.days.findIndex(d => !d.A.length)}">${esc(pl.sport.name)} cancelled? Do ${cardioTarget(true)} min cardio instead</button>` : ''}</div>`
  : `<div class="card">
    <small>Today</small>
    <h2>${esc(day.name)} <span class="tag">${r.variant}</span></h2>
    ${list.length ? `<p><small>⏱ ~${estMins(list)} min weights + ${cardioTarget(false)} min cardio · 🩹 = shoulder exercise, keep it light</small></p>
    ${thumbs(list)}`
    : `<p>⏱ ${cardioTarget(true)} min easy cardio: incline walk, bike or elliptical. Keep a pace where you can still talk, so you can keep going long enough to burn fat.</p>`}
    <button class="big" data-act="start" data-day="${n}">Start ${esc(day.name)}</button>
  </div>`}
  <div class="card"><h3>This week</h3>
    ${weekPlan().map(w => `<div class="wk-row${w.ds === today() ? ' today' : ''}"${w.day >= 0 ? ` data-act="peek" data-ds="${w.ds}"` : ''}><b>${w.label}</b>
      <span>${esc(w.what)}${w.day >= 0 ? (peek === w.ds ? ' ▾' : ' ›') : ''}</span><span>${w.done ? '✅' : ''}</span></div>
      ${peek === w.ds && w.day >= 0 ? thumbs(trim(p.days[w.day][rotation(w.ds).variant], isKidWeek(w.ds))) : ''}`).join('')}</div>
  <div class="card"><h3>⚖️ Body weight</h3>
    <small>${lw ? `Last: <b>${lw.kg} kg</b> (${fmtDate(lw.date)})${S.weights.length > 1 ? ` · ${lw.kg <= fw.kg ? '−' : '+'}${r1(Math.abs(fw.kg - lw.kg))} kg since start` : ''}`
      : 'Weigh in once a week: same day, in the morning, before breakfast.'}</small>
    <div class="row"><input type="number" inputmode="decimal" step="0.1" min="0" id="bw" placeholder="kg" style="flex:1"><button data-act="bw">Save</button></div></div>
  <div class="tiles">
    <div class="tile"><b>${thisWeek.length}</b><small>gym visits this week</small></div>
    <div class="tile"><b class="${cardioWk >= CARDIO_WEEK_GOAL ? 'up' : ''}">${cardioWk} / ${CARDIO_WEEK_GOAL} min</b><small>cardio this week</small></div>
  </div>`;
}

function lastPain() {
  for (let i = S.sessions.length - 1; i >= 0; i--) if (S.sessions[i].pain !== undefined) return S.sessions[i].pain;
  return null;
}

// Double progression: hit the top of the rep range on every set → add weight next time.
// Shoulder exercises: tiny steps (+1 kg) and only while pain stays ≤ 2; more pain → lighter or skip.
function newActiveEx(id, sets, reps, day, isSh) {
  const last = lastSets(id, day) || [];
  const top = parseInt(String(reps).split('-').pop()) || 0, bottom = parseInt(reps) || '';
  const pain = isSh ? lastPain() : null;
  const hit = top && last.length >= sets && last.every(x => x.reps >= top) && last[0].kg > 0;
  let kg = x => x.kg, hint = '', cls = 'note';
  if (pain >= 6) { hint = `⛔ Shoulder pain was ${pain}/10 last time: skip this one today and get the shoulder checked.`; cls = 'down'; }
  else if (pain >= 4) { kg = x => Math.round(x.kg * 0.8 * 2) / 2; hint = `↓ 20% lighter: shoulder pain was ${pain}/10 last time.`; cls = 'down'; }
  else if (hit && !(pain >= 3)) {
    const step = isSh ? 1 : EX[id]?.mu.some(m => /quadriceps|hamstrings|glutes/.test(m)) ? 5 : 2.5;
    kg = x => x.kg + step; hint = `↑ +${step} kg: you hit all reps last time.`; cls = 'up';
  } else if (isSh) hint = '🩹 Light weight, slow and controlled. Stop the set if pain goes above 3/10.';
  const moved = cls !== 'note';
  return { id, target: `${sets} × ${reps}`, sh: isSh, hint, cls, sets: Array.from({ length: sets }, (_, j) => {
    const l = last[j] || last.at(-1);
    return { kg: l ? kg(l) : '', reps: '', ph: l && !moved ? l.reps : bottom, done: false };
  }) };
}

function startWorkout(i) {
  const r = rotation(), day = S.program.days[i], short = isKidWeek();
  S.active = { dayIndex: i, day: day.name, variant: r.variant, start: Date.now(), short, cardio: { type: CARDIO[0], mins: '' }, pain: '',
    exercises: trim(day[r.variant], short).map(e => newActiveEx(e.id, e.sets, e.reps, day.name, e.sh)) };
}

function workoutView() {
  const a = S.active;
  return `
  <div class="wk-head"><div><h2>${esc(a.day)} ${a.variant ? `<span class="tag">${a.variant}</span>` : ''}</h2>
    <small>Started ${new Date(a.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · tap a photo for how-to</small></div>
    <button class="ghost sm" data-act="cancel">Cancel</button></div>
  ${a.exercises.map((e, i) => { const last = lastSets(e.id, a.day); return `
  <div class="card">
    <div class="ex-top"><img class="thumb" data-act="info" data-id="${esc(e.id)}" crossorigin="anonymous" src="${img(e.id)}" alt="">
      <div><h3>${e.sh ? '🩹 ' : ''}${esc(name(e.id))}</h3><span class="eq">${esc(EX[e.id]?.eq)}</span>
        <small>Target ${esc(e.target)}</small>${last ? `<small class="last">Last: ${setsText(last)}</small>` : ''}
        ${e.hint ? `<small class="${e.cls}">${e.hint}</small>` : ''}</div></div>
    ${e.sets.map((x, j) => `<div class="set${x.done ? ' done' : ''}"><span>${j + 1}</span>
      <input type="number" inputmode="decimal" step="0.5" min="0" data-e="${i}" data-s="${j}" data-f="kg" value="${x.kg}" placeholder="0"><small>kg</small>
      <input type="number" inputmode="numeric" min="0" data-e="${i}" data-s="${j}" data-f="reps" value="${x.reps}" placeholder="${x.ph}"><small>reps</small>
      <button class="chk" data-act="done" data-e="${i}" data-s="${j}">✓</button></div>`).join('')}
    <div class="row"><button class="ghost sm" data-act="addset" data-e="${i}">+ Set</button>
      <button class="ghost sm" data-act="rmex" data-e="${i}">Remove exercise</button></div>
  </div>`; }).join('')}
  <button class="ghost" data-act="addex">+ Add exercise</button>
  <div class="card" style="margin-top:12px"><h3>🩹 Shoulder pain today <small>0 = none, 10 = worst</small></h3>
    <div class="pain">${Array.from({ length: 11 }, (_, k) => `<button data-act="pain" data-v="${k}" class="${a.pain === k ? 'on' : ''}">${k}</button>`).join('')}</div>
    <small class="note">Next workout's shoulder weights are set from this.</small></div>
  <div class="card"><h3>🏃 Cardio <small>target ${cardioTarget(!a.exercises.length)} min</small></h3>
    <div class="row"><select id="ctype" style="flex:1;margin:0">${CARDIO.map(c => `<option${c === a.cardio.type ? ' selected' : ''}>${c}</option>`).join('')}</select>
      <input type="number" inputmode="numeric" min="0" id="cmins" value="${a.cardio.mins}" placeholder="min" style="width:80px"></div>
    <div class="row" style="margin-top:8px;align-items:center">
      ${a.cardio.t0 ? `<b id="ctime" style="flex:1;font-size:1.6em">${mmss(Date.now() - a.cardio.t0)}</b>` : `<small class="note" style="flex:1">Stopwatch: the minutes are added when you stop it.</small>`}
      <button data-act="ctimer">${a.cardio.t0 ? '■ Stop' : '▶ Start'}</button></div></div>
  <button class="big" data-act="finish">Finish workout</button>`;
}

// Cardio stopwatch: stopping adds the elapsed minutes to the cardio minutes.
// It stores the start time, so it keeps counting with the screen off or the app closed.
function cardioTimer(a) {
  const c = a.cardio;
  if (c.t0) { c.mins = (+c.mins || 0) + Math.max(1, Math.round((Date.now() - c.t0) / 60000)); delete c.t0; }
  else c.t0 = Date.now();
}
const mmss = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
setInterval(() => { const el = $('#ctime'); if (el && S.active?.cardio.t0) el.textContent = mmss(Date.now() - S.active.cardio.t0); }, 1000);

function finishWorkout() {
  const a = S.active;
  if (a.cardio.t0) cardioTimer(a); // still running: count it
  const exercises = a.exercises
    .map(e => ({ id: e.id, sets: e.sets.filter(x => x.done && x.reps > 0).map(x => ({ kg: +x.kg || 0, reps: +x.reps })) }))
    .filter(e => e.sets.length);
  const cardio = a.cardio.mins > 0 ? { type: a.cardio.type, mins: +a.cardio.mins } : null;
  if (!exercises.length && !cardio) {
    return ask('No sets ticked ✓ and no cardio yet. Discard this workout?', () => { S.active = null; });
  }
  const s = { id: Date.now(), date: today(new Date(a.start)), dayIndex: a.dayIndex, day: a.day, variant: a.variant,
    mins: Math.round((Date.now() - a.start) / 60000), exercises, ...(cardio && { cardio }), ...(a.pain !== '' && a.pain !== undefined && { pain: a.pain }) };
  S.sessions.push(s);
  S.active = null;
  toast(exercises.length ? `Saved! ${fmtKg(vol(s))} lifted 💪` : 'Cardio saved 🏃');
}

function historyView() {
  if (!S.sessions.length) return empty('No workouts yet. Finish your first one and it shows up here.');
  return S.sessions.slice().reverse().map(s => `<div class="card">
    <div class="between"><div><h3>${esc(s.day)} ${s.variant ? `<span class="tag">${s.variant}</span>` : ''}</h3>
      <small>${fmtDate(s.date)} · ${s.mins} min · ${fmtKg(vol(s))}</small></div>
      <button class="ghost sm" data-act="del" data-id="${s.id}">Delete</button></div>
    ${s.exercises.map(e => `<div class="hist-ex"><b>${esc(name(e.id))}</b><small>${setsText(e.sets)}</small></div>`).join('')}
    ${s.cardio ? `<div class="hist-ex"><b>🏃 ${esc(s.cardio.type)}</b><small>${s.cardio.mins} min</small></div>` : ''}
  </div>`).join('');
}

function strengthData(id) {
  return S.sessions.map(s => {
    const e = s.exercises.find(e => e.id === id);
    return e && { date: s.date, e1rm: Math.max(...e.sets.map(e1rm)), top: Math.max(...e.sets.map(x => x.kg)), reps: Math.max(...e.sets.map(x => x.reps)) };
  }).filter(Boolean);
}

function strengthSummary(id) {
  const d = strengthData(id), f = d[0], l = d.at(-1);
  if (d.every(x => !x.top)) return `<p class="sum">Bodyweight · best <b>${Math.max(...d.map(x => x.reps))} reps</b> · ${d.length} sessions</p>`;
  const pct = f.e1rm ? Math.round((l.e1rm / f.e1rm - 1) * 100) : 0;
  return `<p class="sum">Estimated 1-rep max: <b>${r1(f.e1rm)} → ${r1(l.e1rm)} kg</b>
    <span class="${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '+' : ''}${pct}%</span><br>
    <small>Heaviest set ever: ${Math.max(...d.map(x => x.top))} kg · ${d.length} sessions</small></p>`;
}

function progressView() {
  if (!S.sessions.length && !S.weights.length) return empty('Charts appear after your first workout or weigh-in.');
  const wk = weekStart(today()), prev = addDays(wk, -7);
  const w = S.weights, f = w[0], l = w.at(-1), lost = f ? r1(f.kg - l.kg) : 0;
  const weightCard = f ? `<div class="card"><h3>⚖️ Body weight</h3>
    <p class="sum">${f.kg} → <b>${l.kg} kg</b> <span class="${lost >= 0 ? 'up' : 'down'}">${lost >= 0 ? '−' : '+'}${Math.abs(lost)} kg (${Math.abs(Math.round(lost / f.kg * 100))}%)</span><br>
    <small>Goal: −10% = ${r1(f.kg * 0.9)} kg. Losing 7–10% of body weight is what clearly reduces liver fat.</small></p><canvas id="c-bw"></canvas></div>` : '';
  const painCard = S.sessions.some(s => s.pain !== undefined)
    ? `<div class="card"><h3>🩹 Shoulder pain <small>0–10, lower is better</small></h3><canvas id="c-pain"></canvas></div>` : '';
  const tw = S.sessions.filter(s => s.date >= wk), lw = S.sessions.filter(s => s.date >= prev && s.date < wk);
  const tv = sum(tw.map(vol)), lv = sum(lw.map(vol));
  const ids = [...new Set(S.sessions.flatMap(s => s.exercises.map(e => e.id)))];
  if (!ids.includes(progEx)) progEx = ids[0];
  return `
  <div class="tiles">
    <div class="tile"><b>${S.sessions.length}</b><small>workouts total</small></div>
    <div class="tile"><b>${tw.length}</b><small>workouts this week</small></div>
    <div class="tile"><b>${fmtKg(tv)}</b><small>this week${lv ? ` · <span class="${tv >= lv ? 'up' : 'down'}">${tv >= lv ? '▲' : '▼'} ${Math.abs(Math.round((tv / lv - 1) * 100))}%</span> vs last` : ''}</small></div>
    <div class="tile"><b>${sum(tw.map(s => s.cardio?.mins || 0))} / ${CARDIO_WEEK_GOAL} min</b><small>cardio this week</small></div>
  </div>
  ${weightCard}${painCard}
  ${ids.length ? `<div class="card"><h3>Am I getting stronger?</h3>
    <select id="progex">${ids.map(id => `<option value="${esc(id)}"${id === progEx ? ' selected' : ''}>${esc(name(id))}</option>`).join('')}</select>
    ${strengthSummary(progEx)}<canvas id="c-str"></canvas></div>` : ''}
  <div class="card"><h3>kg lifted per day <small>last 30 days</small></h3><canvas id="c-day"></canvas></div>
  <div class="card"><h3>kg lifted per week <small>last 12 weeks</small></h3><canvas id="c-week"></canvas></div>
  <div class="card"><h3>Cardio minutes per week <small>last 12 weeks</small></h3><canvas id="c-cardio"></canvas></div>`;
}

function drawCharts() {
  const accent = '#f97316', blue = '#38bdf8';
  Chart.defaults.color = '#9ca3af'; Chart.defaults.borderColor = '#1f2937';

  if ($('#c-bw')) {
    const w = S.weights, goal = r1(w[0].kg * 0.9);
    charts.push(new Chart($('#c-bw'), { type: 'line',
      data: { labels: w.map(x => shortDate(x.date)), datasets: [
        { label: 'Weight (kg)', data: w.map(x => x.kg), borderColor: accent, backgroundColor: accent, tension: .3 },
        { label: 'Goal', data: w.map(() => goal), borderColor: '#22c55e', borderDash: [6, 4], pointRadius: 0 }] } }));
  }
  if ($('#c-pain')) {
    const ps = S.sessions.filter(s => s.pain !== undefined);
    charts.push(new Chart($('#c-pain'), { type: 'line',
      data: { labels: ps.map(s => shortDate(s.date)), datasets: [{ data: ps.map(s => s.pain), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: .3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 10 } } } }));
  }

  const d = strengthData(progEx), bw = d.every(x => !x.top);
  if (progEx) charts.push(new Chart($('#c-str'), { type: 'line',
    data: { labels: d.map(x => shortDate(x.date)), datasets: bw
      ? [{ label: 'Best reps', data: d.map(x => x.reps), borderColor: accent, backgroundColor: accent }]
      : [{ label: 'Est. 1RM (kg)', data: d.map(x => r1(x.e1rm)), borderColor: accent, backgroundColor: accent, tension: .3 },
         { label: 'Heaviest set (kg)', data: d.map(x => x.top), borderColor: blue, backgroundColor: blue, tension: .3 }] },
    options: { plugins: { legend: { display: !bw } } } }));

  const byDay = {}, byWk = {}, cnt = {}, cardio = {};
  S.sessions.forEach(s => {
    const w = weekStart(s.date);
    byDay[s.date] = (byDay[s.date] || 0) + vol(s);
    byWk[w] = (byWk[w] || 0) + vol(s); cnt[w] = (cnt[w] || 0) + 1;
    cardio[w] = (cardio[w] || 0) + (s.cardio?.mins || 0);
  });

  const days = Array.from({ length: 30 }, (_, i) => addDays(today(), i - 29));
  charts.push(new Chart($('#c-day'), { type: 'bar',
    data: { labels: days.map(shortDate), datasets: [{ label: 'kg', data: days.map(x => Math.round(byDay[x] || 0)), backgroundColor: accent, borderRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }));

  const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekStart(today()), (i - 11) * 7));
  charts.push(new Chart($('#c-week'), {
    data: { labels: weeks.map(shortDate), datasets: [
      { type: 'bar', label: 'kg lifted', data: weeks.map(w => Math.round(byWk[w] || 0)), backgroundColor: accent, borderRadius: 4, yAxisID: 'y' },
      { type: 'line', label: 'workouts', data: weeks.map(w => cnt[w] || 0), borderColor: blue, backgroundColor: blue, yAxisID: 'y1' }] },
    options: { scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { stepSize: 1 } } } } }));

  charts.push(new Chart($('#c-cardio'), { type: 'bar',
    data: { labels: weeks.map(shortDate), datasets: [
      { label: 'min', data: weeks.map(w => cardio[w] || 0), backgroundColor: blue, borderRadius: 4 },
      { type: 'line', label: 'goal', data: weeks.map(() => CARDIO_WEEK_GOAL), borderColor: '#22c55e', borderDash: [6, 4], pointRadius: 0 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }));
}

function programView() {
  const p = S.program, r = rotation();
  return `
  <div class="card"><h3>Rotation</h3>
    <p>Now on <b>variant ${r.variant}</b> · switches in ${r.left} day${r.left === 1 ? '' : 's'}.</p>
    <label>Switch every <input type="number" min="1" id="rotdays" value="${p.rotateDays}"> days</label>
    <div class="row"><button class="ghost sm" data-act="flip">Switch to ${r.variant === 'A' ? 'B' : 'A'} now</button></div>
    <small class="note">Push and pull days start with a light 🩹 shoulder warm-up. Exercises and their order change between variants so your body keeps adapting.</small></div>
  <div class="seg">${['A', 'B'].map(v => `<button data-act="pvar" data-v="${v}" class="${progVar === v ? 'on' : ''}">Variant ${v}</button>`).join('')}</div>
  <div class="card"><h3>Weekly schedule</h3>
    ${DAY_SHORT.map((label, k) => `<div class="wk-row" style="grid-template-columns:44px 1fr;align-items:center"><b>${label}</b>
      <select data-wk="${k}" style="margin:0"><option value="-1">Rest / no gym</option>${p.days.map((d, i) => p.days.findIndex(x => x.name === d.name) !== i ? ''
        : `<option value="${i}"${p.days[p.week[k]]?.name === d.name ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>`).join('')}
    <small class="note">Keep Legs away from the 2 days before your sport. If a match moves, the app swaps the leg day for you. In kid weeks Sunday's workout moves to Saturday if Saturday is a rest day.</small></div>
  <div class="card"><h3>Sports & other activities</h3>
    ${p.sports.map((sp, k) => `<div class="prog-ex"><div class="grow"><b>${esc(sp.name)}</b>
      <small>${sp.date ? fmtDate(sp.date) : `every ${WEEKDAYS[sp.weekday]}`}</small></div>
      <div class="btns"><button data-act="rmsport" data-i="${k}">✕</button></div></div>`).join('')}
    <div class="row"><input id="spname" placeholder="Sport, e.g. Basketball" style="flex:1 1 100%">
      <select id="spday" style="flex:1;margin:0">${WEEKDAYS.map((w, k) => `<option value="${k}">Every ${w}</option>`).join('')}<option value="date">One date…</option></select>
      <input type="date" id="spdate" hidden>
      <button data-act="addsport">Add</button></div>
    <label class="note">No leg training on sport days and <input type="number" min="0" max="7" id="spbuf" value="${p.sportBuffer}"> days before.</label></div>
  <div class="card"><h3>Kid weeks</h3>
    <label><input type="checkbox" id="kidon"${p.kid.on ? ' checked' : ''}> I have my kid every second week</label>
    ${p.kid.on ? `<select id="kidthis" style="margin-top:8px"><option value="0"${isKidWeek() ? ' selected' : ''}>This week is a kid week</option>
      <option value="7"${p.kid.anchor && !isKidWeek() ? ' selected' : ''}>Next week is a kid week</option></select>` : ''}
    <small class="note">Kid weeks: no gym on Sunday, so Sunday's workout moves to Saturday.</small></div>
  ${p.days.map((d, di) => `<div class="card"><input class="dayname" data-dn="${di}" value="${esc(d.name)}">
    <label class="note"><input type="checkbox" data-legs="${di}"${d.legs ? ' checked' : ''}> Heavy on legs (keep away from sports)</label>
    ${d[progVar].map((e, ei) => `<div class="prog-ex">
      <img class="thumb sm" data-act="info" data-id="${esc(e.id)}" crossorigin="anonymous" loading="lazy" src="${img(e.id)}" alt="">
      <div class="grow"><b>${e.sh ? '🩹 ' : ''}${esc(name(e.id))}</b>
        <div><input type="number" min="1" data-d="${di}" data-i="${ei}" data-pk="sets" value="${e.sets}"> × <input data-d="${di}" data-i="${ei}" data-pk="reps" value="${esc(e.reps)}"> reps</div></div>
      <div class="btns"><button data-act="up" data-d="${di}" data-i="${ei}">↑</button><button data-act="down" data-d="${di}" data-i="${ei}">↓</button><button data-act="rm" data-d="${di}" data-i="${ei}">✕</button></div>
    </div>`).join('')}
    <div class="row"><button class="ghost sm" data-act="padd" data-d="${di}">+ Add exercise</button></div></div>`).join('')}
  <div class="card"><h3>Backup</h3><small class="note">Your data is stored only on this phone. Export a backup now and then.</small>
    <div class="row"><button class="ghost" data-act="export">Export</button>
      <label class="btn ghost">Import<input type="file" accept=".json,application/json" id="imp" hidden></label></div></div>`;
}

// ---- modals
function openModal(html) { $('#modal').innerHTML = `<div class="sheet">${html}</div>`; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

// In-app Yes/No (the browser's confirm() popup is blocked in some browsers and just returns "No").
let askCb = null;
function ask(msg, onYes) {
  askCb = onYes;
  openModal(`<p style="font-size:17px">${esc(msg)}</p>
    <div class="row"><button class="ghost" data-act="close" style="flex:1">No</button>
      <button class="big" data-act="yes" style="flex:1;margin:0">Yes</button></div>`);
}

function openInfo(id) {
  const e = EX[id];
  openModal(`<div class="sheet-head"><h3>${esc(e.name)}</h3><button data-act="close">✕</button></div>
    <div class="pair"><img crossorigin="anonymous" src="${img(id, 0)}" alt="Start position"><img crossorigin="anonymous" src="${img(id, 1)}" alt="End position"></div>
    <p><span class="eq">${esc(e.eq)}</span> <small>${esc(e.mu.join(', '))}</small></p>
    <ol>${e.ins.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`);
}

function openPicker(cb) {
  pickCb = cb;
  const eqs = [...new Set(EXERCISES.map(e => e.eq))].sort();
  openModal(`<div class="sheet-head"><input id="q" placeholder="Search… e.g. bench, curl, squat"><button data-act="close">✕</button></div>
    <select id="eqf"><option value="">All equipment</option>${eqs.map(q => `<option>${esc(q)}</option>`).join('')}</select>
    <div id="results"></div>`);
  pickResults();
  $('#q').focus();
}
function pickResults() {
  const words = $('#q').value.toLowerCase().split(/\s+/).filter(Boolean), f = $('#eqf').value;
  const list = EXERCISES.filter(e => (!f || e.eq === f) && words.every(w => e.name.toLowerCase().includes(w))).slice(0, 50);
  $('#results').innerHTML = list.map(e => `<div class="pick" data-act="pick" data-id="${esc(e.id)}">
    <img loading="lazy" crossorigin="anonymous" src="${img(e.id)}" alt=""><div><b>${esc(e.name)}</b><small>${esc(e.eq)} · ${esc(e.mu.join(', '))}</small></div></div>`).join('')
    || '<p class="note">No matches</p>';
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
  a.download = `gym-backup-${today()}.json`;
  a.click();
}

// ---- events
document.addEventListener('click', ev => {
  if (ev.target.id === 'modal') return closeModal();
  const b = ev.target.closest('[data-act],[data-view]');
  if (!b) return;
  if (b.dataset.view) { view = b.dataset.view; render(); scrollTo(0, 0); return; }
  const a = S.active, p = S.program, { act, id } = b.dataset;
  const e = +b.dataset.e, s = +b.dataset.s, d = +b.dataset.d, i = +b.dataset.i;
  switch (act) {
    case 'start': startWorkout(+b.dataset.day); scrollTo(0, 0); break;
    case 'peek': peek = peek === b.dataset.ds ? null : b.dataset.ds; break;
    case 'cancel': return ask('Cancel this workout? Nothing will be saved.', () => { S.active = null; });
    case 'yes': closeModal(); askCb(); break;
    case 'done': {
      const x = a.exercises[e].sets[s];
      if (!x.done) {
        if (x.reps === '') x.reps = x.ph === '' ? '' : +x.ph;
        if (x.reps === '') return toast('Enter reps first');
        if (x.kg === '') x.kg = 0;
      }
      x.done = !x.done; break;
    }
    case 'addset': { const sets = a.exercises[e].sets, l = sets.at(-1);
      sets.push({ kg: l ? l.kg : '', reps: '', ph: l ? (l.reps || l.ph) : '', done: false }); break; }
    case 'rmex': return ask(`Remove ${name(a.exercises[e].id)} from this workout?`, () => a.exercises.splice(e, 1));
    case 'addex': return openPicker(pid => { S.active.exercises.push(newActiveEx(pid, 3, '8-12', S.active.day)); });
    case 'pain': a.pain = +b.dataset.v; break;
    case 'ctimer': cardioTimer(a); break;
    case 'bw': {
      const kg = +$('#bw').value;
      if (!kg) return toast('Enter your weight');
      S.weights = S.weights.filter(w => w.date !== today()).concat({ date: today(), kg }).sort((x, y) => x.date.localeCompare(y.date));
      toast(`Saved ${kg} kg`); break;
    }
    case 'finish': finishWorkout(); break;
    case 'del': return ask('Delete this workout from history?', () => { S.sessions = S.sessions.filter(x => x.id !== +id); });
    case 'info': return openInfo(id);
    case 'close': return closeModal();
    case 'pick': closeModal(); pickCb(id); break;
    case 'flip': p.flip ^= 1; break;
    case 'pvar': progVar = b.dataset.v; break;
    case 'up': case 'down': {
      const list = p.days[d][progVar], j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]]; break;
    }
    case 'rm': return ask(`Remove ${name(p.days[d][progVar][i].id)} from variant ${progVar}?`, () => p.days[d][progVar].splice(i, 1));
    case 'padd': return openPicker(pid => { p.days[d][progVar].push(ex(pid, 3, '8-12')); });
    case 'export': return exportData();
    case 'addsport': {
      const nm = $('#spname').value.trim(), wd = $('#spday').value, dt = $('#spdate').value;
      if (!nm) return toast('Enter a sport name');
      if (wd === 'date' && !dt) return toast('Pick a date');
      p.sports.push(wd === 'date' ? { name: nm, date: dt } : { name: nm, weekday: +wd }); break;
    }
    case 'rmsport': p.sports.splice(i, 1); break;
    default: return;
  }
  save(); render();
});

document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q') return pickResults();
  if (t.dataset.f) { S.active.exercises[+t.dataset.e].sets[+t.dataset.s][t.dataset.f] = t.value === '' ? '' : +t.value; save(); }
  if (t.id === 'cmins') { S.active.cardio.mins = t.value === '' ? '' : +t.value; save(); }
});

document.addEventListener('change', ev => {
  const t = ev.target, p = S.program;
  if (t.id === 'eqf') return pickResults();  if (t.id === 'progex') { progEx = t.value; return render(); }
  if (t.id === 'rotdays') { p.rotateDays = Math.max(1, +t.value || 14); save(); return render(); }
  if (t.dataset.wk) { p.week[+t.dataset.wk] = +t.value; return save(); }
  if (t.id === 'ctype') { S.active.cardio.type = t.value; return save(); }
  if (t.id === 'kidon') { p.kid.on = t.checked; p.kid.anchor ??= weekStart(today()); save(); return render(); }
  if (t.id === 'kidthis') { p.kid.anchor = addDays(weekStart(today()), +t.value); save(); return render(); }
  if (t.id === 'spday') { $('#spdate').hidden = t.value !== 'date'; return; }
  if (t.id === 'spbuf') { p.sportBuffer = Math.max(0, +t.value || 0); return save(); }
  if (t.dataset.legs) { p.days[+t.dataset.legs].legs = t.checked; return save(); }
  if (t.dataset.dn) { p.days[+t.dataset.dn].name = t.value; return save(); }
  if (t.dataset.pk) { const e = p.days[+t.dataset.d][progVar][+t.dataset.i]; e[t.dataset.pk] = t.dataset.pk === 'sets' ? Math.max(1, +t.value || 1) : t.value; return save(); }
  if (t.id === 'imp' && t.files[0]) {
    t.files[0].text().then(txt => {
      const data = JSON.parse(txt);
      if (!data.program || !Array.isArray(data.sessions)) throw new Error('bad file');
      ask(`Replace current data with backup (${data.sessions.length} workouts)?`, () => { S = withDefaults(data); toast('Backup restored'); });
    }).catch(() => toast('That file is not a Gym Tracker backup.'));
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
render();
