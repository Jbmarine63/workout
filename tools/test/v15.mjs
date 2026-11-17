// 1.5 test: Recovery/Stretch/Routines, injury swaps, cardio log, trackers, stats, backup v2, DB v1 -> v2 upgrade.
// Serve the parent folder:  (cd .. && python3 -m http.server 8765)  then  node tools/test/v15.mjs [baseUrl]
import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/workout-pwa-v15/';
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
const settle = (ms = 250) => page.waitForTimeout(ms);
const ready = () => page.waitForFunction(() => window.__app && window.__app.ready);

// --- DB v1 -> v2 upgrade: create the 1.4 database first, then open 1.5
await page.goto(BASE + 'manifest.webmanifest');
await page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('workout-pwa', 1);
  r.onupgradeneeded = () => { const d = r.result; for (const s of ['sessions', 'intervals', 'exercises']) d.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); d.createObjectStore('kv', { keyPath: 'k' }); };
  r.onsuccess = () => { const t = r.result.transaction(['sessions', 'intervals'], 'readwrite');
    t.objectStore('sessions').put({ uid: 'old1', date: Date.now() - 864e5 * 3, name: 'Week 1 · Mon', finished: true, programWeek: 1, programDay: 'MON', items: [{ uid: 'i1', exName: 'Bench press', label: 'Bench press', sets: [{ reps: 10, weight: 100 }, { reps: 8, weight: 110 }] }] });
    t.objectStore('intervals').put({ uid: 'oldi', date: Date.now() - 864e5, activity: 'Run', durationMinutes: 20, done: true });
    t.oncomplete = () => { r.result.close(); res(); }; t.onerror = rej; };
  r.onerror = rej;
}));
await page.goto(BASE); await ready();
const up = await page.evaluate(async () => { const a = window.__app; return { s: a.S.sessions.length, i: a.S.intervals.length, stores: [...(await a.DB.open()).objectStoreNames] }; }).catch(async () => page.evaluate(() => ({ s: window.__app.S.sessions.length, i: window.__app.S.intervals.length })));
ok('1.4 data survives DB v2 upgrade', up.s === 1 && up.i === 1, JSON.stringify(up));
ok('recovery content loaded', await page.evaluate(() => window.__app.S.recovery && window.__app.S.recovery.areas.length === 5));
ok('Recovery tab in nav', await page.isVisible('#tabs a[data-tab=recovery]'));

// --- Recovery
await page.click('#tabs a[data-tab=recovery]'); await settle();
ok('disclaimer + pain guide shown', (await page.textContent('#view')).includes('Not medical advice') && (await page.textContent('#view')).includes('Pain guide'));
await page.click('[data-act=toggle-area][data-k=knee]'); await settle();
ok('knee checkbox saves', await page.evaluate(() => JSON.stringify(window.__app.S.settings.injuries) === '["knee"]'));
const sw = await page.evaluate(() => { const a = window.__app; let n = 0, ex = null; for (const w of a.S.program.weeks) { const it = a.programItems(w, false, ['knee']); const s = it.filter(x => x.swapReason); n += s.length; if (s.length && !ex) ex = s[0].swapFrom + ' -> ' + s[0].label; } return { n, ex }; });
ok('knee swaps applied to program weeks', sw.n > 0, JSON.stringify(sw));
const road = await page.evaluate(() => { const a = window.__app; let n = 0; for (const w of a.S.program.weeks) n += a.programItems(w, true, ['knee', 'shoulder', 'back', 'ankle', 'wrist']).length; return n; });
ok('road + all areas builds every week', road > 0);
const exId = await page.evaluate(() => window.__app.S.recovery.areas[0].exercises[0].id);
await page.goto(BASE + '#/recovery/ex/' + exId); await settle();
await page.fill('#painIn', '2').catch(() => page.$eval('#painIn', el => { el.value = 2; el.dispatchEvent(new Event('input', { bubbles: true })); }));
await page.click('[data-act=rec-log]'); await settle();
ok('recovery exercise logged with pain', await page.evaluate(() => window.__app.S.recLogs.length === 1 && window.__app.S.recLogs[0].painLevel === 2));
// stretch + guide
await page.goto(BASE + '#/recovery/stretch'); await settle();
await page.click('[data-act=guide-warmup]'); await settle(500);
ok('guided warm-up runs', await page.evaluate(() => location.hash === '#/guide' && window.__app.Timer.st && window.__app.Timer.st.ctx && !!window.__app.Timer.st.ctx.guide));
await page.evaluate(() => window.__app.Timer.finishIntervals()); await settle(500);
ok('finished guide logs a session', await page.evaluate(() => window.__app.S.recLogs.length === 2));
await page.click('[data-act=guide-close]').catch(() => {}); await settle();
await page.goto(BASE + '#/recovery/routines'); await settle();
ok('4 routines listed', (await page.$$('.routine')).length === 4);

