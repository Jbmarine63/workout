/* Six Pack Workout PWA — offline port of the Android app (v1.2).
 * Plain JS, no build step. Data lives in IndexedDB; assets are precached by sw.js. */
'use strict';
(function () {
const APP_VERSION = '1.0.0';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const DAY_NAMES = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };
const dayShort = d => d ? d[0] + d.slice(1).toLowerCase() : '';
const leadingInt = t => { const m = /^\s*(\d+)/.exec(t || ''); return m ? +m[1] : null; };
const intOrNull = v => { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const numOr = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const fmtClock = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const fmtDate = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const letterOf = code => (/^[A-Za-z]+/.exec(code || '') || [''])[0].toUpperCase();
const DEFAULT_REST = 90;

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
  settings: { week: 1, day: 'MON', theme: 'auto', keepAwake: true, a2hsDismissed: false },
  hint: null, intervalDraft: null, persisted: null, backup: null
};
const saveSettings = () => DB.kvSet('settings', S.settings);

async function refresh() {
  [S.sessions, S.intervals, S.custom] = await Promise.all([DB.all('sessions'), DB.all('intervals'), DB.all('exercises')]);
  buildLibrary();
}
const activeSession = () => S.sessions.filter(s => !s.finished).sort((a, b) => b.date - a.date)[0] || null;

function buildLibrary() {
  const map = new Map();
  const add = (e) => {
    const key = e.name.trim().toLowerCase();
    const cur = map.get(key);
    if (!cur) map.set(key, { ...e, key });
    else {
      if (!cur.demoAsset && e.demoAsset) cur.demoAsset = e.demoAsset;
      if (!cur.instructions && e.instructions) cur.instructions = e.instructions;
    }
  };
  S.seed.forEach(e => add({ name: e.name, muscleGroup: e.muscleGroup || 'General', equipment: e.equipment || '', instructions: e.instructions || '', demoAsset: null }));
  // Same rule as the Android app: only GIFs of the same exercise go on the library entry.
  S.program.weeks.forEach(w => w.groups.forEach(g => g.exercises.forEach(pe => add({
    name: pe.exerciseName, muscleGroup: '16-Week Program', equipment: '', instructions: pe.instructions || '',
    demoAsset: (pe.demoMatch === 'page' || pe.demoMatch === 'same') ? pe.demoGif || null : null
  }))));
  (S.workouts.days || []).forEach(d => (d.exercises || []).forEach(ex => add({
    name: ex.name, muscleGroup: '16-Week Program', equipment: '', instructions: ex.instructions || '', demoAsset: ex.demoGif || null
  })));
  S.custom.forEach(c => add({ name: c.name, muscleGroup: c.muscleGroup || 'Custom', equipment: c.equipment || '', instructions: c.instructions || '', demoAsset: null, customId: c.id }));
  S.library = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  S.libByKey = map;
}
const libEx = name => S.libByKey.get(String(name || '').trim().toLowerCase());
const weekOf = n => S.program.weeks.find(w => w.week === n);

/* ---------------- Audio / vibrate / wake lock ---------------- */
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; audioCtx = new C(); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const b = audioCtx.createBuffer(1, 1, 22050); const src = audioCtx.createBufferSource(); src.buffer = b; src.connect(audioCtx.destination); src.start(0);
  } catch (e) { /* no audio */ }
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
 *        phases:[{label,seconds}], idx, ctx }  — persisted so it survives backgrounding/reload. */
const Timer = {
  st: null, iv: null,
  remainingMs() { const s = this.st; if (!s) return 0; return s.paused ? s.remainingMs : Math.max(0, s.endAt - Date.now()); },
  save() { DB.kvSet('timer', this.st); },
  start(seconds, label, kind = 'rest', ctx = null) {
    if (!(seconds > 0)) { this.clear(); return; }
    this.st = { kind, label, total: seconds, endAt: Date.now() + seconds * 1000, paused: false, remainingMs: 0, done: false, ctx };
    this.save(); this.run();
  },
  startPhases(phases, ctx) {
    if (!phases.length) return;
    this.st = { kind: 'interval', phases, idx: 0, label: phases[0].label, total: phases[0].seconds,
      endAt: Date.now() + phases[0].seconds * 1000, paused: false, remainingMs: 0, done: false, ctx };
    this.save(); this.run();
  },
  adjust(d) {
    const s = this.st; if (!s || s.done) return;
    if (s.paused) s.remainingMs = Math.max(0, s.remainingMs + d * 1000);
    else s.endAt = Math.max(Date.now(), s.endAt + d * 1000);
    s.total = Math.max(s.total, Math.ceil(this.remainingMs() / 1000));
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
      s.idx++; const p = s.phases[s.idx]; s.label = p.label; s.total = p.seconds; s.endAt = Date.now() + p.seconds * 1000; s.paused = false;
      this.save(); this.run();
    } else if (s.kind === 'interval' && !s.done) { this.finishIntervals(); }
    else this.clear();
  },
  clear() { this.st = null; DB.kvSet('timer', null); this.stopLoop(); setWake(false); renderTimer(); },
  run() { this.stopLoop(); if (!this.st.paused) { this.iv = setInterval(() => this.tick(), 250); setWake(true); } else setWake(false); this.tick(); },
  stopLoop() { if (this.iv) clearInterval(this.iv); this.iv = null; },
  finishIntervals() {
    const s = this.st; s.done = true; s.label = 'All rounds complete'; s.endAt = Date.now(); s.paused = false;
    this.save(); this.stopLoop(); setWake(false); beep(4);
    if (S.intervalDraft && s.ctx && s.ctx.draftKey === S.intervalDraft.key) {
      S.intervalDraft.done = true; S.intervalDraft.durationMinutes = String(computedMinutes(S.intervalDraft) ?? S.intervalDraft.durationMinutes);
      DB.kvSet('intervalDraft', S.intervalDraft);
      if (route().name === 'interval') render();
    }
    renderTimer();
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
        const p = s.phases[s.idx]; s.label = p.label; s.total = p.seconds; s.endAt = end;
        this.save(); beep(2);
      } else {
        s.done = true; this.save(); this.stopLoop(); setWake(false); beep(3);
      }
    }
    renderTimer();
  }
};
function renderTimer() {
  const bar = $('#timerbar'); const s = Timer.st;
  document.body.classList.toggle('has-timer', !!s);
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
  return modal(`<h3>${h(title)}</h3>${body ? `<p>${body}</p>` : ''}<div class="btns">${options.map(o =>
    `<button class="${o.cls || ''}" data-act="modal-val" data-v="${h(o.v)}">${h(o.label)}</button>`).join('')}</div>`);
}
const confirmBox = (title, body, okLabel = 'OK', danger = false) =>
  choose(title, body, [{ v: 'ok', label: okLabel, cls: danger ? 'danger' : 'primary' }, { v: '', label: 'Cancel' }]).then(v => v === 'ok');

