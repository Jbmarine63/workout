/* Six Pack Workout PWA — offline port of the Android app, v2 redesign.
 * Plain JS, no build step. Data lives in IndexedDB; assets are precached by sw.js. */
'use strict';
(function () {
const APP_VERSION = '2.0.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const DAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const JS_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const todayCode = () => JS_DAYS[new Date().getDay()];
const dayShort = d => d ? d[0] + d.slice(1).toLowerCase() : '';
const leadingInt = t => { const m = /^\s*(\d+)/.exec(t || ''); return m ? +m[1] : null; };
const intOrNull = v => { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const numOr = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const fmtClock = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const fmtDate = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const letterOf = code => (/^[A-Za-z]+/.exec(code || '') || [''])[0].toUpperCase();
const DEFAULT_REST = 90;
const DEFAULT_SETS = 3;

/* ---------------- Icons (inline SVG, stroke = currentColor) ---------------- */
const IC = {
  today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M9 15l2 2 4-4"/>',
  program: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  lift: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  cardio: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  rest: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  truck: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l4 4v3h-8"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" stroke="none"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  speaker: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  skip: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>'
};
const icon = (n, s = 22, cls = '') => `<svg class="i ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------------- IndexedDB ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('workout-pwa', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ['sessions', 'intervals', 'exercises'])
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode); const st = t.objectStore(store);
      let out; const rq = fn(st);
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all(s) { return this.tx(s, 'readonly', st => st.getAll()); },
  get(s, id) { return this.tx(s, 'readonly', st => st.get(id)); },
  put(s, v) { if (v.id == null) delete v.id; return this.tx(s, 'readwrite', st => st.put(v)); },
  del(s, id) { return this.tx(s, 'readwrite', st => st.delete(id)); },
  clear(s) { return this.tx(s, 'readwrite', st => st.clear()); },
  async kvGet(k, d) { const r = await this.get('kv', k); return r ? r.v : d; },
  kvSet(k, v) { return this.put('kv', { k, v }); }
};

/* ---------------- State ---------------- */
const S = {
  program: null, workouts: null, seed: [], library: [], libByKey: new Map(),
  sessions: [], intervals: [], custom: [],
  settings: { week: 1, day: 'MON', currentWeek: null, theme: 'auto', keepAwake: true, a2hsDismissed: false, roadMode: false, voiceCues: true },
  hint: null, intervalDraft: null, persisted: null, backup: null,
  todayPick: null, goDraft: {}, lastDone: null
};
const saveSettings = () => DB.kvSet('settings', S.settings);
const currentWeek = () => { const n = S.settings.currentWeek ?? S.settings.week ?? 1; return Math.min(16, Math.max(1, n)); };

async function refresh() {
  [S.sessions, S.intervals, S.custom] = await Promise.all([DB.all('sessions'), DB.all('intervals'), DB.all('exercises')]);
  buildLibrary();
}
const activeSession = () => S.sessions.filter(s => !s.finished).sort((a, b) => b.date - a.date)[0] || null;

/* ---------------- Muscle groups ---------------- */
const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Full body', 'Custom'];
function classify(name) {
  const n = String(name || '').toLowerCase();
  if (/tricep|\bdips?\b|pressdown/.test(n)) return 'Triceps';
  if (/shoulder press|lateral raise|front raise|upright row|shoulder/.test(n)) return 'Shoulders';
  if (/burpee|body builders|jump|squat and press|plate swing/.test(n)) return 'Full body';
  if (/crunch|plank|superman|toe touch|knee lift|rotation|twist|exchange|transfer|v-up|mountain/.test(n)) return 'Core';
  if (/hamstring|leg curl|squat|lunge|calf|step ?up|hip |hip$|wall sit|pistol|bridge|thrust/.test(n)) return 'Legs';
  if (/curl|hammer/.test(n)) return 'Biceps';
  if (/pull|chin|row|pulldown/.test(n)) return 'Back';
  if (/push|fly|chest|press|dive bomber/.test(n)) return 'Chest';
  return 'Full body';
}

function buildLibrary() {
  const map = new Map();
  const add = (e) => {
    const key = e.name.trim().toLowerCase();
    const cur = map.get(key);
    if (!cur) map.set(key, { ...e, key });
    else {
      if (!cur.demoAsset && e.demoAsset) cur.demoAsset = e.demoAsset;
      if (!cur.instructions && e.instructions) cur.instructions = e.instructions;
      if (e.inProgram) cur.inProgram = true;
    }
  };
  S.seed.forEach(e => add({ name: e.name, muscleGroup: e.muscleGroup || classify(e.name), equipment: e.equipment || '', instructions: e.instructions || '', demoAsset: null }));
  // Only GIFs of the same exercise go on the library entry.
  S.program.weeks.forEach(w => w.groups.forEach(g => g.exercises.forEach(pe => add({
    name: pe.exerciseName, muscleGroup: classify(pe.exerciseName), equipment: '', instructions: pe.instructions || '', inProgram: true,
    demoAsset: (pe.demoMatch === 'page' || pe.demoMatch === 'same') ? pe.demoGif || null : null
  }))));
  (S.workouts.days || []).forEach(d => (d.exercises || []).forEach(ex => add({
    name: ex.name, muscleGroup: classify(ex.name), equipment: '', instructions: ex.instructions || '', inProgram: true, demoAsset: ex.demoGif || null
  })));
  S.custom.forEach(c => add({ name: c.name, muscleGroup: c.muscleGroup || 'Custom', equipment: c.equipment || '', instructions: c.instructions || '', demoAsset: null, customId: c.id }));
  S.library = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  S.libByKey = map;
}
const libEx = name => S.libByKey.get(String(name || '').trim().toLowerCase());
const weekOf = n => S.program.weeks.find(w => w.week === n);

/* ---------------- Road mode: cab-friendly swaps ----------------
 * Replaces moves that need a stability ball, pull-up bar, rope/jungle gym, bench or box
 * with versions you can do with bands and bodyweight next to (or inside) a truck. */
const ROAD_RULES = [
  [/recline pull/, { name: 'Band row (anchored in the door)', demo: 'Standing Row with bands', how: 'Anchor the band at chest height in the cab door. Step back, pull your elbows past your ribs and squeeze your shoulder blades.' }],
  [/towel pull|pull[- ]?ups?\b|pullup|chin[- ]?up|chinup/, { name: 'Band pulldown (anchored high)', demo: '45 degree Lat Pulldown with bands', how: 'Anchor the band high in the cab door. Kneel, pull your elbows down to your ribs, then let it back up slowly.' }],
  [/curl.*(rope|jungle)|(rope|jungle).*curl/, { name: 'Band biceps curl', demo: 'Bicep Curl', how: 'Stand on the middle of the band and curl. Keep your elbows pinned to your sides.' }],
  [/tricep.*(rope|jungle)/, { name: 'Band overhead triceps extension', demo: 'Standing Overhead Tricep Extension with band', how: 'Stand on the band, hold it behind your head and straighten your arms overhead.' }],
  [/squat hold with rope/, { name: 'Wall sit (back on the trailer or cab door)', demo: 'Wall Sit', how: 'Back flat on the door or trailer, slide down until your thighs are level and hold.' }],
  [/(pistol|one leg squat).*(rope|jungle)/, { name: 'Split squat (back foot on the cab step)', demo: 'Stationary Bodyweight Lunge', how: 'Back foot up on the step, lower straight down until your front thigh is level, drive back up. Both sides.' }],
  [/bench dip|tricep bench/, { name: 'Step dips (cab step or bunk edge)', demo: 'Tricep Bench Dip', how: 'Hands on the edge behind you, feet out front. Lower until your elbows hit 90°, then press up.' }],
  [/box step|step up/, { name: 'Step-ups on the cab step', demo: 'One Leg Box Step Up', how: 'Hold the grab handle for balance. Drive through the heel on the step, stand tall, step down slowly.' }],
  [/box jump|linear stability/, { name: 'Squat jumps', demo: 'Squat Jump', how: 'Squat down, jump as high as you can, land soft and go straight into the next rep.' }],
  [/^knee lift$/, { name: 'Mountain climbers', demo: '', how: 'Pushup position, drive your knees to your chest one at a time, fast.' }]
];
const BALL_RULES = [
  [/calf/, { name: 'Single-leg calf raise on the cab step', demo: 'Single Leg DB Calf Raise', how: 'Ball of your foot on the step edge, heel hanging off. Rise all the way up, lower slowly.' }],
  [/1 legged ball squat/, { name: 'Split squat (back foot on the cab step)', demo: 'Stationary Bodyweight Lunge', how: 'Back foot up on the step, lower straight down until your front thigh is level, drive back up. Both sides.' }],
  [/ball squat|wall squat/, { name: 'Wall squat against the cab door', demo: 'Wall Sit', how: 'Back flat on the door or trailer, slide down until your thighs are level. Hold the band handles at your shoulders for resistance.' }],
  [/crunch/, { name: 'Crunch on the bunk or floor', demo: 'Alternating Toe Touch', how: 'Knees bent, hands by your ears. Hold a band anchored behind you for extra resistance.' }],
  [/hamstring|leg curl|\bcurl\b/, { name: 'Single-leg glute bridge', demo: 'Hip Thrusts', how: 'On your back, one foot planted. Drive your hips up, squeeze, lower slowly. Both sides.' }],
  [/hip (bridge|extension)/, { name: 'Glute bridge (feet on the cab step)', demo: 'Hip Thrusts', how: 'On your back with your heels on the step. Drive your hips up, squeeze, lower slowly.' }],
  [/push.?ups?.*feet|feet.*push/, { name: 'Feet-elevated pushups (feet on the cab step)', demo: 'Elevated Feet Pushup', how: 'Feet up on the step, hands on the ground. Chest to the ground, press back up.' }],
  [/push.?ups?/, { name: 'Pushups', demo: 'Standard Pushup', how: 'Hands just wider than shoulders, body in a straight line. Chest to the ground, press up.' }],
  [/plank/, { name: 'Plank (feet on the cab step to make it harder)', demo: 'Plank', how: 'Forearms down, body in a straight line, squeeze your abs and glutes.' }],
  [/exchange|transfer/, { name: 'V-ups', demo: '', how: 'Lie flat, then lift your arms and legs together to meet over your hips. Lower with control.' }]
];
function roadSwap(pe) {
  const n = `${pe.label || ''} | ${pe.exerciseName || pe.exName || ''}`.toLowerCase();
  for (const [re, sw] of ROAD_RULES) if (re.test(n) || re.test(String(pe.exerciseName || '').toLowerCase())) return sw;
  if ((/\bball\b|stability (ball|crunch)/.test(n)) && !/medicine ball/.test(n)) {
    for (const [re, sw] of BALL_RULES) if (re.test(n)) return sw;
  }
  return null;
}
const roadDemo = sw => (sw && sw.demo && libEx(sw.demo)?.demoAsset) || null;
const roadCount = w => w.groups.reduce((a, g) => a + g.exercises.filter(pe => roadSwap(pe)).length, 0);

/* ---------------- Audio / speech / wake lock ---------------- */
let audioCtx = null, speechUnlocked = false;
function unlockAudio() {
  try {
    if (!audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (C) audioCtx = new C(); }
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const b = audioCtx.createBuffer(1, 1, 22050); const src = audioCtx.createBufferSource(); src.buffer = b; src.connect(audioCtx.destination); src.start(0);
    }
  } catch (e) { /* no audio */ }
  try {
    // iOS only lets a page speak after it has spoken once inside a tap.
    if (!speechUnlocked && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechUnlocked = true; }
  } catch (e) { /* no speech */ }
}
function beep(times = 3) {
  try {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime + 0.02;
      for (let i = 0; i < times; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = i === times - 1 ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.3); g.gain.exponentialRampToValueAtTime(0.5, t0 + i * 0.3 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.22);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0 + i * 0.3); o.stop(t0 + i * 0.3 + 0.25);
      }
    }
  } catch (e) { /* ignore */ }
  try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) { /* ignore */ }
}
function speak(text, force) {
  if (!force && !S.settings.voiceCues) return;
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.lang = 'en-US';
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
let wakeLock = null;
async function setWake(on) {
  try {
    if (on && S.settings.keepAwake && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      if (!wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}

/* ---------------- Timer (timestamp based) ----------------
 * st = { kind:'rest'|'work'|'interval', label, total, endAt, paused, remainingMs, done,
 *        phases:[{label,seconds}], idx, ctx, cue }  — persisted so it survives backgrounding/reload. */
const Timer = {
  st: null, iv: null,
  remainingMs() { const s = this.st; if (!s) return 0; return s.paused ? s.remainingMs : Math.max(0, s.endAt - Date.now()); },
  save() { DB.kvSet('timer', this.st); },
  start(seconds, label, kind = 'rest', ctx = null) {
    if (!(seconds > 0)) { this.clear(); return; }
    this.st = { kind, label, total: seconds, endAt: Date.now() + seconds * 1000, paused: false, remainingMs: 0, done: false, ctx, cue: null };
    this.save(); this.run();
  },
  startPhases(phases, ctx) {
    if (!phases.length) return;
    this.st = { kind: 'interval', phases, idx: 0, label: phases[0].label, total: phases[0].seconds,
      endAt: Date.now() + phases[0].seconds * 1000, paused: false, remainingMs: 0, done: false, ctx, cue: null };
    this.save(); this.run(); speak(phaseSpeech(phases[0].label));
  },
  adjust(d) {
    const s = this.st; if (!s || s.done) return;
    if (s.paused) s.remainingMs = Math.max(0, s.remainingMs + d * 1000);
    else s.endAt = Math.max(Date.now(), s.endAt + d * 1000);
    s.total = Math.max(s.total, Math.ceil(this.remainingMs() / 1000)); s.cue = null;
    this.save(); this.tick();
  },
  togglePause() {
    const s = this.st; if (!s || s.done) return;
    if (s.paused) { s.endAt = Date.now() + s.remainingMs; s.paused = false; }
    else { s.remainingMs = Math.max(0, s.endAt - Date.now()); s.paused = true; }
    this.save(); this.run();
  },
  skip() {
    const s = this.st; if (!s) return;
    if (s.kind === 'interval' && !s.done && s.idx < s.phases.length - 1) {
      s.idx++; const p = s.phases[s.idx]; s.label = p.label; s.total = p.seconds; s.endAt = Date.now() + p.seconds * 1000; s.paused = false; s.cue = null;
      this.save(); this.run(); speak(phaseSpeech(p.label));
    } else if (s.kind === 'interval' && !s.done) { this.finishIntervals(); }
    else this.clear();
  },
  clear() { this.st = null; DB.kvSet('timer', null); this.stopLoop(); setWake(false); renderTimer(); },
  run() { this.stopLoop(); if (!this.st.paused) { this.iv = setInterval(() => this.tick(), 250); setWake(true); } else setWake(false); this.tick(); },
  stopLoop() { if (this.iv) clearInterval(this.iv); this.iv = null; },
  finishIntervals() {
    const s = this.st; s.done = true; s.label = 'All rounds complete'; s.endAt = Date.now(); s.paused = false;
    this.save(); this.stopLoop(); setWake(false); beep(4); speak('All rounds complete. Nice work.');
    if (S.intervalDraft && s.ctx && s.ctx.draftKey === S.intervalDraft.key) {
      S.intervalDraft.done = true; S.intervalDraft.durationMinutes = String(computedMinutes(S.intervalDraft) ?? S.intervalDraft.durationMinutes);
      DB.kvSet('intervalDraft', S.intervalDraft);
      if (route().name === 'interval') render();
    }
    renderTimer();
  },
  cues() {
    const s = this.st; if (!s || s.paused || s.done) return;
    const rem = Math.ceil(this.remainingMs() / 1000);
    if (rem === s.cue) return;
    if (rem === 10 && s.total >= 20) { s.cue = rem; speak('10 seconds'); }
    else if (rem >= 1 && rem <= 3) { s.cue = rem; speak(String(rem)); }
  },
  tick() {
    const s = this.st;
    if (!s) { this.stopLoop(); renderTimer(); return; }
    if (!s.paused && !s.done && Date.now() >= s.endAt) {
      if (s.kind === 'interval') {
        // Chain phases from the previous phase's end time so time spent in the background is honoured.
        let end = s.endAt;
        while (s.idx < s.phases.length - 1 && Date.now() >= end) { s.idx++; end += s.phases[s.idx].seconds * 1000; }
        if (Date.now() >= end) { this.finishIntervals(); return; }
        const p = s.phases[s.idx]; s.label = p.label; s.total = p.seconds; s.endAt = end; s.cue = null;
        this.save(); beep(1); speak(phaseSpeech(p.label));
      } else {
        s.done = true; this.save(); this.stopLoop(); setWake(false);
        if (S.settings.voiceCues) { beep(1); speak(s.kind === 'work' ? 'Time' : `Go! ${s.ctx?.nextName || ''}`); } else beep(3);
        // In workout mode the next exercise takes over the screen straight away.
        if (s.ctx?.sid && route().name === 'go') { this.st = null; DB.kvSet('timer', null); render(); return; }
      }
    } else this.cues();
    renderTimer();
  }
};
const phaseSpeech = label => String(label || '').replace(/\s*—\s*/g, '. ');

function renderTimer() {
  const bar = $('#timerbar'); const s = Timer.st;
  const inGo = route().name === 'go' && s && s.ctx && s.ctx.sid;
  document.body.classList.toggle('has-timer', !!s && !inGo);
  if (inGo) {
    bar.hidden = true;
    const rem = s.done ? 0 : Timer.remainingMs() / 1000;
    const arc = $('#ringArc'), clk = $('#ringClock'), ph = $('#ringPhase'), pb = $('#ringPause');
    if (clk) clk.textContent = s.done ? 'GO' : fmtClock(Math.ceil(rem));
    if (arc) arc.setAttribute('stroke-dashoffset', String(RING_C * (1 - rem / Math.max(1, s.total))));
    if (ph) ph.textContent = s.paused ? 'PAUSED' : s.kind === 'work' ? 'WORK' : 'REST';
    if (pb) pb.textContent = s.paused ? 'Resume' : 'Pause';
    const tot = $('#ringTotal'); if (tot) tot.textContent = 'of ' + fmtClock(s.total);
    return;
  }
  if (!s) { bar.hidden = true; bar.innerHTML = ''; bar.dataset.sig = ''; return; }
  bar.hidden = false;
  const rem = s.done ? 0 : Timer.remainingMs() / 1000;
  const pct = s.total ? Math.min(100, 100 * (1 - rem / s.total)) : 100;
  const next = s.kind === 'interval' && !s.done && s.phases[s.idx + 1] ? `Next: ${s.phases[s.idx + 1].label} (${fmtClock(s.phases[s.idx + 1].seconds)})` : '';
  const sig = [s.kind, s.label, s.done, s.paused, s.idx].join('|');
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.className = s.done ? 'done' : '';
    bar.innerHTML = `<div class="tb-top"><div class="tb-label grow"><span id="tbLabel"></span>${s.paused ? ' · paused' : ''}<div class="tb-next">${h(next)}</div></div><div class="tb-clock" id="tbClock"></div></div>
      <div class="progress"><i id="tbProg"></i></div>
      <div class="tb-btns">${s.done
        ? `<button class="primary" data-act="timer-clear">${s.kind === 'interval' ? 'Close timer' : 'Done'}</button>`
        : `<button data-act="timer-adj" data-d="-15">−15s</button><button data-act="timer-adj" data-d="15">+15s</button>
           <button data-act="timer-pause">${s.paused ? 'Resume' : 'Pause'}</button>
           <button class="primary" data-act="timer-skip">Skip</button>
           ${s.kind === 'interval' ? '<button class="danger" data-act="timer-clear">Stop</button>' : ''}`}</div>`;
  }
  $('#tbLabel').textContent = s.done ? (s.kind === 'interval' ? 'All rounds complete — save below' : `${s.label} done!`) : s.label;
  $('#tbClock').textContent = fmtClock(Math.ceil(rem));
  $('#tbProg').style.width = pct + '%';
}

/* ---------------- UI helpers ---------------- */
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
let modalResolve = null;
function modal(html, onOpen) {
  return new Promise(res => {
    const m = $('#modal'); m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
    modalResolve = res; if (onOpen) onOpen(m);
  });
}
function closeModal(val) { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; const r = modalResolve; modalResolve = null; if (r) r(val); }
function choose(title, body, options) {
  return modal(`<h3>${h(title)}</h3>${body ? `<p class="muted">${body}</p>` : ''}<div class="btns">${options.map(o =>
    `<button class="${o.cls || ''}" data-act="modal-val" data-v="${h(o.v)}">${h(o.label)}</button>`).join('')}</div>`);
}
const confirmBox = (title, body, okLabel = 'OK', danger = false) =>
  choose(title, body, [{ v: 'ok', label: okLabel, cls: danger ? 'danger' : 'primary' }, { v: '', label: 'Cancel' }]).then(v => v === 'ok');

function gifTag(path, alt, cls = 'gif') { return path ? `<img class="${cls}" src="${h(path)}" alt="${h(alt || 'demo')}" loading="lazy">` : ''; }
const thumb = (path, alt, cls = 'thumb') => path ? `<span class="${cls}"><img src="${h(path)}" alt="${h(alt || '')}" loading="lazy"></span>` : `<span class="${cls} empty-thumb">${icon('lift', 22)}</span>`;
const switchBtn = (act, on, label) => `<button class="switch ${on ? 'on' : ''}" data-act="${act}" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${h(label)}"><span></span></button>`;

/* ---------------- Routing ---------------- */
function route() {
  const raw = (location.hash || '#/today').slice(2);
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'today', parts, q };
}
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

function render() {
  const r = route();
  const tab = r.name === 'interval' ? 'history' : (r.name === 'article' || r.name === 'photos') ? 'more' : r.name === 'session' ? 'today' : r.name;
  $$('#tabs a').forEach(a => { const on = a.dataset.tab === tab; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const views = { today: viewToday, program: viewProgram, exercises: viewExercises, session: viewSession, go: viewGo, history: viewHistory, interval: viewInterval, more: viewMore, article: viewArticle, photos: viewPhotos };
  const fn = views[r.name] || viewToday;
  const { title, html, after, bare } = fn(r);
  document.body.classList.toggle('focus', r.name === 'go');
  document.body.classList.toggle('bare', !!bare);
  $('#title').textContent = title;
  $('#view').innerHTML = html;
  if (after) after();
  renderTimer();
}

/* ---------------- Program helpers ---------------- */
function weekDone(n) { return S.sessions.filter(s => s.programWeek === n && s.finished).length + S.intervals.filter(i => i.programWeek === n && i.done).length; }
function dayDone(n, d) {
  return S.sessions.filter(s => s.programWeek === n && s.programDay === d && s.finished).length + S.intervals.filter(i => i.programWeek === n && i.programDay === d && i.done).length;
}
function liftDays(w) { return w.days.filter(d => d.type === 'resistance').map(d => d.day); }
function estMinutes(w) {
  let sec = 0;
  w.groups.forEach(g => g.exercises.forEach(e => { const sets = e.sets || 1; sec += sets * ((e.workSeconds || 40) + (e.restAfterSeconds || 0)); }));
  return Math.max(10, Math.round(sec / 60 / 5) * 5);
}
function formatWord(w) { return w.format === 'spartan300' ? 'Spartan 300' : w.format === 'circuit' ? 'Circuit' : 'Supersets'; }
function workoutHeadline(w) {
  const nEx = w.groups.reduce((a, g) => a + g.exercises.length, 0);
  if (w.format === 'superset') return `${w.groups.length} supersets · ${nEx} moves`;
  if (w.format === 'circuit') return `Circuit · ${nEx} moves`;
  return `Spartan 300 · ${nEx} moves`;
}
function workoutSub(w) {
  const bits = [];
  if (w.repsGuidance) bits.push(w.format === 'circuit' ? w.repsGuidance.split('/')[0].trim() + ' each' : `${w.repsGuidance} reps`);
  if (w.roundsGuidance) bits.push(w.format === 'circuit' ? `${(w.circuitLevels?.[0]?.circuits) || w.roundsGuidance} rounds` : `${w.roundsGuidance} rounds`);
  if (w.restBetweenRoundsSeconds != null) bits.push(`rest ${w.restBetweenRoundsSeconds}s after each pair`);
  else if (w.circuitLevels?.length) bits.push(`rest ${w.circuitLevels[0].restSeconds}s between moves`);
  return bits.join(' · ');
}
function weekThumbs(w, road) {
  const pick = [];
  const firsts = w.groups.map(g => g.exercises[0]);
  const all = w.groups.flatMap(g => g.exercises);
  const demoOf = pe => { const sw = road ? roadSwap(pe) : null; return sw ? (roadDemo(sw) || null) : (pe.demoGif || null); };
  const nameOf = pe => { const sw = road ? roadSwap(pe) : null; return sw ? sw.name : pe.label; };
  for (const pe of [...firsts, ...all]) {
    if (pick.length >= 5) break;
    if (pick.some(p => p.pe === pe)) continue;
    const d = demoOf(pe); if (d) pick.push({ pe, src: d, code: firsts.includes(pe) && w.format === 'superset' ? letterOf(pe.code) : pe.code, alt: nameOf(pe) });
  }
  return pick;
}

/* ---------------- Today ---------------- */
function viewToday() {
  const cw = currentWeek(), w = weekOf(cw), tcode = todayCode();
  const pick = S.todayPick || tcode;
  const dObj = w.days.find(d => d.day === pick) || w.days[0];
  const road = !!S.settings.roadMode;
  const act = activeSession();

  const segs = S.program.weeks.map(x => `<i class="${x.week < cw ? 'done' : x.week === cw ? 'now' : ''}"></i>`).join('');
  const left = 16 - cw;
  const progressText = cw === 1 ? 'Let’s get started' : cw >= 16 ? 'Final week' : cw - 1 >= 8 ? `${cw - 1} weeks done · past halfway` : `${cw - 1} week${cw - 1 === 1 ? '' : 's'} done · ${left + 1} to go`;

  const strip = w.days.map(d => {
    const done = dayDone(cw, d.day) > 0;
    const cls = ['day', d.day === pick ? 'sel' : '', d.day === tcode ? 'is-today' : '', done ? 'done' : ''].join(' ');
    const ic = d.type === 'resistance' ? 'lift' : d.type === 'interval' ? 'cardio' : 'rest';
    return `<button class="${cls}" data-act="today-pick" data-d="${d.day}" aria-pressed="${d.day === pick}" aria-label="${DAY_NAMES[d.day]}${done ? ', done' : ''}">
      <span class="dn">${d.day}</span>${done ? `<span class="dk">${icon('check', 14)}</span>` : icon(ic, 20)}<span class="dt">${d.type === 'resistance' ? 'Lift' : d.type === 'interval' ? 'Cardio' : 'Rest'}</span></button>`;
  }).join('');

  const label = pick === tcode ? 'TODAY' : DAY_NAMES[pick].toUpperCase();
  let hero = '';
  if (dObj.type === 'resistance') {
    const mine = S.sessions.filter(s => s.programWeek === cw && s.programDay === pick);
    const open = mine.find(s => !s.finished);
    const finished = mine.filter(s => s.finished).sort((a, b) => b.date - a.date)[0];
    const thumbs = weekThumbs(w, road).map(t => `<div class="ht">${thumb(t.src, t.alt, 'ht-img')}<b>${h(t.code)}</b></div>`).join('');
    let cta;
    if (open) cta = `<button class="primary big block" data-act="goto" data-h="#/go">${icon('play', 20)} RESUME WORKOUT</button>`;
    else if (finished) cta = `<div class="done-line">${icon('check', 18)} Done ${fmtDate(finished.date)} · ${finished.items.reduce((a, it) => a + it.sets.length, 0)} sets</div>
      <button class="big block" data-act="start-today" data-w="${cw}" data-d="${pick}">${icon('play', 18)} DO IT AGAIN</button>`;
    else if (act) cta = `<button class="primary big block" data-act="start-today" data-w="${cw}" data-d="${pick}">${icon('play', 20)} START WORKOUT</button>
      <div class="small muted center">You have “${h(act.name)}” open. <a href="#/go">Resume it</a></div>`;
    else cta = `<button class="primary big block" data-act="start-today" data-w="${cw}" data-d="${pick}">${icon('play', 20)} START WORKOUT</button>`;
    hero = `<div class="hero">
      <div class="hero-top"><span class="eyebrow acc">${label} · RESISTANCE</span><span class="small muted ic-line">${icon('clock', 15)} about ${estMinutes(w)} min</span></div>
      <h2 class="display">${h(workoutHeadline(w))}</h2>
      <div class="muted small">${h(workoutSub(w))}</div>
      ${thumbs ? `<div class="hthumbs">${thumbs}</div>` : ''}
      ${cta}
      <a class="small" href="#/program/w/${cw}/d/${pick}">See the full routine</a>
    </div>`;
  } else if (dObj.type === 'interval') {
    const p = w.interval;
    const logged = S.intervals.filter(i => i.programWeek === cw && i.done).length;
    hero = `<div class="hero">
      <div class="hero-top"><span class="eyebrow acc">${label} · CARDIO</span>${p ? `<span class="small muted ic-line">${icon('clock', 15)} about ${p.totalMinutes} min</span>` : ''}</div>
      <h2 class="display">Interval cardio${p ? ` · ${p.rounds} rounds` : ''}</h2>
      ${p ? `<div class="muted small">${p.highSeconds}s hard + ${p.moderateSeconds}s easy · warm up ${h(p.warmupMinutes)} min · cool down ${p.cooldownMinutes} min</div>` : ''}
      <div class="small">${logged} of ${p ? p.timesPerWeek : 3} cardio sessions done this week · run, bike, jump rope, stairs, anything</div>
      <button class="primary big block" data-act="open-interval" data-w="${cw}" data-d="${pick}">${icon('play', 20)} START INTERVALS</button>
    </div>`;
  } else {
    hero = `<div class="hero">
      <span class="eyebrow acc">${label} · REST</span>
      <h2 class="display">Rest day</h2>
      <div class="muted small">Recover, eat well, drink water, and get some sleep. Next week starts tomorrow.</div>
      <button class="big block" data-act="open-interval" data-w="${cw}" data-d="${pick}">Log some cardio anyway</button>
    </div>`;
  }

  const nSwap = roadCount(w);
  const roadText = road ? (dObj.type === 'resistance' ? (nSwap ? `On · ${nSwap} move${nSwap === 1 ? '' : 's'} swapped for cab-friendly versions (no ball, bar or bench)` : 'On · nothing to swap this week') : 'On · swaps moves that need a ball, bar or bench') : 'Off · the program exactly as written';

  const lifts = liftDays(w);
  const weekComplete = lifts.length && lifts.every(d => dayDone(cw, d) > 0) && cw < 16;
  const a2hs = (!S.settings.a2hsDismissed && isIOS() && !isStandalone())
    ? `<div class="banner" id="a2hs">${icon('share', 20)}<div class="grow small"><b>Install:</b> tap Share in Safari, then <b>Add to Home Screen</b>. Works offline and keeps your log safe.</div><button class="icon sm ghost" data-act="a2hs-x" aria-label="Dismiss">${icon('x', 16)}</button></div>` : '';

  return { title: 'Today', bare: true, html: `
    ${a2hs}
    <header class="today-head">
      <div class="eyebrow">${DAY_NAMES[tcode].toUpperCase()} · 16-WEEK PROGRAM</div>
      <div class="row between end">
        <h1 class="display xl">WEEK ${cw} <span class="dim">/ 16</span></h1>
        <button class="link-btn" data-act="change-week">Change week</button>
      </div>
      <div class="segs" role="img" aria-label="Week ${cw} of 16">${segs}</div>
      <div class="small muted">${progressText}</div>
    </header>
    ${weekComplete ? `<div class="card win">${icon('trophy', 22)}<div class="grow"><b>Week ${cw} done!</b><div class="small muted">All the lifting days are logged.</div></div><button class="sm primary" data-act="set-week" data-w="${cw + 1}">Start Week ${cw + 1}</button></div>` : ''}
    <div class="strip">${strip}</div>
    ${hero}
    <div class="card road">
      <span class="road-ic">${icon('truck', 22)}</span>
      <div class="grow"><div class="t">Road mode</div><div class="small muted">${h(roadText)}</div></div>
      ${switchBtn('toggle-road', road, 'Road mode')}
    </div>
    <div class="row gap">
      <button class="grow" data-act="start-empty-quick">${icon('plus', 18)} Empty workout</button>
      <button class="grow" data-act="open-interval" data-w="${cw}" data-d="">${icon('cardio', 18)} Log cardio</button>
    </div>` };
}

/* ---------------- Program tab ---------------- */
function viewProgram(r) {
  if (r.parts[1] === 'w' && r.parts[2]) {
    const n = +r.parts[2]; if (n >= 1 && n <= 16) S.settings.week = n;
    if (r.parts[3] === 'd' && DAY_NAMES[r.parts[4]]) S.settings.day = r.parts[4];
    saveSettings();
  }
  const n = S.settings.week, day = S.settings.day, w = weekOf(n), cw = currentWeek();
  const weeks = S.program.weeks.map(x => {
    const done = weekDone(x.week);
    return `<button class="${x.week === n ? 'on' : ''} ${x.week === cw ? 'cur' : ''}" data-act="pick-week" data-w="${x.week}">Wk ${x.week}<small>${done ? `✓ ${done}` : x.format === 'circuit' ? 'circuit' : x.format === 'spartan300' ? '300' : 'superset'}</small></button>`;
  }).join('');
  const dayBtns = w.days.map(d => `<button class="${d.day === day ? 'on' : ''}" data-act="pick-day" data-d="${d.day}">${dayShort(d.day)}<small>${dayDone(n, d.day) ? '✓' : d.type === 'resistance' ? 'Lift' : d.type === 'interval' ? 'Cardio' : 'Rest'}</small></button>`).join('');
  const dObj = w.days.find(d => d.day === day) || w.days[0];
  let dayHtml;
  if (dObj.type === 'resistance') dayHtml = resistanceDay(w, dObj.day);
  else if (dObj.type === 'interval') dayHtml = intervalDay(w, dObj.day);
  else dayHtml = `<div class="card" id="restDay"><h3>Sunday: Rest</h3><p class="muted">The program schedules Sunday as a rest day. Recover, eat well, and get ready for next week.</p></div>`;
  return { title: '16-Week Program', html: `
    <div class="weekgrid" id="weekGrid">${weeks}</div>
    ${n !== cw ? `<div class="small muted pad-s">You're on Week ${cw}. <button class="link-btn" data-act="set-week" data-w="${n}">Make Week ${n} my current week</button></div>` : ''}
    ${weekHeader(w)}
    <div class="daygrid" id="dayGrid">${dayBtns}</div>
    <div style="margin-top:12px" id="dayContent" data-week="${w.week}" data-day="${dObj.day}">${dayHtml}</div>` };
}
function weekHeader(w) {
  const lv = (w.circuitLevels || []).length ? `<table class="levels"><tr><th>Level</th><th>Work</th><th>Break</th><th>Rounds</th></tr>${w.circuitLevels.map(l => `<tr><td>${h(l.level)}</td><td>${l.workSeconds}s</td><td>${l.restSeconds}s</td><td>${h(l.circuits)}</td></tr>`).join('')}</table>` : '';
  const imgs = (S.workouts.days.find(d => d.week === w.week)?.journalImages || []);
  return `<div class="card" id="weekHeader">
    <div class="row between"><h3 class="display md" style="margin:0">Week ${w.week}</h3><span class="badge">${h(formatWord(w))}</span></div>
    <div class="small muted">${h(workoutSub(w))}</div>
    ${lv}
    ${w.substitutions.length ? `<details><summary>Tips from the trainer (${w.substitutions.length})</summary><ul class="tight small" id="subs">${w.substitutions.map(s => `<li>${h(s)}</li>`).join('')}</ul></details>` : ''}
    <details><summary>Week instructions</summary><p class="small">${h(w.instructions)}</p>
      ${w.appNotes.length ? `<div class="small muted" id="appNotes"><b>Missing from the original site:</b><ul class="tight">${w.appNotes.map(s => `<li>${h(s)}</li>`).join('')}</ul></div>` : ''}</details>
    ${imgs.length ? `<details><summary>Journal photos (${imgs.length})</summary>${imgs.map(p => `<img class="photo" src="${h(p)}" alt="journal photo" loading="lazy">`).join('')}</details>` : ''}
  </div>`;
}
function groupHeaderText(g) {
  if (!g) return { kind: 'Group', sub: '' };
  const kind = g.kind === 'superset' ? `Superset ${g.code}` : g.kind === 'circuit' ? `Circuit` : 'Exercises (any order)';
  const parts = [];
  if (g.roundsText) parts.push(g.kind === 'list' ? `${g.roundsText} round` : `${g.kind === 'circuit' ? g.roundsText.split('/')[0].replace(/beginner/i, '').trim() : g.roundsText} rounds`);
  if (g.kind === 'superset') parts.push(`rest ${g.restAfterGroupSeconds ?? '?'}s after the pair`);
  if (g.restAfterEachSeconds != null) parts.push(`rest ${g.restAfterEachSeconds}s after each`);
  return { kind, sub: parts.filter(Boolean).join(' · ') };
}
function resistanceDay(w, day) {
  const logged = S.sessions.filter(s => s.programWeek === w.week && s.programDay === day && s.finished).length;
  const road = !!S.settings.roadMode;
  const groups = w.groups.map(g => {
    const gh = groupHeaderText(g);
    return `<div class="group-h">${h(gh.kind)} <span class="muted">${h(gh.sub)}</span></div>` + g.exercises.map(e => {
      const sw = road ? roadSwap(e) : null;
      const demo = sw ? roadDemo(sw) : e.demoGif;
      return `<div class="ex ${g.kind !== 'list' ? 'in-group' : ''} prog-ex">
        <div class="row top">${thumb(demo, sw ? sw.name : e.exerciseName)}
          <div class="grow"><div class="row"><span class="badge">${h(e.code)}</span><span class="ex-title grow">${h(sw ? sw.name : e.label)}</span></div>
          <div class="target">${e.sets} × ${h(e.reps)}${e.restAfterSeconds === 0 ? ' · no rest → next' : e.restAfterSeconds ? ` · rest ${e.restAfterSeconds}s` : ''}</div>
          ${sw ? `<div class="small road-note">${icon('truck', 14)} Road mode swap for: ${h(e.label)}</div>` : ''}
          ${!sw && e.trainerComments ? `<div class="small muted">Trainer: ${h(e.trainerComments)}</div>` : ''}</div></div>
        ${demo ? `<details><summary>Demo${!sw && e.demoMatch === 'similar' ? ' (similar move)' : ''}</summary>${gifTag(demo, e.exerciseName)}</details>` : ''}
        ${sw ? `<details><summary>How to</summary><p class="small">${h(sw.how)}</p></details>` : e.instructions ? `<details><summary>How to</summary><pre class="text small">${h(e.instructions)}</pre></details>` : ''}
      </div>`;
    }).join('');
  }).join('');
  const startBtn = `<button class="primary big block" data-act="start-program" data-w="${w.week}" data-d="${day}">${icon('play', 18)} START WEEK ${w.week} · ${day}</button>`;
  return `<div class="card"><div class="row between"><h3 style="margin:0">${DAY_NAMES[day]}: Lift</h3>${logged ? `<span class="badge ok">${icon('check', 12)} Done ${logged}×</span>` : ''}</div>
    <p class="small muted">About ${estMinutes(w)} min. Starts in workout mode. You can still add, swap or reorder anything.</p>
    ${startBtn}</div>${groups}<div style="margin-top:8px">${startBtn}</div>`;
}
function intervalDay(w, day) {
  const p = w.interval;
  const logged = S.intervals.filter(i => i.programWeek === w.week);
  return `<div class="card" id="intervalDay"><h3>${DAY_NAMES[day]}: Interval cardio (optional)</h3>
    ${p ? `<p class="target">${p.rounds} rounds × (${p.highSeconds}s hard + ${p.moderateSeconds}s easy) · warm up ${h(p.warmupMinutes)} min · cool down ${p.cooldownMinutes} min ≈ ${p.totalMinutes} min · ${p.timesPerWeek}× this week</p>
    <p class="small">${h(p.text)}</p>` : ''}
    <details><summary>The rules</summary><p class="small">${h(S.program.intervalRules)}</p><p class="small">Activities: ${h(S.program.intervalActivities)}</p></details>
    <div class="small" style="margin:6px 0">Done this week: <b>${logged.filter(i => i.done).length}</b> of ${p ? p.timesPerWeek : 3}</div>
    <button class="primary big block" data-act="open-interval" data-w="${w.week}" data-d="${day}">${icon('play', 18)} START INTERVALS</button>
  </div>
  ${logged.sort((a, b) => b.date - a.date).map(intervalListItem).join('')}`;
}

/* ---------------- Sessions ---------------- */
function programItems(w, road) {
  const items = [];
  w.groups.forEach(g => g.exercises.forEach(pe => {
    const sw = road ? roadSwap(pe) : null;
    items.push({
      uid: uid(), exName: sw ? sw.name : pe.exerciseName, label: sw ? sw.name : pe.label, groupCode: pe.code,
      group: { code: g.code, kind: g.kind, roundsText: g.roundsText, restAfterGroupSeconds: g.restAfterGroupSeconds, restAfterEachSeconds: g.restAfterEachSeconds },
      targetSets: pe.sets, targetReps: pe.reps || '', restAfterSeconds: pe.restAfterSeconds ?? null, workSeconds: pe.workSeconds ?? null,
      notes: sw ? sw.how : [pe.trainerComments ? `Trainer: ${pe.trainerComments}` : '', pe.note || ''].filter(Boolean).join('\n'),
      demoAsset: sw ? roadDemo(sw) : pe.demoGif || null,
      demoNote: sw ? '' : pe.demoMatch === 'same' ? 'Demo from another week (same exercise)' : pe.demoMatch === 'similar' ? 'Similar demo (related exercise)' : '',
      roadFrom: sw ? pe.label : undefined,
      sets: []
    });
  }));
  return items;
}
async function startProgram(weekN, day) {
  const act = activeSession();
  if (act) {
    const v = await choose('A workout is in progress', `“${h(act.name)}” is still open. Finish it (everything logged is kept) and start Week ${weekN} · ${dayShort(day)}?`,
      [{ v: 'finish', label: 'Finish & start', cls: 'primary' }, { v: 'resume', label: 'Resume current workout' }, { v: '', label: 'Cancel' }]);
    if (v === 'resume') return go('#/go');
    if (v !== 'finish') return;
    act.finished = true; await DB.put('sessions', act);
  }
  const w = weekOf(weekN); const road = !!S.settings.roadMode;
  await DB.put('sessions', { uid: uid(), date: Date.now(), name: `Week ${weekN} · ${dayShort(day)}${road ? ' · Road' : ''}`, notes: '', finished: false, programWeek: weekN, programDay: day, roadMode: road, items: programItems(w, road) });
  S.hint = null; S.goDraft = {}; S.lastDone = null; if (Timer.st && Timer.st.kind !== 'interval') Timer.clear();
  await refresh(); go('#/go');
}
async function startEmpty(name) {
  const act = activeSession(); if (act) return act;
  const s = { uid: uid(), date: Date.now(), name: (name || '').trim() || 'Workout', notes: '', finished: false, programWeek: null, programDay: null, items: [] };
  const id = await DB.put('sessions', s); await refresh(); return S.sessions.find(x => x.id === id);
}
function newItemFromLib(ex) {
  return { uid: uid(), exName: ex.name, label: ex.name, groupCode: '', group: null, targetSets: null, targetReps: '', restAfterSeconds: null, workSeconds: null, notes: '', demoAsset: ex.demoAsset || null, demoNote: '', sets: [] };
}
const sessionById = id => S.sessions.find(s => s.id === id);
async function saveSession(s) { await DB.put('sessions', s); await refresh(); }

function itemContext(items, i) {
  const L = letterOf(items[i].groupCode);
  if (!L) return { L, next: null, groupRest: null, first: null };
  const same = items.map((x, j) => ({ x, j })).filter(o => letterOf(o.x.groupCode) === L);
  const pos = same.findIndex(o => o.j === i);
  return { L, next: same[pos + 1]?.x || null, first: same[0].x, groupRest: same[same.length - 1].x.restAfterSeconds };
}
function targetLine(it, ctx) {
  const parts = [];
  if (it.targetSets) parts.push(`${it.targetSets} × ${it.targetReps || '?'}`); else if (it.targetReps) parts.push(it.targetReps);
  const r = it.restAfterSeconds;
  if (r == null) parts.push(it.groupCode ? 'rest: not specified' : `rest ${DEFAULT_REST} s`);
  else if (r === 0) parts.push(`no rest → ${ctx.next ? ctx.next.groupCode : 'next'}`);
  else parts.push(`rest ${r} s after`);
  if (it.workSeconds) parts.push(`work ${it.workSeconds} s`);
  return parts.join(' · ');
}
/** List view: no rest inside a superset, rest after the pair / each circuit exercise. */
function afterSetHint(s, i) {
  const items = s.items, it = items[i], ctx = itemContext(items, i);
  const rest = it.restAfterSeconds;
  const nameOf = x => `${x.groupCode ? x.groupCode + ' ' : ''}${x.label}`;
  if (!ctx.L) { S.hint = null; Timer.start(rest ?? DEFAULT_REST, 'Rest'); return; }
  let nextTarget;
  if (ctx.next) nextTarget = ctx.next;
  else if (ctx.first.sets.length < (ctx.first.targetSets || 0)) nextTarget = ctx.first;
  else nextTarget = items.slice(i + 1).find(x => letterOf(x.groupCode) !== ctx.L) || null;
  const roundInfo = nextTarget === ctx.first && ctx.next == null ? ` (round ${ctx.first.sets.length + 1}${ctx.first.targetSets ? ' of ' + ctx.first.targetSets : ''})` : '';
  if (rest === 0) {
    if (Timer.st && Timer.st.kind === 'rest') Timer.clear();
    S.hint = `No rest inside the superset — go straight to ${nextTarget ? nameOf(nextTarget) : 'the next exercise'}.`; return;
  }
  if (rest == null) { S.hint = `The program gives no rest time here. Start a timer if you need one.${nextTarget ? ' Next: ' + nameOf(nextTarget) + '.' : ''}`; return; }
  S.hint = nextTarget ? `Rest ${rest}s, then ${nameOf(nextTarget)}${roundInfo}.` : `Rest ${rest}s — that was the last exercise. Tap Finish when you're done.`;
  Timer.start(rest, 'Rest');
}

/* ---------------- Workout mode ---------------- */
const RING_C = 741.4; // 2πr for r = 118
const targetOf = it => it.targetSets || DEFAULT_SETS;
const groupKey = (items, i) => letterOf(items[i].groupCode) || ('#' + items[i].uid);
function groupsOf(s) {
  const order = [], map = new Map();
  s.items.forEach((it, i) => { const k = groupKey(s.items, i); if (!map.has(k)) { map.set(k, []); order.push(k); } map.get(k).push(i); });
  return order.map(k => ({ key: k, idx: map.get(k) }));
}
/** The next set to do: supersets/circuits go round-robin, one set of each member per round. */
function nextStep(s) {
  const skipped = new Set(s.skipped || []);
  for (const g of groupsOf(s)) {
    const open = g.idx.filter(i => !skipped.has(s.items[i].uid) && s.items[i].sets.length < targetOf(s.items[i]));
    if (!open.length) continue;
    const minSets = Math.min(...open.map(i => s.items[i].sets.length));
    const i = open.find(j => s.items[j].sets.length === minSets);
    return { i, round: minSets + 1, of: targetOf(s.items[i]), group: g };
  }
  return null;
}
function restAfter(s, i) {
  const it = s.items[i];
  if (it.restAfterSeconds != null) return it.restAfterSeconds;
  return letterOf(it.groupCode) ? 0 : DEFAULT_REST;
}
/** Sets from the most recent other workout that had this exercise. */
function pastSets(exName, sid) {
  const key = String(exName || '').toLowerCase();
  const prev = S.sessions.filter(s => s.id !== sid).sort((a, b) => b.date - a.date);
  for (const s of prev) { const it = s.items.find(x => String(x.exName || '').toLowerCase() === key && x.sets.length); if (it) return it.sets; }
  return null;
}
function bestOf(exName, sid) {
  const key = String(exName || '').toLowerCase(); let best = null;
  S.sessions.filter(s => s.id !== sid).forEach(s => s.items.forEach(it => {
    if (String(it.exName || '').toLowerCase() !== key) return;
    it.sets.forEach(st => {
      const w = +st.weight || 0, r = +st.reps || 0;
      if (!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r };
    });
  }));
  return best;
}
const setText = st => st ? `${st.reps}${+st.weight ? ` × ${st.weight} lb` : ''}` : '';
const isTimed = it => !!it.workSeconds || /sec/i.test(it.targetReps || '');
function draftFor(s, i) {
  const it = s.items[i], k = `${s.id}:${it.uid}:${it.sets.length}`;
  if (!S.goDraft[k]) {
    const past = pastSets(it.exName, s.id);
    const lastHere = it.sets[it.sets.length - 1];
    const pastSame = past ? past[Math.min(it.sets.length, past.length - 1)] : null;
    const reps = lastHere ? +lastHere.reps : pastSame ? +pastSame.reps : (it.workSeconds || leadingInt(it.targetReps) || 10);
    const weight = lastHere ? +lastHere.weight || 0 : pastSame ? +pastSame.weight || 0 : 0;
    S.goDraft[k] = { reps, weight };
  }
  return { k, d: S.goDraft[k] };
}
function goHeader(s, eyebrow, sub) {
  const groups = groupsOf(s);
  const bars = groups.length <= 8 ? `<div class="gsegs" style="grid-template-columns:repeat(${groups.length},minmax(0,1fr))">${groups.map(g => {
    const tot = g.idx.reduce((a, i) => a + targetOf(s.items[i]), 0), done = g.idx.reduce((a, i) => a + Math.min(s.items[i].sets.length, targetOf(s.items[i])), 0);
    const pct = tot ? Math.round(100 * done / tot) : 0;
    const L = g.key.startsWith('#') ? '•' : g.key;
    return `<div><i style="--p:${pct}%" class="${pct >= 100 ? 'full' : ''}"></i><b>${h(L)}</b></div>`;
  }).join('')}</div>` : '';
  return `<div class="go-top">
      <a class="round-btn" href="#/today" aria-label="Leave workout mode">${icon('x', 18)}</a>
      <div class="grow center"><div class="eyebrow acc">${h(eyebrow)}</div><div class="small muted">${h(sub)}</div></div>
      <a class="round-btn" href="#/session" aria-label="All exercises">${icon('program', 18)}</a>
    </div>${bars}`;
}
function groupLabel(s, step) {
  const it = s.items[step.i]; const L = letterOf(it.groupCode);
  if (!L) return `EXERCISE · SET ${step.round} OF ${step.of}`;
  const kind = it.group?.kind === 'circuit' ? 'CIRCUIT' : it.group?.kind === 'list' ? 'ROUTINE' : `SUPERSET ${L}`;
  return step.group.idx.length > 1 ? `${kind} · ROUND ${step.round} OF ${step.of}` : `${kind} · SET ${step.round} OF ${step.of}`;
}
function viewGo() {
  const s = activeSession();
  if (!s) return { title: 'Workout', bare: true, html: `<div class="go"><div class="go-top"><a class="round-btn" href="#/today" aria-label="Back">${icon('back', 18)}</a></div>
    <div class="empty"><h2 class="display">No workout open</h2><p>Start one from Today.</p><a class="btn primary" href="#/today">Go to Today</a></div></div>` };
  const sub = s.programWeek ? `Week ${s.programWeek} · ${DAY_NAMES[s.programDay] || ''}` : s.name;
  const t = Timer.st;
  if (t && !t.done && t.ctx && t.ctx.sid === s.id && (t.kind === 'rest' || t.kind === 'work')) return goTimer(s, t, sub);
  if (!s.items.length) return { title: 'Workout', bare: true, html: `<div class="go" id="sessionView" data-sid="${s.id}">${goHeader(s, 'EMPTY WORKOUT', sub)}
    <div class="empty"><h2 class="display">Add your first exercise</h2><button class="primary big" data-act="add-ex">${icon('plus', 18)} Add exercise</button></div></div>` };
  const step = nextStep(s);
  if (!step) return goFinish(s, sub);
  return goSet(s, step, sub);
}
function goSet(s, step, sub) {
  const it = s.items[step.i];
  const { d } = draftFor(s, step.i);
  const past = pastSets(it.exName, s.id), best = bestOf(it.exName, s.id);
  const pastSame = past ? past[Math.min(it.sets.length, past.length - 1)] : null;
  // Other members of this group already done this round.
  const doneRows = step.group.idx.filter(j => j !== step.i && s.items[j].sets.length >= step.round && s.items[j].sets.length > 0).map(j => {
    const o = s.items[j]; const st = o.sets[step.round - 1] || o.sets[o.sets.length - 1];
    return `<div class="done-row">${thumb(o.demoAsset, o.label, 'mini')}<div class="grow"><b>${h((o.groupCode ? o.groupCode + ' ' : '') + o.label)}</b><div class="small">Done · ${h(setText(st))} ${isTimed(o) ? 'sec' : 'reps'}</div></div><span class="ok-dot">${icon('check', 14)}</span></div>`;
  }).join('');
  const timed = isTimed(it);
  // Preview what comes after this set.
  it.sets.push({ reps: 0, weight: 0 }); const after = nextStep(s); it.sets.pop();
  const rest = restAfter(s, step.i);
  const nameOf = x => `${x.groupCode ? x.groupCode + ' ' : ''}${x.label}`;
  let upNext;
  if (!after) upNext = 'That’s the last set. Then you’re done.';
  else {
    const nx = s.items[after.i]; const rd = after.group.idx.length > 1 && after.round > 1 && after.i !== step.i ? ` · round ${after.round}` : after.i === step.i ? ` · set ${after.round}` : '';
    upNext = rest > 0 ? `Up next: rest ${rest}s, then <b>${h(nameOf(nx))}${rd}</b>` : `Up next: <b>${h(nameOf(nx))}${rd}</b> · no rest`;
  }
  const demo = it.demoAsset
    ? `<div class="demo-card">${gifTag(it.demoAsset, it.label, 'demo-img')}${it.groupCode ? `<span class="code">${h(it.groupCode)}</span>` : ''}
        ${it.roadFrom ? `<div class="demo-note">${icon('truck', 16)}<span>Road mode swap for: ${h(it.roadFrom)}</span></div>` : ''}</div>`
    : `<div class="demo-card none">${it.groupCode ? `<span class="code">${h(it.groupCode)}</span>` : ''}${icon('lift', 40)}<span class="small muted">No demo for this one${it.roadFrom ? ` · Road mode swap for: ${h(it.roadFrom)}` : ''}</span></div>`;
  const howLib = libEx(it.exName);
  const notes = it.notes ? it.notes.split('\n')[0] : '';
  return { title: 'Workout', bare: true, html: `<div class="go" id="sessionView" data-sid="${s.id}">
    ${goHeader(s, groupLabel(s, step), sub)}
    ${doneRows}
    ${demo}
    <div>
      <h2 class="display lg">${h(it.label)}</h2>
      <div class="small muted">Target ${h(it.targetReps || (timed ? `${it.workSeconds}s` : '—'))}${notes ? ' · ' + h(notes) : ''}</div>
      ${howLib && howLib.instructions && !it.roadFrom ? `<details><summary>How to</summary><pre class="text small">${h(howLib.instructions)}</pre></details>` : ''}
    </div>
    ${(pastSame || best) ? `<div class="chips">${pastSame ? `<span class="pill blue">Last time: ${h(setText(pastSame))} ${timed ? 'sec' : 'reps'}</span>` : ''}${best ? `<span class="pill">Best: ${h(setText(best))}</span>` : ''}</div>` : ''}
    <div class="stepper" data-i="${step.i}">
      <button data-act="go-adj" data-k="reps" data-d="-1" aria-label="One less">${icon('minus', 26)}</button>
      <div class="center"><div class="big-num" id="goReps">${d.reps}</div><div class="eyebrow">${timed ? 'SECONDS' : 'REPS'}</div></div>
      <button data-act="go-adj" data-k="reps" data-d="1" aria-label="One more">${icon('plus', 26)}</button>
    </div>
    <div class="weight-row" data-i="${step.i}">
      <span class="small muted">Weight</span>
      <button class="sm icon" data-act="go-adj" data-k="weight" data-d="-5" aria-label="5 pounds less">${icon('minus', 16)}</button>
      <b id="goWeight">${d.weight ? d.weight + ' lb' : 'Bodyweight'}</b>
      <button class="sm icon" data-act="go-adj" data-k="weight" data-d="5" aria-label="5 pounds more">${icon('plus', 16)}</button>
      ${it.workSeconds ? `<button class="sm grow" data-act="go-work" data-i="${step.i}">${icon('play', 14)} Timer ${it.workSeconds}s</button>` : ''}
    </div>
    <button class="primary huge block" data-act="go-done" data-i="${step.i}">${icon('check', 24)} SET DONE</button>
    <div class="small muted center">${upNext}</div>
    <div class="go-actions">
      <button class="ghost sm" data-act="go-skip" data-i="${step.i}">${icon('skip', 16)} Skip exercise</button>
      <button class="ghost sm" data-act="go-swap" data-i="${step.i}">${icon('swap', 16)} Swap</button>
      <button class="ghost sm" data-act="add-ex">${icon('plus', 16)} Add</button>
    </div>
  </div>` };
}
function goTimer(s, t, sub) {
  const step = nextStep(s);
  const rem = Timer.remainingMs() / 1000;
  const nx = step ? s.items[step.i] : null;
  let summary = '';
  if (S.lastDone && S.lastDone.sid === s.id && s.items[S.lastDone.i]) {
    const gi = groupsOf(s).find(g => g.idx.includes(S.lastDone.i));
    summary = gi ? gi.idx.filter(j => s.items[j].sets.length).map(j => `${s.items[j].groupCode || ''} ${setText(s.items[j].sets[s.items[j].sets.length - 1])}`.trim()).join(' · ') : '';
  }
  let beat = '';
  if (nx) {
    const prevHere = nx.sets[nx.sets.length - 1];
    const past = pastSets(nx.exName, s.id); const pastSame = past ? past[Math.min(nx.sets.length, past.length - 1)] : null;
    beat = prevHere ? `Last round: ${setText(prevHere)} · beat it` : pastSame ? `Last time: ${setText(pastSame)}` : (nx.targetReps ? `Target ${nx.targetReps}` : '');
  }
  const isWork = t.kind === 'work';
  return { title: 'Workout', bare: true, html: `<div class="go" id="sessionView" data-sid="${s.id}">
    ${goHeader(s, isWork ? 'WORK' : (step ? 'REST' : 'LAST REST'), summary || sub)}
    <div class="ring-wrap">
      <svg class="ring" width="270" height="270" viewBox="0 0 270 270" aria-hidden="true">
        <circle cx="135" cy="135" r="118" fill="none" class="ring-bg" stroke-width="16"></circle>
        <circle id="ringArc" cx="135" cy="135" r="118" fill="none" class="ring-fg ${isWork ? 'work' : ''}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C * (1 - rem / Math.max(1, t.total))}"></circle>
      </svg>
      <div class="ring-txt"><div class="eyebrow" id="ringPhase">${t.paused ? 'PAUSED' : isWork ? 'WORK' : 'REST'}</div><div class="ring-clock" id="ringClock" role="timer">${fmtClock(Math.ceil(rem))}</div><div class="small muted" id="ringTotal">of ${fmtClock(t.total)}</div></div>
    </div>
    <div class="grid3">
      <button data-act="timer-adj" data-d="-15">−15s</button>
      <button data-act="timer-pause" id="ringPause">${t.paused ? 'Resume' : 'Pause'}</button>
      <button data-act="timer-adj" data-d="15">+15s</button>
    </div>
    <div class="card row voice">${icon('speaker', 22, 'blue')}<div class="grow small"><b>Spoken cues</b><div class="muted">“10 seconds… 3, 2, 1, go!”</div></div>${switchBtn('toggle-voice', !!S.settings.voiceCues, 'Spoken cues')}</div>
    ${nx && !isWork ? `<div class="card row next-card">${thumb(nx.demoAsset, nx.label, 'next-thumb')}<div class="grow"><div class="eyebrow acc">UP NEXT${step.group.idx.length > 1 ? ` · ROUND ${step.round} OF ${step.of}` : ` · SET ${step.round} OF ${step.of}`}</div>
      <div class="display sm">${h((nx.groupCode ? nx.groupCode + ' ' : '') + nx.label)}</div><div class="small muted">${h(beat)}</div></div></div>` : ''}
    <button class="primary huge block" data-act="go-skip-rest">${isWork ? 'DONE EARLY' : 'SKIP REST'} ${icon('arrowR', 22)}</button>
  </div>` };
}
function goFinish(s, sub) {
  const sets = s.items.reduce((a, it) => a + it.sets.length, 0);
  const reps = s.items.reduce((a, it) => a + it.sets.reduce((b, st) => b + (+st.reps || 0), 0), 0);
  const lastAt = Math.max(s.date, ...s.items.flatMap(it => it.sets.map(st => st.at || 0)));
  const mins = Math.max(1, Math.round((lastAt - s.date) / 60000));
  const prs = s.items.filter(it => it.sets.length).map(it => {
    const best = bestOf(it.exName, s.id); if (!best) return null;
    const top = it.sets.reduce((m, st) => (!m || (+st.weight || 0) > (+m.weight || 0) || ((+st.weight || 0) === (+m.weight || 0) && +st.reps > +m.reps)) ? st : m, null);
    const beat = (+top.weight || 0) > best.weight || ((+top.weight || 0) === best.weight && +top.reps > best.reps);
    return beat ? `<li>${icon('trophy', 16, 'acc')} <b>${h(it.label)}</b>: ${h(setText(top))} (was ${h(setText(best))})</li>` : null;
  }).filter(Boolean);
  return { title: 'Workout', bare: true, html: `<div class="go" id="sessionView" data-sid="${s.id}">
    ${goHeader(s, 'ALL SETS DONE', sub)}
    <div class="finish">
      <span class="finish-ic">${icon('check', 44)}</span>
      <h2 class="display xl">WORKOUT DONE</h2>
      <div class="stats"><div><b>${mins}</b><span>min</span></div><div><b>${sets}</b><span>sets</span></div><div><b>${reps}</b><span>reps</span></div></div>
      ${prs.length ? `<div class="card"><div class="eyebrow acc">NEW PERSONAL BESTS</div><ul class="plain">${prs.join('')}</ul></div>` : ''}
    </div>
    <label class="f">Notes<textarea data-sfield="notes" placeholder="How did it go?">${h(s.notes || '')}</textarea></label>
    <button class="primary huge block" data-act="finish">${icon('check', 22)} SAVE WORKOUT</button>
    <div class="go-actions"><button class="ghost sm" data-act="add-ex">${icon('plus', 16)} Add another exercise</button><a class="btn ghost sm" href="#/session">${icon('program', 16)} Review sets</a></div>
  </div>` };
}

/* ---------------- Session list view (full editor) ---------------- */
function viewSession(r) {
  const id = r.parts[1] ? +r.parts[1] : null;
  const s = id ? sessionById(id) : activeSession();
  if (!s) {
    if (id) return { title: 'Workout', html: `<div class="empty">That workout no longer exists.</div>` };
    return { title: 'Workout', html: `<div class="card"><h3>No workout open</h3>
      <p class="small muted">Start today's workout from the Today tab, or start an empty workout and add exercises.</p>
      <label class="f">Workout name (optional)<input id="newName" placeholder="Workout" autocomplete="off"></label>
      <div class="stack" style="margin-top:10px"><button class="primary block" data-act="start-empty">Start empty workout</button>
      <a class="btn block" href="#/today">Go to Today</a></div></div>` };
  }
  const items = s.items;
  let html = `<div class="card tight">
    <label class="f">Name<input data-sfield="name" value="${h(s.name)}"></label>
    <div class="small muted" style="margin-top:4px">${fmtDate(s.date)} · ${s.finished ? '<span class="badge ok">finished</span>' : '<span class="badge">in progress</span>'}</div>
    ${!s.finished ? `<a class="btn primary block" style="margin-top:10px" href="#/go">${icon('play', 16)} Back to workout mode</a>` : ''}
  </div>`;
  if (S.hint && !s.finished) html += `<div class="hint" id="hint"><span class="grow">${h(S.hint)}</span><button class="icon sm ghost" data-act="hint-x" aria-label="Dismiss">${icon('x', 16)}</button></div>`;
  if (!items.length) html += `<div class="empty">No exercises yet. Tap <b>Add exercise</b>.</div>`;
  let prevL = null;
  items.forEach((it, i) => {
    const ctx = itemContext(items, i);
    if (ctx.L && ctx.L !== prevL) {
      const gh = it.group ? groupHeaderText(it.group) : { kind: `Group ${ctx.L}`, sub: '' };
      html += `<div class="group-h">${h(gh.kind)} <span class="muted">${h(gh.sub)}</span></div>`;
    } else if (!ctx.L && prevL) html += `<div class="group-h">Other exercises</div>`;
    prevL = ctx.L;
    const lib = libEx(it.exName);
    const restChip = it.restAfterSeconds > 0 ? it.restAfterSeconds : (ctx.groupRest > 0 ? ctx.groupRest : DEFAULT_REST);
    const tgt = it.targetSets;
    const how = lib && lib.instructions ? `<pre class="text small">${h(lib.instructions)}</pre>` : '';
    html += `<div class="ex ${ctx.L ? 'in-group' : ''}" data-i="${i}">
      <div class="row top">${thumb(it.demoAsset, it.label)}<div class="grow"><div class="row">${it.groupCode ? `<span class="badge">${h(it.groupCode)}</span>` : ''}<span class="ex-title grow">${h(it.label)}</span>
        <span class="small muted setcount">${it.sets.length}${tgt ? '/' + tgt : ''}</span></div>
      <div class="target">${h(targetLine(it, ctx))}</div>
      ${it.roadFrom ? `<div class="small road-note">${icon('truck', 14)} Road mode swap for: ${h(it.roadFrom)}</div>` : ''}
      ${it.notes ? `<pre class="text small muted">${h(it.notes)}</pre>` : ''}</div></div>
      ${it.demoAsset ? `<details><summary>Demo${it.demoNote ? ' · ' + h(it.demoNote) : ''}</summary>${gifTag(it.demoAsset, it.label)}${how}</details>`
        : how ? `<details><summary>How to</summary>${how}</details>` : ''}
      <div class="row" style="margin-top:6px">
        <button class="sm" data-act="t-rest" data-s="${restChip}">${icon('clock', 15)} Rest ${restChip}s</button>
        ${it.workSeconds ? `<button class="sm" data-act="t-work" data-s="${it.workSeconds}" data-l="${h(it.label)}">${icon('play', 14)} Work ${it.workSeconds}s</button>` : ''}
      </div>
      ${it.sets.length ? `<div class="sethead"><span>#</span><span>Reps / sec</span><span>lb</span><span>RPE</span><span></span></div>` : ''}
      ${it.sets.map((st, k) => `<div class="setrow"><b style="text-align:center">${k + 1}</b>
        <input inputmode="numeric" data-set="${k}" data-k="reps" value="${h(st.reps)}" aria-label="reps">
        <input inputmode="decimal" data-set="${k}" data-k="weight" value="${h(st.weight || '')}" placeholder="BW" aria-label="weight">
        <input inputmode="decimal" data-set="${k}" data-k="rpe" value="${h(st.rpe ?? '')}" aria-label="RPE">
        <button class="icon sm ghost" data-act="del-set" data-set="${k}" aria-label="Delete set">${icon('x', 16)}</button></div>`).join('')}
      <button class="block" style="margin-top:8px" data-act="log-set">${icon('plus', 16)} ${tgt ? (it.sets.length >= tgt ? `Log extra set ${it.sets.length + 1}` : `Log set ${it.sets.length + 1} of ${tgt}`) : 'Add set'}</button>
      <details style="margin-top:4px" class="itemmenu"><summary>Edit / swap / move / remove</summary>
        <div class="actions">
          <button data-act="swap">${icon('swap', 16)} Swap</button><button data-act="edit">${icon('edit', 16)} Edit</button>
          <button data-act="move" data-d="-1" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)} Up</button><button data-act="move" data-d="1" ${i === items.length - 1 ? 'disabled' : ''}>${icon('down', 16)} Down</button>
          <button class="danger" data-act="remove">${icon('trash', 16)} Remove</button>
        </div></details>
    </div>`;
  });
  html += `<label class="f">Session notes<textarea data-sfield="notes" placeholder="How did it go?">${h(s.notes || '')}</textarea></label>
    <div class="stack" style="margin-top:12px">
      <button class="block" data-act="add-ex">${icon('plus', 16)} Add exercise</button>
      ${s.finished ? `<a class="btn block" href="#/history">${icon('back', 16)} Back to History</a>` : `<button class="primary block" data-act="finish">${icon('check', 16)} Finish workout</button>`}
      <button class="danger block" data-act="del-session">Delete this workout</button>
    </div>`;
  return { title: s.finished ? 'Workout (history)' : 'All exercises', html: `<div id="sessionView" data-sid="${s.id}">${html}</div>` };
}
function currentSession() { const el = $('#sessionView'); return el ? sessionById(+el.dataset.sid) : null; }

async function pickExercise(title) {
  const list = S.library;
  const html = `<h3>${h(title)}</h3><input id="pickSearch" type="search" placeholder="Search exercises" autocomplete="off">
    <div id="pickList" style="margin-top:8px">${list.map((e, i) => `<button class="listitem block" style="justify-content:flex-start" data-act="modal-val" data-v="${i}" data-name="${h(e.name.toLowerCase() + ' ' + e.muscleGroup.toLowerCase())}">
      ${thumb(e.demoAsset, '')}
      <span class="grow" style="text-align:left"><span class="t">${h(e.name)}</span><br><span class="small muted">${h(e.muscleGroup)}</span></span></button>`).join('')}</div>
    <details style="margin-top:8px"><summary>Create a custom exercise</summary>
      <label class="f">Name<input id="customName"></label><label class="f">Muscle group<input id="customMuscle" placeholder="Custom"></label>
      <button class="block" style="margin-top:8px" data-act="custom-create">Create &amp; use</button></details>
    <div class="btns"><button data-act="modal-val" data-v="">Cancel</button></div>`;
  const v = await modal(html, m => {
    const inp = $('#pickSearch', m);
    inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); $$('#pickList [data-name]', m).forEach(b => b.classList.toggle('hidden', !!q && !b.dataset.name.includes(q))); });
  });
  if (v === '' || v == null) return null;
  if (typeof v === 'object') return v;
  return list[+v];
}
async function editItemDialog(it) {
  const v = await modal(`<h3>Edit ${h((it.groupCode + ' ' + it.label).trim())}</h3>
    <label class="f">Name shown<input id="e_label" value="${h(it.label)}"></label>
    <label class="f">Group code (e.g. A1; blank = not in a superset)<input id="e_code" value="${h(it.groupCode)}" autocapitalize="characters"></label>
    <label class="f">Target sets / rounds<input id="e_sets" inputmode="numeric" value="${h(it.targetSets ?? '')}"></label>
    <label class="f">Target reps (e.g. 15-20, 45 sec)<input id="e_reps" value="${h(it.targetReps)}"></label>
    <label class="f">Rest after a set (seconds, 0 = none, blank = not set)<input id="e_rest" inputmode="numeric" value="${h(it.restAfterSeconds ?? '')}"></label>
    <label class="f">Work timer (seconds, blank = none)<input id="e_work" inputmode="numeric" value="${h(it.workSeconds ?? '')}"></label>
    <label class="f">Notes<textarea id="e_notes">${h(it.notes)}</textarea></label>
    <div class="btns"><button class="primary" data-act="edit-save">Save</button><button data-act="modal-val" data-v="">Cancel</button></div>`);
  return v && typeof v === 'object' ? v : null;
}

/* ---------------- Exercises tab ---------------- */
function viewExercises() {
  const present = new Set(S.library.map(e => e.muscleGroup));
  const groups = [...MUSCLE_ORDER.filter(g => present.has(g)), ...Array.from(present).filter(g => !MUSCLE_ORDER.includes(g)).sort()];
  const count = g => S.library.filter(e => e.muscleGroup === g).length;
  const act = activeSession();
  return { title: 'Exercises', html: `
    <div class="sticky-search"><input id="exSearch" type="search" placeholder="Search by name or muscle group" autocomplete="off">
    <div class="chips scroll" style="margin-top:8px" id="exChips"><button class="chip on" data-act="ex-filter" data-g="">All ${S.library.length}</button>${groups.map(g => `<button class="chip" data-act="ex-filter" data-g="${h(g)}">${h(g)} ${count(g)}</button>`).join('')}</div></div>
    <div class="small muted" id="addingTo" style="margin:0 4px 8px">${act ? `Adding to: <b>${h(act.name)}</b> · <a href="#/go">open workout (${act.items.length})</a>` : 'Tap ＋ to start a workout with that exercise.'}</div>
    <div id="exList">${S.library.map((e, i) => `<div class="ex lib-ex" data-name="${h(e.name.toLowerCase())}" data-g="${h(e.muscleGroup)}">
      <div class="row">${thumb(e.demoAsset, e.name)}
        <div class="grow"><div class="ex-title">${h(e.name)}</div><div class="small muted">${h(e.muscleGroup)}${e.equipment ? ' · ' + h(e.equipment) : ''}${e.inProgram ? ' · in the program' : ''}</div></div>
        <button class="icon primary" data-act="ex-add" data-i="${i}" aria-label="Add ${h(e.name)} to workout">${icon('plus', 20)}</button></div>
      ${e.demoAsset || e.instructions ? `<details><summary>${e.demoAsset ? 'Demo &amp; how-to' : 'How to'}</summary>${gifTag(e.demoAsset, e.name)}<pre class="text small">${h(e.instructions)}</pre></details>` : ''}
    </div>`).join('')}</div>`,
    after() {
      const inp = $('#exSearch');
      const apply = () => {
        const q = inp.value.trim().toLowerCase(); const g = $('#exChips .on')?.dataset.g || '';
        $$('#exList > .ex').forEach(el => el.classList.toggle('hidden', !!(q && !(el.dataset.name.includes(q) || el.dataset.g.toLowerCase().includes(q))) || !!(g && el.dataset.g !== g)));
      };
      inp.addEventListener('input', apply); viewExercises.apply = apply;
    } };
}

/* ---------------- Interval cardio ---------------- */
function computedMinutes(f) {
  const w = intOrNull(f.warmupMinutes) || 0, r = intOrNull(f.rounds); if (r == null) return null;
  const work = intOrNull(f.workSeconds) || 0, rest = intOrNull(f.restSeconds) || 0, c = intOrNull(f.cooldownMinutes) || 0;
  return w + c + Math.ceil(r * (work + rest) / 60);
}
function warmupDefault(txt) {
  const m = /^(\d+)\s*-\s*(\d+)/.exec(txt || ''); if (m) return String(Math.round((+m[1] + +m[2]) / 2));
  return String(leadingInt(txt) ?? 5);
}
function draftForInterval(q) {
  const id = q.id ? +q.id : null;
  const key = id ? 'id:' + id : `new:${q.w || ''}:${q.d || ''}`;
  if (S.intervalDraft && S.intervalDraft.key === key) return S.intervalDraft;
  let f;
  const ex = id ? S.intervals.find(i => i.id === id) : null;
  const str = v => v == null ? '' : String(v);
  if (ex) f = { key, id: ex.id, uid: ex.uid, date: ex.date, week: ex.programWeek, day: ex.programDay, activity: ex.activity || '', warmupMinutes: str(ex.warmupMinutes), rounds: str(ex.rounds), workSeconds: str(ex.workSeconds), restSeconds: str(ex.restSeconds), cooldownMinutes: str(ex.cooldownMinutes), durationMinutes: str(ex.durationMinutes), notes: ex.notes || '', done: !!ex.done };
  else {
    const wk = q.w ? +q.w : null; const p = wk ? weekOf(wk)?.interval : null;
    f = { key, id: null, uid: uid(), date: Date.now(), week: wk, day: q.d || null, activity: '', warmupMinutes: p ? warmupDefault(p.warmupMinutes) : '5',
      rounds: String(p ? p.rounds : 3), workSeconds: String(p ? p.highSeconds : 60), restSeconds: String(p ? p.moderateSeconds : 120), cooldownMinutes: String(p ? p.cooldownMinutes : 5),
      durationMinutes: p ? String(p.totalMinutes) : '', notes: '', done: true };
  }
  S.intervalDraft = f; DB.kvSet('intervalDraft', f); return f;
}
function intervalPhases(f) {
  const r = Math.min(50, Math.max(1, intOrNull(f.rounds) || 1)), work = intOrNull(f.workSeconds) ?? 60, rest = intOrNull(f.restSeconds) ?? 120;
  const ph = []; const wu = intOrNull(f.warmupMinutes) || 0; if (wu > 0) ph.push({ label: 'Warm up', seconds: wu * 60 });
  for (let i = 1; i <= r; i++) { if (work > 0) ph.push({ label: `High intensity — round ${i} of ${r}`, seconds: work }); if (rest > 0) ph.push({ label: `Moderate — round ${i} of ${r}`, seconds: rest }); }
  const cd = intOrNull(f.cooldownMinutes) || 0; if (cd > 0) ph.push({ label: 'Cool down', seconds: cd * 60 });
  return ph;
}
function toLocalInput(ms) { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function viewInterval(r) {
  const f = draftForInterval(r.q);
  const w = f.week ? weekOf(f.week) : null, p = w?.interval;
  const running = Timer.st && Timer.st.kind === 'interval' && Timer.st.ctx?.draftKey === f.key;
  const fld = (k, label, mode = 'numeric') => `<label class="f">${label}<input data-ifield="${k}" inputmode="${mode}" value="${h(f[k])}"></label>`;
  const cm = computedMinutes(f);
  const weekOpts = `<option value="">— none —</option>` + S.program.weeks.map(x => `<option value="${x.week}" ${f.week === x.week ? 'selected' : ''}>Week ${x.week}</option>`).join('');
  const dayOpts = `<option value="">— none —</option>` + Object.keys(DAY_NAMES).map(d => `<option value="${d}" ${f.day === d ? 'selected' : ''}>${DAY_NAMES[d]}</option>`).join('');
  return { title: f.id ? 'Edit cardio' : 'Interval cardio', html: `
    <div class="card" id="intervalView"><h3 class="display md">${w ? `Week ${w.week}${f.day ? ' · ' + DAY_NAMES[f.day] : ''}` : 'Interval training'}</h3>
      ${p ? `<p class="target small">${p.rounds} rounds × (${p.highSeconds}s hard + ${p.moderateSeconds}s easy) · warm up ${h(p.warmupMinutes)} min · cool down ${p.cooldownMinutes} min ≈ ${p.totalMinutes} min</p>` : ''}
      <details><summary>The rules</summary><p class="small">${h(S.program.intervalRules)}</p></details>
      ${running ? `<p class="small">The timer is running (see the timer card below). It keeps the right time if you switch apps, but an iPhone can't alert you while the app is closed or the screen is locked.</p>`
        : `<button class="primary big block" data-act="interval-start">${icon('play', 18)} START GUIDED TIMER</button><div class="small muted center" style="margin-top:6px">${intervalPhases(f).length} phases · spoken cues ${S.settings.voiceCues ? 'on' : 'off'}</div>`}
    </div>
    <div class="card">
      <label class="f">Date &amp; time<input type="datetime-local" data-ifield="date" value="${h(toLocalInput(f.date))}"></label>
      <div class="row"><div class="grow"><label class="f">Program week<select data-ifield="week">${weekOpts}</select></label></div><div class="grow"><label class="f">Day<select data-ifield="day">${dayOpts}</select></label></div></div>
      <label class="f">Activity (run, bike, jump rope…)<input data-ifield="activity" inputmode="text" value="${h(f.activity)}" placeholder="Run / sprint"></label>
      <div class="row"><div class="grow">${fld('warmupMinutes', 'Warm-up (min)')}</div><div class="grow">${fld('rounds', 'Rounds')}</div></div>
      <div class="row"><div class="grow">${fld('workSeconds', 'Hard (sec)')}</div><div class="grow">${fld('restSeconds', 'Easy (sec)')}</div></div>
      <div class="row"><div class="grow">${fld('cooldownMinutes', 'Cool-down (min)')}</div><div class="grow">${fld('durationMinutes', 'Total (min)')}</div></div>
      ${cm != null ? `<div class="small muted">Calculated: about ${cm} min</div>` : ''}
      <label class="f">Notes<textarea data-ifield="notes">${h(f.notes)}</textarea></label>
      <label class="check"><input type="checkbox" data-ifield="done" ${f.done ? 'checked' : ''}> Done (uncheck to log it as skipped / partial)</label>
      <div class="stack"><button class="primary block" data-act="interval-save">Save cardio session</button>
      <button class="block" data-act="interval-cancel">Cancel</button>
      ${f.id ? '<button class="danger block" data-act="interval-del">Delete this entry</button>' : ''}</div>
    </div>` };
}

/* ---------------- History ---------------- */
function intervalListItem(i) {
  const tag = i.programWeek ? `Week ${i.programWeek}${i.programDay ? ' · ' + dayShort(i.programDay) : ''}` : '';
  const bits = [i.activity, i.rounds != null ? i.rounds + ' rounds' : '', i.workSeconds != null ? `${i.workSeconds}s/${i.restSeconds ?? '?'}s` : '', i.durationMinutes != null ? i.durationMinutes + ' min' : ''].filter(Boolean).map(h).join(' · ');
  return `<a class="listitem hist-interval" href="#/interval?id=${i.id}"><span class="li-ic blue">${icon('cardio', 22)}</span><span class="grow"><span class="t">Interval cardio${tag ? ' · ' + h(tag) : ''}</span><br>
    <span class="small muted">${fmtDate(i.date)}${bits ? ' · ' + bits : ''}${i.done ? '' : ' · <b>not done</b>'}</span></span><span class="muted">›</span></a>`;
}
function sessionListItem(s) {
  const sets = s.items.reduce((a, it) => a + it.sets.length, 0);
  const ex = s.items.filter(it => it.sets.length).length;
  return `<a class="listitem hist-session" href="${s.finished ? `#/session/${s.id}` : '#/go'}"><span class="li-ic acc">${icon('lift', 22)}</span><span class="grow"><span class="t">${h(s.name)}</span><br>
    <span class="small muted">${fmtDate(s.date)} · ${ex}/${s.items.length} exercises · ${sets} sets${s.finished ? '' : ' · <b>in progress</b>'}</span></span><span class="muted">›</span></a>`;
}
function viewHistory(r) {
  const f = r.q.f || 'all';
  const all = [...(f !== 'cardio' ? S.sessions.map(s => ({ t: 's', date: s.date, o: s })) : []), ...(f !== 'workouts' ? S.intervals.map(i => ({ t: 'i', date: i.date, o: i })) : [])].sort((a, b) => b.date - a.date);
  return { title: 'History', html: `
    <div class="chips" style="margin-bottom:10px">${[['all', 'All'], ['workouts', 'Workouts'], ['cardio', 'Cardio']].map(([k, l]) => `<a class="btn chip ${f === k ? 'on' : ''}" href="#/history?f=${k}">${l}</a>`).join('')}
      <button class="chip" data-act="open-interval" data-w="${currentWeek()}" data-d="">${icon('plus', 14)} Log cardio</button></div>
    <div id="histList">${all.length ? all.map(x => x.t === 's' ? sessionListItem(x.o) : intervalListItem(x.o)).join('') : '<div class="empty">Nothing logged yet. Finished workouts and interval cardio show up here.</div>'}</div>
    <p class="small muted pad">Tip: back up your log now and then from More → Backup.</p>` };
}

/* ---------------- More / backup ---------------- */
function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function isStandalone() { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; }
function buildBackup() {
  const data = { app: 'workout-pwa', schema: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), sessions: S.sessions, intervals: S.intervals, customExercises: S.custom, settings: S.settings };
  const stamp = new Date().toISOString().slice(0, 10);
  S.backup = { json: JSON.stringify(data, null, 1), name: `workout-backup-${stamp}.json`, csv: buildCsv(), csvName: `workout-log-${stamp}.csv` };
  return S.backup;
}
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function buildCsv() {
  const rows = [['type', 'date', 'session', 'week', 'day', 'code', 'exercise', 'set', 'reps', 'weight_lb', 'rpe', 'activity', 'rounds', 'work_s', 'rest_s', 'duration_min', 'done', 'notes']];
  S.sessions.slice().sort((a, b) => a.date - b.date).forEach(s => s.items.forEach(it => it.sets.forEach((st, k) =>
    rows.push(['set', new Date(st.at || s.date).toISOString(), s.name, s.programWeek ?? '', s.programDay ?? '', it.groupCode, it.label, k + 1, st.reps, st.weight, st.rpe ?? '', '', '', '', '', '', s.finished, '']))));
  S.intervals.slice().sort((a, b) => a.date - b.date).forEach(i =>
    rows.push(['interval', new Date(i.date).toISOString(), '', i.programWeek ?? '', i.programDay ?? '', '', '', '', '', '', '', i.activity, i.rounds ?? '', i.workSeconds ?? '', i.restSeconds ?? '', i.durationMinutes ?? '', i.done, i.notes]));
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
function download(text, name, type) {
  const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
/** Share sheet with a file (iOS: Save to Files / AirDrop / Mail). Resolves true if the sheet handled it. */
function shareFile(text, name, type) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(() => true).catch(e => !!(e && e.name === 'AbortError'));
    }
  } catch (e) { /* fall through */ }
  return Promise.resolve(false);
}
async function importBackup(text) {
  let data; try { data = JSON.parse(text); } catch (e) { toast('That file is not valid JSON.'); return; }
  if (!data || data.app !== 'workout-pwa' || !Array.isArray(data.sessions) || !Array.isArray(data.intervals)) { toast('Not a Workout backup file.'); return; }
  const v = await choose('Restore backup', `File from ${h(data.exportedAt || 'unknown date')}: ${data.sessions.length} workouts, ${data.intervals.length} interval entries.<br><br><b>Merge</b> adds entries you don't already have. <b>Replace</b> deletes everything on this phone first.`,
    [{ v: 'merge', label: 'Merge into my log', cls: 'primary' }, { v: 'replace', label: 'Replace my log', cls: 'danger' }, { v: '', label: 'Cancel' }]);
  if (!v) return;
  if (v === 'replace' && !(await confirmBox('Replace everything?', 'All workouts and cardio entries on this phone will be replaced by the backup. This cannot be undone.', 'Replace', true))) return;
  let added = 0, skipped = 0;
  if (v === 'replace') { await DB.clear('sessions'); await DB.clear('intervals'); await DB.clear('exercises'); await refresh(); }
  const have = { sessions: new Set(S.sessions.map(x => x.uid)), intervals: new Set(S.intervals.map(x => x.uid)), exercises: new Set(S.custom.map(x => (x.name || '').toLowerCase())) };
  for (const s of data.sessions) {
    if (s.uid && have.sessions.has(s.uid)) { skipped++; continue; }
    const c = { ...s, uid: s.uid || uid(), items: Array.isArray(s.items) ? s.items : [] }; delete c.id; await DB.put('sessions', c); added++;
  }
  for (const i of data.intervals) {
    if (i.uid && have.intervals.has(i.uid)) { skipped++; continue; }
    const c = { ...i, uid: i.uid || uid() }; delete c.id; await DB.put('intervals', c); added++;
  }
  for (const e of (data.customExercises || [])) { if (!e.name || have.exercises.has(e.name.toLowerCase())) continue; const c = { ...e }; delete c.id; await DB.put('exercises', c); }
  await refresh(); buildBackup();
  toast(`Restored: ${added} added${skipped ? ', ' + skipped + ' already there' : ''}.`, 3500); render();
}
function viewMore() {
  const nSets = S.sessions.reduce((a, s) => a + s.items.reduce((b, it) => b + it.sets.length, 0), 0);
  const weekOpts = S.program.weeks.map(x => `<option value="${x.week}" ${currentWeek() === x.week ? 'selected' : ''}>Week ${x.week}</option>`).join('');
  return { title: 'More', html: `
    <div class="card"><h3>Settings</h3>
      <label class="f">Current program week<select data-setting="currentWeek">${weekOpts}</select></label>
      <div class="set-row">${icon('truck', 20, 'blue')}<div class="grow"><b>Road mode</b><div class="small muted">Swap moves that need a ball, pull-up bar, rope or bench for band and bodyweight versions.</div></div>${switchBtn('toggle-road', !!S.settings.roadMode, 'Road mode')}</div>
      <div class="set-row">${icon('speaker', 20, 'blue')}<div class="grow"><b>Spoken cues</b><div class="small muted">Counts down rest out loud and calls the next move.</div></div>${switchBtn('toggle-voice', !!S.settings.voiceCues, 'Spoken cues')}</div>
      <label class="f">Theme<select data-setting="theme"><option value="auto" ${S.settings.theme === 'auto' ? 'selected' : ''}>Match phone</option><option value="dark" ${S.settings.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${S.settings.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
      <label class="check"><input type="checkbox" data-setting="keepAwake" ${S.settings.keepAwake ? 'checked' : ''}> Keep the screen on while a timer runs ${'wakeLock' in navigator ? '' : '<span class="small muted">(not supported here)</span>'}</label>
      <div class="row gap" style="margin-top:8px"><button class="grow sm" data-act="sound-test">Test sound</button><button class="grow sm" data-act="voice-test">Test voice</button></div>
      <div class="small muted" style="margin-top:8px">Storage: ${S.persisted === true ? 'persistent ✓' : S.persisted === false ? 'best-effort (add to Home Screen to keep data safe)' : 'unknown'} · ${isStandalone() ? 'running from Home Screen ✓' : 'running in the browser'}</div>
    </div>
    <div class="card"><h3>Backup &amp; restore</h3>
      <p class="small muted" id="stats">${S.sessions.length} workouts · ${S.intervals.length} cardio entries · ${nSets} sets. Your log is stored only on this phone, so save a backup now and then.</p>
      <div class="stack"><button class="primary block" data-act="export-share">${icon('share', 18)} Share / save backup</button>
      <button class="block" data-act="export-dl">Download backup (JSON)</button>
      <button class="block" data-act="export-csv">Export CSV (spreadsheet)</button>
      <label class="btn block" for="importFile">Restore from backup…</label><input id="importFile" type="file" accept="application/json,.json" class="hidden"></div>
    </div>
    <div class="card"><h3>Reading</h3>
      ${(S.workouts.articles || []).map(a => `<a class="listitem" href="#/article/${h(a.id)}">${icon('book', 20)}<span class="grow t">${h(a.title)}</span><span class="muted">›</span></a>`).join('')}
      <a class="listitem" href="#/photos">${icon('book', 20)}<span class="grow t">Journal photos</span><span class="muted">›</span></a>
    </div>
    <div class="card"><h3>Install on iPhone</h3>
      <ol class="small tight"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Workout</b> from the Home Screen. It works offline after that.</li></ol>
      <p class="small muted">On Android, open it in Chrome and choose <b>Install app</b> from the ⋮ menu.</p>
    </div>
    <p class="small muted pad">Six Pack Workout ${APP_VERSION} · ${h(S.program.name)} (iwantsixpackabs.com, 2007).</p>`,
    after() { buildBackup(); } };
}
function viewArticle(r) {
  const a = (S.workouts.articles || []).find(x => x.id === r.parts[1]);
  if (!a) return { title: 'Article', html: '<div class="empty">Not found.</div>' };
  return { title: a.title, html: `<div class="card"><h3>${h(a.title)}</h3><pre class="text small">${h(a.text)}</pre></div><a class="btn block" href="#/more">${icon('back', 16)} Back</a>` };
}
function viewPhotos() {
  const imgs = ['front_fat.jpg', 'back.jpg', 'six_pack_abs_week_9_front.jpg', 'six_pack_abs_week_9_back.jpg', 'fitness_backpack1.jpg', 'fitness_backpack_2.jpg'];
  return { title: 'Journal photos', html: `<div class="card">${imgs.map(p => `<img class="photo" src="journal_images/${p}" alt="${h(p)}" loading="lazy"><div class="small muted">${h(p.replace(/\.jpg$/, '').replace(/_/g, ' '))}</div>`).join('')}</div><a class="btn block" href="#/more">${icon('back', 16)} Back</a>` };
}

/* ---------------- Theme / banners ---------------- */
function applyTheme() {
  const t = S.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : S.settings.theme;
  document.documentElement.dataset.theme = t;
  $('#themeColor').setAttribute('content', t === 'light' ? '#f4f5f7' : '#0e1012');
}
function showUpdate(reg) {
  showUpdate.reg = reg; if ($('#upd')) return;
  $('#banner').insertAdjacentHTML('beforeend', `<div class="banner" id="upd"><span class="grow small"><b>Update ready.</b> Reload to get the newest version.</span><button class="sm primary" data-act="sw-reload">Reload</button></div>`);
}
function updateOnline() { $('#offlineBadge').hidden = navigator.onLine; }

/* ---------------- Events ---------------- */
document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act;
  const exEl = b.closest('.ex[data-i]'); const idx = exEl ? +exEl.dataset.i : -1;
  const s = currentSession();
  switch (act) {
    case 'modal-val': closeModal(b.dataset.v); break;
    case 'goto': go(b.dataset.h); break;
    case 'today-pick': S.todayPick = b.dataset.d; render(); break;
    case 'change-week': {
      const cw = currentWeek();
      const v = await modal(`<h3>Which week are you on?</h3><div class="weekgrid">${S.program.weeks.map(x => `<button class="${x.week === cw ? 'on' : ''}" data-act="modal-val" data-v="${x.week}">Wk ${x.week}<small>${x.format === 'circuit' ? 'circuit' : x.format === 'spartan300' ? '300' : 'superset'}</small></button>`).join('')}</div><div class="btns"><button data-act="modal-val" data-v="">Cancel</button></div>`);
      if (v) { S.settings.currentWeek = +v; S.settings.week = +v; await saveSettings(); render(); }
      break;
    }
    case 'set-week': S.settings.currentWeek = +b.dataset.w; S.settings.week = +b.dataset.w; await saveSettings(); toast(`You're on Week ${b.dataset.w}`); render(); break;
    case 'toggle-road': S.settings.roadMode = !S.settings.roadMode; await saveSettings(); toast(S.settings.roadMode ? 'Road mode on: new workouts use cab-friendly moves' : 'Road mode off'); render(); break;
    case 'toggle-voice': S.settings.voiceCues = !S.settings.voiceCues; await saveSettings(); if (S.settings.voiceCues) speak('Spoken cues on'); render(); break;
    case 'start-today': await startProgram(+b.dataset.w, b.dataset.d); break;
    case 'start-empty-quick': { await startEmpty('Workout'); S.goDraft = {}; go('#/go'); break; }
    case 'pick-week': S.settings.week = +b.dataset.w; saveSettings(); go('#/program'); break;
    case 'pick-day': S.settings.day = b.dataset.d; saveSettings(); go('#/program'); break;
    case 'start-program': await startProgram(+b.dataset.w, b.dataset.d); break;
    case 'open-interval': go(`#/interval?w=${b.dataset.w || ''}&d=${b.dataset.d || ''}`); break;
    case 'start-empty': await startEmpty($('#newName')?.value); S.hint = null; go('#/go'); break;
    case 'hint-x': S.hint = null; $('#hint')?.remove(); break;
    case 't-rest': S.hint = null; $('#hint')?.remove(); Timer.start(+b.dataset.s, 'Rest'); break;
    case 't-work': Timer.start(+b.dataset.s, 'Work — ' + b.dataset.l, 'work'); break;
    case 'timer-adj': Timer.adjust(+b.dataset.d); break;
    case 'timer-pause': Timer.togglePause(); break;
    case 'timer-skip': Timer.skip(); break;
    case 'timer-clear': Timer.clear(); if (route().name === 'interval') render(); break;
    /* --- workout mode --- */
    case 'go-adj': {
      const i = +b.closest('[data-i]').dataset.i; const { d } = draftFor(s, i);
      if (b.dataset.k === 'reps') { d.reps = Math.max(0, (+d.reps || 0) + +b.dataset.d); $('#goReps').textContent = d.reps; }
      else { d.weight = Math.max(0, (+d.weight || 0) + +b.dataset.d); $('#goWeight').textContent = d.weight ? d.weight + ' lb' : 'Bodyweight'; }
      break;
    }
    case 'go-done': {
      const i = +b.dataset.i; const it = s.items[i]; const { k, d } = draftFor(s, i);
      it.sets.push({ reps: +d.reps || 0, weight: +d.weight || 0, rpe: null, at: Date.now() });
      delete S.goDraft[k]; S.lastDone = { sid: s.id, i };
      if (Timer.st && Timer.st.kind !== 'interval') { Timer.st = null; DB.kvSet('timer', null); Timer.stopLoop(); }
      await saveSession(s);
      const nx = nextStep(s); const rest = restAfter(s, i);
      if (nx && rest > 0) {
        const n2 = s.items[nx.i];
        Timer.start(rest, 'Rest', 'rest', { sid: s.id, nextName: n2.label });
      } else if (nx) {
        const n2 = s.items[nx.i];
        if (nx.i !== i) { toast(`No rest: go to ${n2.groupCode ? n2.groupCode + ' ' : ''}${n2.label}`); speak(`Next: ${n2.label}`); }
      }
      window.scrollTo(0, 0); render(); break;
    }
    case 'go-work': { const it = s.items[+b.dataset.i]; Timer.start(it.workSeconds, 'Work — ' + it.label, 'work', { sid: s.id, nextName: '' }); render(); break; }
    case 'go-skip-rest': Timer.clear(); window.scrollTo(0, 0); render(); break;
    case 'go-skip': {
      const it = s.items[+b.dataset.i]; s.skipped = Array.from(new Set([...(s.skipped || []), it.uid]));
      await saveSession(s); toast(`Skipped ${it.label}`); render(); break;
    }
    case 'go-swap': {
      const it = s.items[+b.dataset.i]; const ex = await pickExercise(`Swap ${it.label} for…`); if (!ex) break;
      const old = it.label;
      Object.assign(it, { exName: ex.name, label: ex.name, demoAsset: ex.demoAsset || null, demoNote: '', roadFrom: undefined, notes: [`Swapped in for: ${old}`].join('\n') });
      await saveSession(s); render(); toast('Swapped'); break;
    }
    /* --- list view --- */
    case 'log-set': {
      const it = s.items[idx]; const last = it.sets[it.sets.length - 1];
      it.sets.push({ reps: last ? last.reps : (leadingInt(it.targetReps) ?? 8), weight: last ? last.weight : 0, rpe: last ? last.rpe ?? null : null, at: Date.now() });
      if (!s.finished) afterSetHint(s, idx);
      await saveSession(s); render(); break;
    }
    case 'del-set': { s.items[idx].sets.splice(+b.dataset.set, 1); await saveSession(s); render(); break; }
    case 'move': {
      const j = idx + +b.dataset.d; if (j < 0 || j >= s.items.length) break;
      [s.items[idx], s.items[j]] = [s.items[j], s.items[idx]]; await saveSession(s); render(); break;
    }
    case 'remove': {
      const it = s.items[idx];
      if (it.sets.length && !(await confirmBox(`Remove ${it.label}?`, `This also deletes the ${it.sets.length} set(s) already logged for it in this session.`, 'Remove', true))) break;
      s.items.splice(idx, 1); await saveSession(s); render(); toast('Removed'); break;
    }
    case 'swap': {
      const it = s.items[idx]; const ex = await pickExercise(`Swap ${it.label} for…`); if (!ex) break;
      const old = it.label;
      Object.assign(it, { exName: ex.name, label: ex.name, demoAsset: ex.demoAsset || null, demoNote: '', roadFrom: undefined, notes: [it.notes, `Swapped in for: ${old}`].filter(Boolean).join('\n') });
      await saveSession(s); render(); toast('Swapped'); break;
    }
    case 'edit': {
      const it = s.items[idx]; const v = await editItemDialog(it); if (!v) break;
      Object.assign(it, v); await saveSession(s); render(); break;
    }
    case 'edit-save': {
      const sets = intOrNull($('#e_sets').value), rest = intOrNull($('#e_rest').value), work = intOrNull($('#e_work').value);
      closeModal({ label: $('#e_label').value.trim() || 'Exercise', groupCode: $('#e_code').value.trim().toUpperCase().slice(0, 6),
        targetSets: sets && sets > 0 ? Math.min(sets, 99) : null, targetReps: $('#e_reps').value.trim().slice(0, 60),
        restAfterSeconds: rest != null ? Math.max(0, rest) : null, workSeconds: work > 0 ? work : null, notes: $('#e_notes').value });
      break;
    }
    case 'custom-create': {
      const name = $('#customName').value.trim(); if (!name) { toast('Enter a name'); break; }
      if (!libEx(name)) { await DB.put('exercises', { name, muscleGroup: $('#customMuscle').value.trim() || 'Custom', equipment: '', instructions: '' }); await refresh(); }
      closeModal(libEx(name)); break;
    }
    case 'add-ex': {
      const ex = await pickExercise('Add exercise'); if (!ex) break;
      const cur = currentSession() || activeSession(); if (!cur) break;
      cur.items.push(newItemFromLib(ex)); await saveSession(cur); render(); toast(`Added ${ex.name}`); break;
    }
    case 'ex-add': {
      const ex = S.library[+b.dataset.i]; let a = activeSession();
      if (!a) a = await startEmpty('Workout');
      a.items.push(newItemFromLib(ex)); await saveSession(a); toast(`Added ${ex.name} to “${a.name}”`);
      const note = $('#addingTo'); if (note) note.innerHTML = `Adding to: <b>${h(a.name)}</b> · <a href="#/go">open workout (${a.items.length})</a>`;
      break;
    }
    case 'ex-filter': $$('#exChips .chip').forEach(c => c.classList.toggle('on', c === b)); viewExercises.apply && viewExercises.apply(); break;
    case 'finish': {
      s.finished = true; await saveSession(s); S.hint = null; S.goDraft = {}; S.lastDone = null; S.todayPick = null;
      if (Timer.st && Timer.st.kind !== 'interval') Timer.clear();
      toast('Workout saved'); go('#/today'); break;
    }
    case 'del-session': {
      if (!(await confirmBox('Delete this workout?', 'This permanently removes it and its logged sets from your journal.', 'Delete', true))) break;
      await DB.del('sessions', s.id); await refresh(); S.hint = null; toast('Deleted'); go('#/history'); break;
    }
    case 'interval-start': { const f = S.intervalDraft; Timer.startPhases(intervalPhases(f), { draftKey: f.key }); render(); break; }
    case 'interval-save': {
      const f = S.intervalDraft;
      const rec = { id: f.id || undefined, uid: f.uid, date: f.date, programWeek: f.week, programDay: f.day || null, activity: f.activity.trim(),
        warmupMinutes: intOrNull(f.warmupMinutes), rounds: intOrNull(f.rounds), workSeconds: intOrNull(f.workSeconds), restSeconds: intOrNull(f.restSeconds),
        cooldownMinutes: intOrNull(f.cooldownMinutes), durationMinutes: intOrNull(f.durationMinutes) ?? computedMinutes(f), notes: f.notes.trim(), done: !!f.done };
      await DB.put('intervals', rec); await refresh();
      if (Timer.st && Timer.st.kind === 'interval' && Timer.st.ctx?.draftKey === f.key) Timer.clear();
      S.intervalDraft = null; DB.kvSet('intervalDraft', null); toast('Cardio session saved'); go('#/today'); break;
    }
    case 'interval-cancel': {
      const f = S.intervalDraft; if (f && Timer.st && Timer.st.kind === 'interval' && Timer.st.ctx?.draftKey === f.key) Timer.clear();
      S.intervalDraft = null; DB.kvSet('intervalDraft', null); history.length > 1 ? history.back() : go('#/today'); break;
    }
    case 'interval-del': {
      const f = S.intervalDraft; if (!(await confirmBox('Delete this cardio entry?', 'This permanently removes it from your journal.', 'Delete', true))) break;
      await DB.del('intervals', f.id); await refresh(); S.intervalDraft = null; DB.kvSet('intervalDraft', null); toast('Deleted'); go('#/history'); break;
    }
    case 'export-share': {
      // Backup is prepared when the More page renders so share() runs inside the tap (iOS needs user activation).
      const bk = S.backup || buildBackup();
      const ok = await shareFile(bk.json, bk.name, 'application/json');
      if (!ok) { download(bk.json, bk.name, 'application/json'); toast('Backup downloaded'); }
      break;
    }
    case 'export-dl': { const bk = S.backup || buildBackup(); download(bk.json, bk.name, 'application/json'); toast('Backup downloaded'); break; }
    case 'export-csv': {
      const bk = S.backup || buildBackup();
      const ok = isIOS() && await shareFile(bk.csv, bk.csvName, 'text/csv');
      if (!ok) { download(bk.csv, bk.csvName, 'text/csv'); toast('CSV downloaded'); }
      break;
    }
    case 'sound-test': unlockAudio(); beep(3); break;
    case 'voice-test': unlockAudio(); speak('10 seconds. 3. 2. 1. Go! Explosive pushups.', true); break;
    case 'a2hs-x': S.settings.a2hsDismissed = true; saveSettings(); $('#a2hs')?.remove(); break;
    case 'sw-reload': { const reg = showUpdate.reg; if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting'); else location.reload(); break; }
  }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'importFile' && t.files && t.files[0]) { const text = await t.files[0].text(); t.value = ''; await importBackup(text); return; }
  if (t.dataset.setting) {
    const k = t.dataset.setting;
    S.settings[k] = t.type === 'checkbox' ? t.checked : k === 'currentWeek' ? +t.value : t.value;
    if (k === 'currentWeek') S.settings.week = +t.value;
    await saveSettings(); applyTheme();
    if (k === 'keepAwake') setWake(!!(Timer.st && !Timer.st.done && !Timer.st.paused));
    return;
  }
  if (t.dataset.ifield && S.intervalDraft) {
    const k = t.dataset.ifield, f = S.intervalDraft;
    if (k === 'done') f.done = t.checked;
    else if (k === 'date') { const ms = new Date(t.value).getTime(); if (Number.isFinite(ms)) f.date = ms; }
    else if (k === 'week') f.week = intOrNull(t.value);
    else if (k === 'day') f.day = t.value || null;
    else f[k] = t.value;
    await DB.kvSet('intervalDraft', f);
    if (['warmupMinutes', 'rounds', 'workSeconds', 'restSeconds', 'cooldownMinutes', 'week', 'day'].includes(k)) render();
    return;
  }
  const s = currentSession(); if (!s) return;
  if (t.dataset.sfield) { s[t.dataset.sfield] = t.value; await saveSession(s); return; }
  if (t.dataset.set != null && t.dataset.k) {
    const exEl = t.closest('.ex[data-i]'); const st = s.items[+exEl.dataset.i].sets[+t.dataset.set]; if (!st) return;
    const k = t.dataset.k;
    if (k === 'reps') st.reps = intOrNull(t.value) ?? 0;
    else if (k === 'weight') st.weight = numOr(t.value, 0);
    else st.rpe = t.value === '' ? null : numOr(t.value, null);
    await saveSession(s);
  }
});
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { Timer.tick(); if (Timer.st && !Timer.st.done && !Timer.st.paused) setWake(true); if (route().name === 'today') render(); }
});
window.addEventListener('pageshow', () => Timer.tick());
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme); } catch (e) { /* old Safari */ }

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    await DB.open();
    const [prog, wk, seed] = await Promise.all(['data/program16.json', 'data/workouts.json', 'data/seed_exercises.json']
      .map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })));
    S.program = prog; S.workouts = wk; S.seed = seed;
    S.settings = Object.assign(S.settings, await DB.kvGet('settings', {}));
    if (S.settings.currentWeek == null) S.settings.currentWeek = S.settings.week || 1;
    S.intervalDraft = await DB.kvGet('intervalDraft', null);
    Timer.st = await DB.kvGet('timer', null);
    await refresh();
    applyTheme(); updateOnline();
    if (navigator.storage && navigator.storage.persist) {
      try { S.persisted = await navigator.storage.persisted(); if (!S.persisted) S.persisted = await navigator.storage.persist(); } catch (e) { /* ignore */ }
    }
    // v1 links (#/program, #/session) still work; a bare launch opens Today.
    if (!location.hash) history.replaceState(null, '', '#/today');
    render();
    if (Timer.st && !Timer.st.done) Timer.run();
    window.__app = { S, DB, Timer, refresh, render, buildBackup, importBackup, nextStep, roadSwap, classify, ready: true };
  } catch (e) {
    $('#view').innerHTML = `<div class="card"><h3>Could not start</h3><p class="small">${h(e && e.message)}</p><p class="small">If you're offline, open the app once while online so it can save everything for offline use.</p></div>`;
    console.error(e);
  }
  if ('serviceWorker' in navigator) {
    try {
      const hadController = !!navigator.serviceWorker.controller;
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      const track = nw => { if (!nw) return; nw.addEventListener('statechange', () => { if (nw.state === 'installed' && hadController) showUpdate(reg); }); };
      if (reg.waiting && hadController) showUpdate(reg);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    } catch (e) { console.warn('SW registration failed', e); }
  }
}
boot();
})();