// --- Today
await page.goto(BASE + '#/today'); await settle();
ok('Today shows recovery line + cardio/stats/trackers links', await page.isVisible('#recLine') && await page.isVisible('#cardioLink') && await page.isVisible('a[href="#/stats"]'));
await page.screenshot({ path: '/workspace/workout-pwa-shots/v15-today.png' });

// --- Cardio
await page.goto(BASE + '#/cardio'); await settle();
const ideas = await page.$$eval('[data-act=cardio-idea]', els => els.map(e => e.dataset.n));
ok('cardio suggestions include jump rope/jogging/walking/sprints', ['Jump rope', 'Jogging', 'Walking', 'Sprints'].every(n => ideas.includes(n)), ideas.join(','));
await page.click('[data-act=cardio-idea][data-n="Jogging"]'); await page.fill('#cMin', '25'); await page.fill('#cDist', '2.5');
await page.click('[data-act=cardio-save]'); await settle();
ok('cardio saved with distance', await page.evaluate(() => window.__app.S.intervals.some(i => i.activity === 'Jogging' && i.durationMinutes === 25 && i.distance === 2.5)));
await page.fill('#cType', 'Rowing machine'); await page.fill('#cMin', '15'); await page.click('[data-act=cardio-save]'); await settle();
ok('custom cardio type saved', await page.evaluate(() => window.__app.S.intervals.some(i => i.activity === 'Rowing machine')));

// --- Trackers
await page.goto(BASE + '#/trackers/body'); await settle();
await page.fill('#wIn', '182.4'); await page.click('[data-act=metric-add][data-type=weight]'); await settle();
ok('weight saved', await page.evaluate(() => window.__app.S.metrics.some(m => m.type === 'weight' && m.value === 182.4)));
await page.goto(BASE + '#/trackers/habits'); await settle();
await page.click('[data-act=water][data-d="1"]'); await page.click('[data-act=water][data-d="1"]'); await settle();
const hb = await page.$('input[data-habit]'); if (hb) { await hb.check(); await settle(); }
ok('water + habit saved', await page.evaluate(() => window.__app.S.habits.some(x => x.habit === 'water' && x.value === 2) && window.__app.S.habits.some(x => x.habit !== 'water' && x.value === 1)));
await page.goto(BASE + '#/trackers/photos'); await settle();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAeBAEB1vXjWgAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('#photoIn', { name: 'p.png', mimeType: 'image/png', buffer: png }); await settle(800);
ok('progress photo saved locally', await page.evaluate(() => window.__app.S.photos.length === 1) && (await page.$$('img.photo[data-pid]')).length === 1);
await page.goto(BASE + '#/trackers/health'); await settle();
const ht = await page.textContent('#view');
ok('health apps tab explains manual entry on iPhone', /Samsung|Health Connect|manual/i.test(ht));

// --- Stats
await page.goto(BASE + '#/stats'); await settle();
ok('stats render', await page.isVisible('.stat-grid') && await page.isVisible('.heat'));
await page.screenshot({ path: '/workspace/workout-pwa-shots/v15-stats.png', fullPage: true });