function gifTag(path, alt) { return path ? `<img class="gif" src="${h(path)}" alt="${h(alt || 'demo')}" loading="lazy">` : ''; }
function demoBlock(path, alt, note) {
  if (!path) return `<div class="small muted">No demo available from the source</div>`;
  return `<details><summary>Show demo${note ? ' · ' + h(note) : ''}</summary>${gifTag(path, alt)}</details>`;
}

/* ---------------- Routing ---------------- */
function route() {
  const raw = (location.hash || '#/program').slice(2);
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'program', parts, q };
}
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

function render() {
  const r = route();
  const tab = r.name === 'interval' ? 'history' : (r.name === 'article' || r.name === 'photos') ? 'more' : r.name;
  $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  const views = { program: viewProgram, exercises: viewExercises, session: viewSession, history: viewHistory, interval: viewInterval, more: viewMore, article: viewArticle, photos: viewPhotos };
  const fn = views[r.name] || viewProgram;
  const { title, html, after } = fn(r);
  $('#title').textContent = title;
  $('#view').innerHTML = html;
  if (after) after();
  renderTimer();
}

/* ---------------- Program tab ---------------- */
function weekDone(n) { return S.sessions.filter(s => s.programWeek === n && s.finished).length + S.intervals.filter(i => i.programWeek === n && i.done).length; }
function dayDone(n, d) {
  return S.sessions.filter(s => s.programWeek === n && s.programDay === d && s.finished).length + S.intervals.filter(i => i.programWeek === n && i.programDay === d && i.done).length;
}
function viewProgram(r) {
  if (r.parts[1] === 'w' && r.parts[2]) {
    const n = +r.parts[2]; if (n >= 1 && n <= 16) S.settings.week = n;
    if (r.parts[3] === 'd' && DAY_NAMES[r.parts[4]]) S.settings.day = r.parts[4];
    saveSettings();
  }
  const n = S.settings.week, day = S.settings.day, w = weekOf(n);
  const weeks = S.program.weeks.map(x => `<button class="${x.week === n ? 'on' : ''}" data-act="pick-week" data-w="${x.week}">Wk ${x.week}<small>${weekDone(x.week) ? '✓ ' + weekDone(x.week) : x.format === 'circuit' ? 'circuit' : x.format === 'spartan300' ? '300' : 'superset'}</small></button>`).join('');
  const dayBtns = w.days.map(d => `<button class="${d.day === day ? 'on' : ''}" data-act="pick-day" data-d="${d.day}">${dayShort(d.day)}<small>${dayDone(n, d.day) ? '✓' : d.type === 'resistance' ? 'Lift' : d.type === 'interval' ? 'Cardio' : 'Rest'}</small></button>`).join('');
  const dObj = w.days.find(d => d.day === day) || w.days[0];
  let dayHtml;
  if (dObj.type === 'resistance') dayHtml = resistanceDay(w, dObj.day);
  else if (dObj.type === 'interval') dayHtml = intervalDay(w, dObj.day);
  else dayHtml = `<div class="card" id="restDay"><h3>Sunday: Rest</h3><p class="muted">The program schedules Sunday as a rest day. Recover, eat well, and get ready for next week.</p></div>`;
  return { title: '16-Week Program', html: `
    <div class="weekgrid" id="weekGrid">${weeks}</div>
    ${weekHeader(w)}
    <h4 style="margin:12px 4px 6px">Day</h4>
    <div class="daygrid" id="dayGrid">${dayBtns}</div>
    <div style="margin-top:12px" id="dayContent" data-week="${w.week}" data-day="${dObj.day}">${dayHtml}</div>` };
}
function weekHeader(w) {
  const lv = (w.circuitLevels || []).length ? `<h4>Levels</h4><table class="levels"><tr><th>Level</th><th>Work</th><th>Break</th><th>Circuits</th></tr>${w.circuitLevels.map(l => `<tr><td>${h(l.level)}</td><td>${l.workSeconds}s</td><td>${l.restSeconds}s</td><td>${h(l.circuits)}</td></tr>`).join('')}</table>` : '';
  const imgs = (S.workouts.days.find(d => d.week === w.week)?.journalImages || []);
  return `<div class="card" style="margin-top:12px" id="weekHeader">
    <div class="row"><h3 class="grow" style="margin:0">Week ${w.week}</h3><span class="badge acc">${h(w.format === 'spartan300' ? 'Spartan 300' : w.format)}</span></div>
    <div class="small muted">${h(w.title)}</div>
    <div class="kv" style="margin-top:6px">${w.roundsGuidance ? `<span>Rounds</span><span>${h(w.roundsGuidance)}</span>` : ''}${w.repsGuidance ? `<span>Reps</span><span>${h(w.repsGuidance)}</span>` : ''}${w.restBetweenRoundsSeconds != null ? `<span>Rest</span><span>${w.restBetweenRoundsSeconds}s after each superset round · none inside the superset</span>` : ''}</div>
    ${lv}
    <h4>Substitutions &amp; tips (from the site)</h4>
    ${w.substitutions.length ? `<ul class="tight small" id="subs">${w.substitutions.map(s => `<li class="quote">“${h(s)}”</li>`).join('')}</ul>` : '<div class="small muted">The page gives no substitutions this week.</div>'}
    ${w.appNotes.length ? `<h4>Notes: not available from the source</h4><ul class="tight small muted" id="appNotes">${w.appNotes.map(s => `<li>${h(s)}</li>`).join('')}</ul>` : ''}
    <details><summary>Week instructions (original text)</summary><p class="small quote">“${h(w.instructions)}”</p></details>
    ${imgs.length ? `<details><summary>Journal photos (${imgs.length})</summary>${imgs.map(p => `<img class="photo" src="${h(p)}" alt="journal photo" loading="lazy">`).join('')}</details>` : ''}
  </div>`;
}
function groupHeaderText(g) {
  if (!g) return { kind: 'Group', sub: '' };
  const kind = g.kind === 'superset' ? `Superset ${g.code}` : g.kind === 'circuit' ? `Circuit ${g.code}` : 'Exercises (any order)';
  const parts = [];
  if (g.roundsText) parts.push(g.kind === 'list' ? `${g.roundsText} round` : `Rounds: ${g.roundsText}`);
  if (g.kind === 'superset') parts.push(`no rest inside · rest ${g.restAfterGroupSeconds ?? '?'}s after the pair`);
  if (g.restAfterEachSeconds != null) parts.push(`rest ${g.restAfterEachSeconds}s after each exercise`);
  return { kind, sub: parts.filter(Boolean).join(' · ') };
}
function resistanceDay(w, day) {
  const logged = S.sessions.filter(s => s.programWeek === w.week && s.programDay === day).length;
  const groups = w.groups.map(g => {
    const gh = groupHeaderText(g);
    return `<div class="group-h">${h(gh.kind)} <span class="muted">${h(gh.sub)}</span></div>` + g.exercises.map(e => `
      <div class="ex ${g.kind !== 'list' ? 'in-group' : ''} prog-ex">
        <div class="row"><span class="badge">${h(e.code)}</span><span class="ex-title grow">${h(e.label)}</span></div>
        <div class="target">${e.sets} × ${h(e.reps)}${e.restAfterSeconds === 0 ? ' · no rest → next' : e.restAfterSeconds ? ` · rest ${e.restAfterSeconds}s` : ''}${e.workSeconds ? ` · work ${e.workSeconds}s` : ''}</div>
        ${e.exerciseName !== e.label ? `<div class="small muted">Page demo: ${h(e.exerciseName)}</div>` : ''}
        ${e.trainerComments ? `<div class="small quote">Trainer's comments: ${h(e.trainerComments)}</div>` : ''}
        ${demoBlock(e.demoGif, e.exerciseName, e.demoMatch === 'same' ? 'same exercise, other week' : e.demoMatch === 'similar' ? 'similar exercise' : '')}
        ${e.instructions ? `<details><summary>How to</summary><pre class="text small">${h(e.instructions)}</pre></details>` : ''}
      </div>`).join('');
  }).join('');
  const startBtn = `<button class="primary block" data-act="start-program" data-w="${w.week}" data-d="${day}">Start Week ${w.week} · ${dayShort(day)}</button>`;
  return `<div class="card"><h3>${DAY_NAMES[day]}: Resistance Training</h3>
    ${logged ? `<div class="small"><span class="badge ok">Logged ${logged}×</span></div>` : ''}
    <p class="small muted">Starts a session pre-loaded in the page's order. You can add, remove, swap, reorder and change sets/reps/rest during the workout.</p>
    ${startBtn}</div>${groups}<div style="margin-top:8px">${startBtn}</div>`;
}
function intervalDay(w, day) {
  const p = w.interval;
  const logged = S.intervals.filter(i => i.programWeek === w.week);
  return `<div class="card" id="intervalDay"><h3>${DAY_NAMES[day]}: Interval Training — Cardio (optional)</h3>
    ${p ? `<p class="target">Week ${w.week}: ${p.rounds} rounds × (${p.highSeconds}s high intensity + ${p.moderateSeconds}s moderate), warm up ${h(p.warmupMinutes)} min, cool down ${p.cooldownMinutes} min ≈ ${p.totalMinutes} min · ${p.timesPerWeek}× per week</p>
    <p class="small quote">“${h(p.text)}”</p>` : ''}
    <details><summary>The rules (from the site)</summary><p class="small quote">“${h(S.program.intervalRules)}”</p><p class="small">Activities: “${h(S.program.intervalActivities)}”</p></details>
    <div class="small" style="margin:6px 0">Interval sessions logged in week ${w.week}: <b>${logged.length}</b> (goal ${p ? p.timesPerWeek : 3})</div>
    <button class="primary block" data-act="open-interval" data-w="${w.week}" data-d="${day}">Time / log an interval session</button>
  </div>
  ${logged.sort((a, b) => b.date - a.date).map(intervalListItem).join('')}`;
}

/* ---------------- Sessions ---------------- */
function programItems(w) {
  const items = [];
  w.groups.forEach(g => g.exercises.forEach(pe => {
    items.push({
      uid: uid(), exName: pe.exerciseName, label: pe.label, groupCode: pe.code,
      group: { code: g.code, kind: g.kind, roundsText: g.roundsText, restAfterGroupSeconds: g.restAfterGroupSeconds, restAfterEachSeconds: g.restAfterEachSeconds },
      targetSets: pe.sets, targetReps: pe.reps || '', restAfterSeconds: pe.restAfterSeconds ?? null, workSeconds: pe.workSeconds ?? null,
      notes: [pe.trainerComments ? `Trainer's comments: ${pe.trainerComments}` : '', pe.note || ''].filter(Boolean).join('\n'),
      demoAsset: pe.demoGif || null,
      demoNote: pe.demoMatch === 'same' ? 'Demo from another week (same exercise)' : pe.demoMatch === 'similar' ? 'Similar demo (related exercise)' : '',
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
    if (v === 'resume') return go('#/session');
    if (v !== 'finish') return;
    act.finished = true; await DB.put('sessions', act);
  }
  const w = weekOf(weekN);
  await DB.put('sessions', { uid: uid(), date: Date.now(), name: `16-Week Program · Week ${weekN} · ${dayShort(day)}`, notes: '', finished: false, programWeek: weekN, programDay: day, items: programItems(w) });
  S.hint = null; await refresh(); go('#/session');
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
/** Mirrors LogViewModel.afterSet: no rest inside a superset, rest after the pair / each circuit exercise. */
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

function viewSession(r) {
  const id = r.parts[1] ? +r.parts[1] : null;
  const s = id ? sessionById(id) : activeSession();
  if (!s) {
    if (id) return { title: 'Workout', html: `<div class="empty">That workout no longer exists.</div>` };
    const last = S.sessions.filter(x => x.finished).sort((a, b) => b.date - a.date)[0];
    return { title: 'Workout', html: `<div class="card"><h3>Ready to train?</h3>
      <p class="small muted">Start a week from the Program tab to get that day's routine pre-loaded, or start an empty workout and add exercises.</p>
      <label class="f">Workout name (optional)<input id="newName" placeholder="Workout" autocomplete="off"></label>
      <div class="stack" style="margin-top:10px"><button class="primary block" data-act="start-empty">Start empty workout</button>
      <button class="block" data-act="goto" data-h="#/program/w/${S.settings.week}">Open the 16-week program (Week ${S.settings.week})</button></div></div>
      ${last ? `<div class="small muted pad">Last workout: ${h(last.name)} — ${fmtDate(last.date)}</div>` : ''}` };
  }
  const items = s.items;
  let html = `<div class="card tight">
    <label class="f">Name<input data-sfield="name" value="${h(s.name)}"></label>
    <div class="small muted" style="margin-top:4px">${fmtDate(s.date)} · ${s.finished ? '<span class="badge ok">finished</span>' : '<span class="badge acc">in progress</span>'}</div>
  </div>`;
  if (S.hint && !s.finished) html += `<div class="hint" id="hint"><span class="grow">${h(S.hint)}</span><button class="icon sm ghost" data-act="hint-x" aria-label="Dismiss">✕</button></div>`;
  if (!items.length) html += `<div class="empty">No exercises yet. Tap <b>Add exercise</b>, or start a week from the Program tab.</div>`;
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
      <div class="row">${it.groupCode ? `<span class="badge">${h(it.groupCode)}</span>` : ''}<span class="ex-title grow">${h(it.label)}</span>
        <span class="small muted setcount">${it.sets.length}${tgt ? '/' + tgt : ''}</span></div>
      ${lib && lib.name !== it.label ? `<div class="small muted">Demo / library: ${h(lib.name)}</div>` : ''}
      <div class="target">${h(targetLine(it, ctx))}</div>
      ${it.notes ? `<pre class="text small muted">${h(it.notes)}</pre>` : ''}
      ${it.demoAsset ? `<details><summary>Show demo${it.demoNote ? ' · ' + h(it.demoNote) : ''}</summary>${gifTag(it.demoAsset, it.label)}${how}</details>`
        : how ? `<details><summary>How to</summary>${how}</details>` : ''}
      <div class="row" style="margin-top:6px">
        <button class="sm" data-act="t-rest" data-s="${restChip}">⏱ Rest ${restChip}s</button>
        ${it.workSeconds ? `<button class="sm" data-act="t-work" data-s="${it.workSeconds}" data-l="${h(it.label)}">▶ Work ${it.workSeconds}s</button>` : ''}
      </div>
      ${it.sets.length ? `<div class="sethead"><span>#</span><span>Reps / sec</span><span>lb</span><span>RPE</span><span></span></div>` : ''}
      ${it.sets.map((st, k) => `<div class="setrow"><b style="text-align:center">${k + 1}</b>
        <input inputmode="numeric" data-set="${k}" data-k="reps" value="${h(st.reps)}" aria-label="reps">
        <input inputmode="decimal" data-set="${k}" data-k="weight" value="${h(st.weight || '')}" placeholder="BW" aria-label="weight">
        <input inputmode="decimal" data-set="${k}" data-k="rpe" value="${h(st.rpe ?? '')}" aria-label="RPE">
        <button class="icon sm ghost" data-act="del-set" data-set="${k}" aria-label="Delete set">✕</button></div>`).join('')}
      <button class="block primary" style="margin-top:8px" data-act="log-set">${tgt ? (it.sets.length >= tgt ? `Log extra set ${it.sets.length + 1}` : `Log set ${it.sets.length + 1} of ${tgt}`) : 'Add set'}</button>
      <details style="margin-top:4px" class="itemmenu"><summary>Edit / swap / move / remove</summary>
        <div class="actions">
          <button data-act="swap">⇄ Swap</button><button data-act="edit">✎ Edit</button>
          <button data-act="move" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑ Up</button><button data-act="move" data-d="1" ${i === items.length - 1 ? 'disabled' : ''}>↓ Down</button>
          <button class="danger" data-act="remove">🗑 Remove</button>
        </div></details>
    </div>`;
  });
  html += `<label class="f">Session notes<textarea data-sfield="notes" placeholder="How did it go?">${h(s.notes || '')}</textarea></label>
    <div class="stack" style="margin-top:12px">
      <button class="block" data-act="add-ex">＋ Add exercise</button>
      ${s.finished ? `<button class="block" data-act="goto" data-h="#/history">← Back to History</button>` : `<button class="primary block" data-act="finish">✓ Finish workout</button>`}
      <button class="danger block" data-act="del-session">Delete this workout</button>
    </div>`;
  return { title: s.finished ? 'Workout (history)' : 'Workout', html: `<div id="sessionView" data-sid="${s.id}">${html}</div>` };
}
function currentSession() { const el = $('#sessionView'); return el ? sessionById(+el.dataset.sid) : null; }

async function pickExercise(title) {
  const list = S.library;
  const html = `<h3>${h(title)}</h3><input id="pickSearch" type="search" placeholder="Search exercises" autocomplete="off">
    <div id="pickList" style="margin-top:8px">${list.map((e, i) => `<button class="listitem block" style="justify-content:flex-start" data-act="modal-val" data-v="${i}" data-name="${h(e.name.toLowerCase() + ' ' + e.muscleGroup.toLowerCase())}">
      ${e.demoAsset ? `<img class="thumb" src="${h(e.demoAsset)}" alt="" loading="lazy">` : '<span class="thumb" style="display:inline-block"></span>'}
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
  const groups = Array.from(new Set(S.library.map(e => e.muscleGroup))).sort();
  const act = activeSession();
  return { title: 'Exercise Library', html: `
    <div class="sticky-search"><input id="exSearch" type="search" placeholder="Search by name or muscle group" autocomplete="off">
    <div class="chips scroll" style="margin-top:6px" id="exChips"><button class="chip on" data-act="ex-filter" data-g="">All (${S.library.length})</button>${groups.map(g => `<button class="chip" data-act="ex-filter" data-g="${h(g)}">${h(g)}</button>`).join('')}</div></div>
    <div class="small muted" id="addingTo" style="margin:0 4px 8px">${act ? `Adding to: <b>${h(act.name)}</b> · <a href="#/session">open workout (${act.items.length})</a>` : 'Tap ＋ Add to start a workout with that exercise.'}</div>
    <div id="exList">${S.library.map((e, i) => `<div class="ex lib-ex" data-name="${h(e.name.toLowerCase())}" data-g="${h(e.muscleGroup)}">
      <div class="row">${e.demoAsset ? `<img class="thumb" src="${h(e.demoAsset)}" alt="" loading="lazy">` : ''}
        <div class="grow"><div class="ex-title">${h(e.name)}</div><div class="small muted">${h(e.muscleGroup)}${e.equipment ? ' · ' + h(e.equipment) : ''}</div></div>
        <button class="sm primary" data-act="ex-add" data-i="${i}">＋ Add</button></div>
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
function draftFor(q) {
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
  const f = draftFor(r.q);
  const w = f.week ? weekOf(f.week) : null, p = w?.interval;
  const running = Timer.st && Timer.st.kind === 'interval' && Timer.st.ctx?.draftKey === f.key;
  const fld = (k, label, mode = 'numeric') => `<label class="f">${label}<input data-ifield="${k}" inputmode="${mode}" value="${h(f[k])}"></label>`;
  const cm = computedMinutes(f);
  const weekOpts = `<option value="">— none —</option>` + S.program.weeks.map(x => `<option value="${x.week}" ${f.week === x.week ? 'selected' : ''}>Week ${x.week}</option>`).join('');
  const dayOpts = `<option value="">— none —</option>` + Object.keys(DAY_NAMES).map(d => `<option value="${d}" ${f.day === d ? 'selected' : ''}>${DAY_NAMES[d]}</option>`).join('');
  return { title: f.id ? 'Edit interval session' : 'Interval cardio', html: `
    <div class="card" id="intervalView"><h3>${w ? `Week ${w.week}${f.day ? ' · ' + DAY_NAMES[f.day] : ''}` : 'Interval training'}</h3>
      ${p ? `<p class="target small">Prescription: ${p.rounds} rounds × (${p.highSeconds}s high + ${p.moderateSeconds}s moderate), warm up ${h(p.warmupMinutes)} min, cool down ${p.cooldownMinutes} min ≈ ${p.totalMinutes} min</p>` : ''}
      <details><summary>The rules (from the site)</summary><p class="small quote">“${h(S.program.intervalRules)}”</p></details>
      ${running ? `<p class="small">Timer is running — see the timer card below. It keeps the right time if you switch apps, but iPhone can't alert you while the app is closed or the screen is locked.</p>`
        : `<button class="primary block" data-act="interval-start">▶ Start guided interval timer (${intervalPhases(f).length} phases)</button>`}
    </div>
    <div class="card">
      <label class="f">Date &amp; time<input type="datetime-local" data-ifield="date" value="${h(toLocalInput(f.date))}"></label>
      <div class="row"><div class="grow"><label class="f">Program week<select data-ifield="week">${weekOpts}</select></label></div><div class="grow"><label class="f">Day<select data-ifield="day">${dayOpts}</select></label></div></div>
      <label class="f">Activity (run/sprint, bike, rowing…)<input data-ifield="activity" inputmode="text" value="${h(f.activity)}" placeholder="Run / sprint"></label>
      <div class="row"><div class="grow">${fld('warmupMinutes', 'Warm-up (min)')}</div><div class="grow">${fld('rounds', 'Intervals / rounds')}</div></div>
      <div class="row"><div class="grow">${fld('workSeconds', 'High / work (sec)')}</div><div class="grow">${fld('restSeconds', 'Moderate / rest (sec)')}</div></div>
      <div class="row"><div class="grow">${fld('cooldownMinutes', 'Cool-down (min)')}</div><div class="grow">${fld('durationMinutes', 'Total duration (min)')}</div></div>
      ${cm != null ? `<div class="small muted">Calculated: about ${cm} min</div>` : ''}
      <label class="f">Notes<textarea data-ifield="notes">${h(f.notes)}</textarea></label>
      <label class="check"><input type="checkbox" data-ifield="done" ${f.done ? 'checked' : ''}> Done (uncheck to log it as skipped / partial)</label>
      <div class="stack"><button class="primary block" data-act="interval-save">Save interval session</button>
      <button class="block" data-act="interval-cancel">Cancel</button>
      ${f.id ? '<button class="danger block" data-act="interval-del">Delete this entry</button>' : ''}</div>
    </div>` };
}

/* ---------------- History ---------------- */
function intervalListItem(i) {
  const tag = i.programWeek ? `Week ${i.programWeek}${i.programDay ? ' · ' + dayShort(i.programDay) : ''}` : '';
  const bits = [i.activity, i.rounds != null ? i.rounds + ' rounds' : '', i.workSeconds != null ? `${i.workSeconds}s/${i.restSeconds ?? '?'}s` : '', i.durationMinutes != null ? i.durationMinutes + ' min' : ''].filter(Boolean).map(h).join(' · ');
  return `<a class="listitem hist-interval" href="#/interval?id=${i.id}"><span style="font-size:24px">🏃</span><span class="grow"><span class="t">Interval cardio${tag ? ' · ' + h(tag) : ''}</span><br>
    <span class="small muted">${fmtDate(i.date)}${bits ? ' · ' + bits : ''}${i.done ? '' : ' · <b>not done</b>'}</span></span><span class="muted">›</span></a>`;
}
function sessionListItem(s) {
  const sets = s.items.reduce((a, it) => a + it.sets.length, 0);
  const ex = s.items.filter(it => it.sets.length).length;
  return `<a class="listitem hist-session" href="#/session/${s.id}"><span style="font-size:24px">🏋️</span><span class="grow"><span class="t">${h(s.name)}</span><br>
    <span class="small muted">${fmtDate(s.date)} · ${ex}/${s.items.length} exercises · ${sets} sets${s.finished ? '' : ' · <b>in progress</b>'}</span></span><span class="muted">›</span></a>`;
}
function viewHistory(r) {
  const f = r.q.f || 'all';
  const all = [...(f !== 'cardio' ? S.sessions.map(s => ({ t: 's', date: s.date, o: s })) : []), ...(f !== 'workouts' ? S.intervals.map(i => ({ t: 'i', date: i.date, o: i })) : [])].sort((a, b) => b.date - a.date);
  return { title: 'History', html: `
    <div class="chips" style="margin-bottom:10px">${[['all', 'All'], ['workouts', 'Workouts'], ['cardio', 'Cardio']].map(([k, l]) => `<a class="btn chip ${f === k ? 'on' : ''}" href="#/history?f=${k}">${l}</a>`).join('')}
      <button class="chip primary" data-act="open-interval" data-w="${S.settings.week}" data-d="">＋ Log cardio</button></div>
    <div id="histList">${all.length ? all.map(x => x.t === 's' ? sessionListItem(x.o) : intervalListItem(x.o)).join('') : '<div class="empty">Nothing logged yet. Finished workouts and interval cardio show up here.</div>'}</div>
    <p class="small muted pad">Tip: back up your log regularly from More → Backup.</p>` };
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
  return { title: 'More', html: `
    <div class="card"><h3>Backup &amp; restore</h3>
      <p class="small muted" id="stats">${S.sessions.length} workouts · ${S.intervals.length} interval entries · ${nSets} sets. Your log is stored only on this phone. Export a backup now and then (Share → Save to Files, or send it to yourself).</p>
      <div class="stack"><button class="primary block" data-act="export-share">⬆︎ Share / save backup (JSON)</button>
      <button class="block" data-act="export-dl">⬇︎ Download backup (JSON)</button>
      <button class="block" data-act="export-csv">⬇︎ Export CSV (spreadsheet)</button>
      <label class="btn block" for="importFile">⤓ Restore from backup…</label><input id="importFile" type="file" accept="application/json,.json" class="hidden"></div>
    </div>
    <div class="card"><h3>Settings</h3>
      <label class="f">Theme<select data-setting="theme"><option value="auto" ${S.settings.theme === 'auto' ? 'selected' : ''}>Match phone</option><option value="dark" ${S.settings.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${S.settings.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
      <label class="check"><input type="checkbox" data-setting="keepAwake" ${S.settings.keepAwake ? 'checked' : ''}> Keep the screen on while a timer runs ${'wakeLock' in navigator ? '' : '<span class="small muted">(not supported here)</span>'}</label>
      <div class="small muted">Storage: ${S.persisted === true ? 'persistent ✓' : S.persisted === false ? 'best-effort (add to Home Screen to keep data safe)' : 'unknown'} · ${isStandalone() ? 'running from Home Screen ✓' : 'running in the browser'}</div>
      <button class="block" style="margin-top:8px" data-act="sound-test">🔔 Test timer sound</button>
    </div>
    <div class="card"><h3>From the site</h3>
      ${(S.workouts.articles || []).map(a => `<a class="listitem" href="#/article/${h(a.id)}"><span class="grow t">${h(a.title)}</span><span class="muted">›</span></a>`).join('')}
      <a class="listitem" href="#/photos"><span class="grow t">Journal photos</span><span class="muted">›</span></a>
    </div>
    <div class="card"><h3>Install on iPhone</h3>
      <ol class="small tight"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button <span class="share-ico">⬆︎</span>.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Workout</b> from the Home Screen. It works offline after that.</li></ol>
      <button class="block sm" data-act="show-a2hs">Show the install hint again</button>
    </div>
    <p class="small muted pad">Six Pack Workout ${APP_VERSION} · program: ${h(S.program.name)} (archived iwantsixpackabs.com, 2007). The original videos were Flash embeds and were not archived.</p>`,
    after() { buildBackup(); } };
}
function viewArticle(r) {
  const a = (S.workouts.articles || []).find(x => x.id === r.parts[1]);
  if (!a) return { title: 'Article', html: '<div class="empty">Not found.</div>' };
  return { title: a.title, html: `<div class="card"><h3>${h(a.title)}</h3><pre class="text small">${h(a.text)}</pre></div><a class="btn block" href="#/more">← Back</a>` };
}
function viewPhotos() {
  const imgs = ['front_fat.jpg', 'back.jpg', 'six_pack_abs_week_9_front.jpg', 'six_pack_abs_week_9_back.jpg', 'fitness_backpack1.jpg', 'fitness_backpack_2.jpg'];
  return { title: 'Journal photos', html: `<div class="card">${imgs.map(p => `<img class="photo" src="journal_images/${p}" alt="${h(p)}" loading="lazy"><div class="small muted">${h(p.replace(/\.jpg$/, '').replace(/_/g, ' '))}</div>`).join('')}</div><a class="btn block" href="#/more">← Back</a>` };
}

/* ---------------- Theme / banners ---------------- */
function applyTheme() {
  const t = S.settings.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : S.settings.theme;
  document.documentElement.dataset.theme = t;
  $('#themeColor').setAttribute('content', t === 'light' ? '#f4f5f7' : '#111418');
}
function showA2HS(force) {
  if (!force && (S.settings.a2hsDismissed || isStandalone() || !isIOS())) return;
  if ($('#a2hs')) return;
  $('#banner').insertAdjacentHTML('afterbegin', `<div class="banner" id="a2hs"><span style="font-size:26px">📲</span><div class="grow small"><b>Install this app:</b> tap the Share button <span class="share-ico">⬆︎</span> in Safari, then <b>Add to Home Screen</b>. It then opens full-screen, works offline, and your log is kept safe.</div><button class="icon sm ghost" data-act="a2hs-x" aria-label="Dismiss">✕</button></div>`);
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
    case 'pick-week': S.settings.week = +b.dataset.w; saveSettings(); go('#/program'); break;
    case 'pick-day': S.settings.day = b.dataset.d; saveSettings(); go('#/program'); break;
    case 'start-program': await startProgram(+b.dataset.w, b.dataset.d); break;
    case 'open-interval': go(`#/interval?w=${b.dataset.w || ''}&d=${b.dataset.d || ''}`); break;
    case 'start-empty': await startEmpty($('#newName')?.value); S.hint = null; render(); break;
    case 'hint-x': S.hint = null; $('#hint')?.remove(); break;
    case 't-rest': S.hint = null; $('#hint')?.remove(); Timer.start(+b.dataset.s, 'Rest'); break;
    case 't-work': Timer.start(+b.dataset.s, 'Work — ' + b.dataset.l, 'work'); break;
    case 'timer-adj': Timer.adjust(+b.dataset.d); break;
    case 'timer-pause': Timer.togglePause(); break;
    case 'timer-skip': Timer.skip(); break;
    case 'timer-clear': Timer.clear(); if (route().name === 'interval') render(); break;
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
      Object.assign(it, { exName: ex.name, label: ex.name, demoAsset: ex.demoAsset || null, demoNote: '', notes: [it.notes, `Swapped in for: ${old}`].filter(Boolean).join('\n') });
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
      const cur = currentSession(); cur.items.push(newItemFromLib(ex)); await saveSession(cur); render(); toast(`Added ${ex.name}`); break;
    }
    case 'ex-add': {
      const ex = S.library[+b.dataset.i]; let a = activeSession();
      if (!a) a = await startEmpty('Workout');
      a.items.push(newItemFromLib(ex)); await saveSession(a); toast(`Added ${ex.name} to “${a.name}”`);
      const note = $('#addingTo'); if (note) note.innerHTML = `Adding to: <b>${h(a.name)}</b> · <a href="#/session">open workout (${a.items.length})</a>`;
      break;
    }
    case 'ex-filter': $$('#exChips .chip').forEach(c => c.classList.toggle('on', c === b)); viewExercises.apply && viewExercises.apply(); break;
    case 'finish': {
      s.finished = true; await saveSession(s); S.hint = null; if (Timer.st && Timer.st.kind !== 'interval') Timer.clear();
      toast('Workout saved to History'); go('#/history'); break;
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
      S.intervalDraft = null; DB.kvSet('intervalDraft', null); toast('Interval session saved'); go('#/history'); break;
    }
    case 'interval-cancel': {
      const f = S.intervalDraft; if (f && Timer.st && Timer.st.kind === 'interval' && Timer.st.ctx?.draftKey === f.key) Timer.clear();
      S.intervalDraft = null; DB.kvSet('intervalDraft', null); go('#/history'); break;
    }
    case 'interval-del': {
      const f = S.intervalDraft; if (!(await confirmBox('Delete this interval entry?', 'This permanently removes it from your journal.', 'Delete', true))) break;
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
    case 'a2hs-x': S.settings.a2hsDismissed = true; saveSettings(); $('#a2hs')?.remove(); break;
    case 'show-a2hs': showA2HS(true); window.scrollTo(0, 0); break;
    case 'sw-reload': { const reg = showUpdate.reg; if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting'); else location.reload(); break; }
  }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'importFile' && t.files && t.files[0]) { const text = await t.files[0].text(); t.value = ''; await importBackup(text); return; }
  if (t.dataset.setting) {
    S.settings[t.dataset.setting] = t.type === 'checkbox' ? t.checked : t.value; await saveSettings(); applyTheme();
    if (t.dataset.setting === 'keepAwake') setWake(!!(Timer.st && !Timer.st.done && !Timer.st.paused));
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
  if (document.visibilityState === 'visible') { Timer.tick(); if (Timer.st && !Timer.st.done && !Timer.st.paused) setWake(true); }
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
    S.intervalDraft = await DB.kvGet('intervalDraft', null);
    Timer.st = await DB.kvGet('timer', null);
    await refresh();
    applyTheme(); updateOnline();
    if (navigator.storage && navigator.storage.persist) {
      try { S.persisted = await navigator.storage.persisted(); if (!S.persisted) S.persisted = await navigator.storage.persist(); } catch (e) { /* ignore */ }
    }
    if (!location.hash) history.replaceState(null, '', '#/program');
    render(); showA2HS(false);
    if (Timer.st && !Timer.st.done) Timer.run();
    window.__app = { S, DB, Timer, refresh, render, buildBackup, importBackup, ready: true };
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