// --- Backup
const bk = await page.evaluate(() => { const a = window.__app; const b = a.buildBackup(); const d = JSON.parse(b.json); return { schema: d.schema, m: d.metrics.length, r: d.recoveryLogs.length, ph: d.photos.length, blob: JSON.stringify(d.photos).includes('blob'), csv: b.csv.split('\n')[0], csvRec: b.csv.includes('recovery,'), bad: a.validateBackup({ app: 'workout-pwa', schema: 9, sessions: [{ date: 'x' }], intervals: [] }).length, good: a.validateBackup(d).length }; });
ok('backup v2 has trackers + recovery, photos without images', bk.schema === 2 && bk.m === 1 && bk.r === 2 && bk.ph === 1 && !bk.blob, JSON.stringify(bk));
ok('CSV has distance/pain columns and recovery rows', bk.csv.includes('distance') && bk.csv.includes('pain') && bk.csvRec);
ok('bad backup rejected, own backup valid', bk.bad > 0 && bk.good === 0);

// --- go: injury swap shows in the workout; swap covers the rest of the workout; Train anyway on a rest day
await page.evaluate(async () => { const a = window.__app; a.S.settings.injuries = ['knee']; await a.DB.kvSet('settings', a.S.settings); });
await page.goto(BASE + '#/program/w/1/d/MON'); await settle();
await page.locator('[data-act=start-program]').first().click(); await settle();
if (await page.isVisible('#modal [data-v=finish]')) { await page.click('#modal [data-v=finish]'); await settle(); }
await page.waitForFunction(() => location.hash.startsWith('#/go'));
const sess = await page.evaluate(() => { const s = window.__app.S.sessions.find(x => !x.finished); return { sw: s.items.filter(i => i.swapReason).map(i => i.swapFrom + '->' + i.label), inj: s.injuries }; });
ok('workout started with knee swaps', sess.sw.length > 0 && JSON.stringify(sess.inj) === '["knee"]', JSON.stringify(sess));
let shown = false; for (let k = 0; k < 40 && !shown; k++) { shown = (await page.textContent('#view')).includes('Recovery swap (Knee'); if (!shown) { const n = page.locator('[data-act=go-skip], [data-act=go-skip-rest]'); if (await n.count()) { await n.first().click(); await settle(120); } else break; } }
ok('go screen labels the recovery swap', shown);
await page.screenshot({ path: '/workspace/workout-pwa-shots/v15-go.png' });
await page.evaluate(async () => { const a = window.__app; const s = a.S.sessions.find(x => !x.finished); s.finished = true; await a.DB.put('sessions', s); await a.refresh(); });
const rest = await page.evaluate(() => { const w = window.__app.S.program.weeks[0]; const d = w.days.find(x => x.type !== 'resistance' && x.type !== 'interval'); return d && d.day; });
if (rest) { await page.goto(BASE + '#/today'); await page.evaluate(d => { window.__app.S.todayPick = d; window.__app.render(); }, rest); await settle();
  ok('rest day offers Train anyway', await page.isVisible('#trainAnyway')); }
// --- More / Credits
await page.goto(BASE + '#/more'); await settle();
const more = await page.textContent('#view');
ok('version label Workout 1.5', more.includes('Workout 1.5'));
await page.goto(BASE + '#/credits'); await settle();
const cr = await page.textContent('#view');
ok('19 recovery GIF credits', (cr.match(/Recovery GIF:/g) || []).length === 19);
const gifs = await page.evaluate(async () => { const fs = new Set(); JSON.stringify(window.__app.S.recovery).replace(/recovery\/[\w.-]+\.gif/g, m => fs.add(m)); const r = await Promise.all([...fs].map(f => fetch(f).then(x => x.ok))); return { n: fs.size, ok: r.every(Boolean) }; });
ok('every recovery GIF loads', gifs.ok && gifs.n >= 18, JSON.stringify(gifs));
const pc = await page.evaluate(async () => { await navigator.serviceWorker.ready; const ks = await caches.keys(); const c = await caches.open(ks[ks.length - 1]); const reqs = await c.keys(); return { n: reqs.length, rg: reqs.filter(r => /\/recovery\/.*\.gif$/.test(r.url)).length, rj: reqs.some(r => r.url.endsWith('data/recovery.json')), pv: reqs.some(r => r.url.endsWith('privacy.html')) }; });
ok('precache has recovery GIFs, recovery.json, privacy.html', pc.rg === 19 && pc.rj && pc.pv, JSON.stringify(pc));
const pr = await page.goto(BASE + 'privacy.html'); ok('privacy.html loads', pr.ok() && (await page.textContent('body')).includes('Health Connect'));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const f = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
