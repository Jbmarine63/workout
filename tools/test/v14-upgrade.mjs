// 1.4 test: old (1.3-era) PWA with logs -> service worker update to 1.4 -> logs kept, demos filled,
// every GIF reference resolves, Road mode Demo shows the swap, Credits render, no console errors.
// Usage: serve a folder whose `workout/` entry is a symlink (OLD then NEW), e.g.
//   SRV=/tmp/srv OLD=/tmp/old NEW=$PWD SHOTS=/tmp/shots node tools/test/v14-upgrade.mjs
import { chromium, devices } from 'playwright';
import fs from 'fs';
const { SRV, OLD, NEW } = process.env; const SHOTS = (process.env.SHOTS || '/tmp/') .replace(/\/?$/, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8766/workout/';
const link = target => { try { fs.unlinkSync(SRV + '/workout'); } catch (e) {} fs.symlinkSync(target, SRV + '/workout'); };
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
link(OLD);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await ctx.newPage();
let phase = 'old';
page.on('pageerror', e => errors.push(phase + ' pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(phase + ' console: ' + m.text()); });
const ready = () => page.waitForFunction(() => window.__app && window.__app.ready);
const settle = (ms = 250) => page.waitForTimeout(ms);
await page.goto(BASE); await ready(); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await ready();
const oldCache = await page.evaluate(async () => (await caches.keys()).join());

// ---- Seed logs in the old version ----
async function startProgram(week, road) {
  await page.evaluate(async r => { const a = window.__app; a.S.settings.roadMode = r; await a.DB.kvSet('settings', a.S.settings); }, road);
  await page.goto(BASE + `#/program/w/${week}/d/MON`); await ready(); await settle();
  await page.locator('[data-act=start-program]').first().click(); await settle();
  if (await page.isVisible('#modal [data-v=finish]')) { await page.click('#modal [data-v=finish]'); await settle(); }
  await page.waitForFunction(() => location.hash.startsWith('#/go'));
  // Log two sets on the first two items, like a real workout.
  await page.evaluate(async () => {
    const a = window.__app; const s = a.S.sessions.filter(x => !x.finished).sort((x, y) => y.date - x.date)[0];
    s.items.slice(0, 2).forEach((it, i) => it.sets.push({ reps: 12 + i, weight: 10 * i, rpe: null, at: Date.now() }));
    s.finished = true; await a.DB.put('sessions', s); await a.refresh();
  });
}
await startProgram(11, false);
await startProgram(5, true);
await startProgram(8, true);
await page.evaluate(async () => {
  const a = window.__app;
  await a.DB.put('sessions', { uid: 'free1', date: Date.now(), name: 'Gym', notes: 'kept', finished: true, programWeek: null, programDay: null,
    items: [{ uid: 'i1', exName: 'Barbell Bench Press', label: 'Barbell Bench Press', groupCode: '', group: null, targetSets: null, targetReps: '', restAfterSeconds: null, workSeconds: null, notes: '', demoAsset: null, demoNote: '', sets: [{ reps: 5, weight: 185 }] }] });
  await a.DB.put('intervals', { uid: 'iv1', date: Date.now(), programWeek: 3, programDay: 'TUE', activity: 'Run', rounds: 3, done: true, durationMinutes: 19 });
  await a.refresh();
});
const snap = () => page.evaluate(async () => {
  const a = window.__app; const [s, i] = await Promise.all([a.DB.all('sessions'), a.DB.all('intervals')]);
  return { s, i };
});
const before = await snap();
const oldLib = await page.evaluate(() => ({ no: window.__app.S.library.filter(e => !e.demoAsset).length, n: window.__app.S.library.length }));
console.log('old library without GIF:', JSON.stringify(oldLib));
ok('old version: logs seeded', before.s.length === 4 && before.i.length === 1, `${before.s.length} workouts, ${before.s.reduce((n, x) => n + x.items.reduce((m, it) => m + it.sets.length, 0), 0)} sets`);

// ---- Deploy 1.4 and take the update ----
link(NEW); phase = 'new';
await page.goto(BASE + '#/more'); await ready();
await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
await page.waitForSelector('#upd', { timeout: 20000 });
ok('update banner shown', true);
await Promise.all([page.waitForEvent('load'), page.click('[data-act=sw-reload]')]);
await ready(); await settle(600);
const newCache = await page.evaluate(async () => (await caches.keys()).join());
const verOk = await page.evaluate(() => !!window.__app.upgradeDemos);
ok('service worker updated to 1.4 (new cache name, old cache deleted)', verOk && newCache !== oldCache && !newCache.includes(oldCache), `${oldCache} -> ${newCache}`);

// ---- Logs survive, only demo fields changed ----
const after = await snap();
const strip = x => x.map(s => ({ ...s, items: s.items.map(it => ({ ...it, demoAsset: null, demoNote: '' })) }));
ok('all workouts, sets and cardio entries kept', JSON.stringify(strip(before.s)) === JSON.stringify(strip(after.s)) && JSON.stringify(before.i) === JSON.stringify(after.i),
  `${after.s.length} workouts, ${after.i.length} cardio`);
const changedRows = after.s.flatMap((s, k) => s.items.filter((it, j) => it.demoAsset !== before.s[k].items[j].demoAsset || it.demoNote !== before.s[k].items[j].demoNote));
const w11 = after.s.find(s => s.programWeek === 11).items;
ok('week 11 rows upgraded (Spiderman → LottieFiles GIF, labelled)', w11.find(x => x.groupCode === 'B1').demoAsset === 'demos/spiderman_pushup_lottie.gif' && w11.find(x => x.groupCode === 'B1').demoNote === 'Demo from LottieFiles', `${changedRows.length} rows changed`);
const road = after.s.filter(s => s.roadMode).flatMap(s => s.items.filter(it => it.roadFrom));
ok('Road rows: V-ups / Mountain climbers got GIFs; all labelled "Similar demo (Road swap…)"',
  road.find(x => x.label === 'V-ups')?.demoAsset === 'demos/v_up.gif' && road.find(x => x.label === 'Mountain climbers')?.demoAsset === 'demos/mountain_climbers.gif' && road.every(x => !x.demoAsset || x.demoNote.startsWith('Similar demo (Road swap')),
  road.map(x => `${x.label}=${x.demoAsset}`).join('; '));
ok('free workout row got the library GIF', after.s.find(s => s.uid === 'free1').items[0].demoAsset === 'demos/barbellbenchpress.gif');
ok('upgrade is idempotent', await page.evaluate(() => window.__app.upgradeDemos()) === 0);

// ---- Every GIF reference resolves ----
const refs = await page.evaluate(async () => {
  const a = window.__app; const P = a.S.program;
  const list = new Set();
  P.weeks.forEach(w => w.groups.forEach(g => g.exercises.forEach(e => { if (e.demoGif) list.add(e.demoGif); const sw = a.roadSwap(e); if (sw) { const d = a.roadDemo(sw); if (d) list.add(d); else list.add('MISSING road demo: ' + sw.name); } })));
  Object.values(P.libraryDemos || {}).forEach(x => list.add(x)); Object.keys(P.demoSources || {}).forEach(x => list.add(x));
  a.S.seed.forEach(e => e.demoGif && list.add(e.demoGif)); a.S.library.forEach(e => e.demoAsset && list.add(e.demoAsset));
  (a.S.workouts.days || []).forEach(d => (d.exercises || []).forEach(x => x.demoGif && list.add(x.demoGif)));
  const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = src; });
  const arr = [...list]; const r = await Promise.all(arr.map(load));
  const cached = (await (await caches.open((await caches.keys())[0])).keys()).filter(q => q.url.endsWith('.gif')).length;
  const seedNames = a.S.seed.map(e => e.name);
  return { n: arr.length, bad: arr.filter((x, k) => !r[k]), cached, libNo: a.S.library.filter(e => !e.demoAsset).length, lib: a.S.library.length,
    seedMissing: seedNames.filter(n => !a.S.libByKey.get(n.toLowerCase())?.demoAsset),
    alias: a.S.libByKey.get('alternating spil jump')?.demoAsset === a.S.libByKey.get('alternating split squat jump')?.demoAsset && !!a.S.libByKey.get('jump squat')?.demoAsset,
    similarInLib: P.weeks.flatMap(w => w.groups.flatMap(g => g.exercises)).filter(e => e.demoMatch === 'similar' && a.S.libByKey.get(e.exerciseName.toLowerCase())?.demoAsset === e.demoGif && !a.libraryDemoFor(e.exerciseName)).length };
});
ok('every GIF reference resolves and loads; 99 GIFs precached', refs.bad.length === 0 && refs.cached === 99, JSON.stringify({ n: refs.n, bad: refs.bad.slice(0, 5), cached: refs.cached }));
ok('library: 15 gym lifts + Walking Lunge/Plank/Pull-Up have GIFs; aliases resolve; no "similar" GIFs', refs.seedMissing.length === 0 && refs.alias && refs.similarInLib === 0,
  `library without GIF: ${refs.libNo}/${refs.lib}; seed missing: ${refs.seedMissing.join(',')}`);

// ---- Screens ----
await page.evaluate(async () => { const a = window.__app; a.S.settings.roadMode = true; await a.DB.kvSet('settings', a.S.settings); });
await page.goto(BASE + '#/program/w/5/d/MON'); await ready(); await settle();
const roadEx = page.locator('.prog-ex', { hasText: 'V-ups' }).first();
await roadEx.locator('details summary', { hasText: 'Demo' }).click(); await settle(500);
const rd = await roadEx.evaluate(el => ({ sum: el.querySelector('details[open] summary').textContent, src: el.querySelector('details[open] img').getAttribute('src'), ok: el.querySelector('details[open] img').naturalWidth > 0 }));
ok('Road mode: Program Demo shows the swap with "Similar demo (Road swap)" label', rd.src === 'demos/v_up.gif' && rd.ok && /Similar demo \(Road swap/.test(rd.sum), JSON.stringify(rd));
await roadEx.scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOTS + '01-road-mode-demo-week5.png' });
await page.evaluate(async () => { const a = window.__app; a.S.settings.roadMode = false; await a.DB.kvSet('settings', a.S.settings); });
await page.goto(BASE + '#/program/w/11/d/MON'); await ready(); await settle();
const b1 = page.locator('.prog-ex', { hasText: 'Spiderman pushups' }).first();
await b1.locator('details summary', { hasText: 'Demo' }).click(); await settle(500);
const lab = await b1.locator('details[open] summary').textContent();
ok('program demo labelled with its source', /Demo from LottieFiles/.test(lab), lab);
await b1.scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOTS + '02-program-week11-new-demo.png' });
await page.goto(BASE + '#/exercises'); await ready(); await page.fill('#exSearch', 'barbell bench'); await settle();
await page.locator('#exList > .ex:not(.hidden) details summary').first().click(); await settle(500);
const exTxt = await page.locator('#exList > .ex:not(.hidden)').first().textContent();
ok('Exercises: gym lift shows GIF + source credit', /Demo from FitnessGenerator library/.test(exTxt));
await page.screenshot({ path: SHOTS + '03-exercises-bench-press.png' });
await page.goto(BASE + '#/more'); await ready();
const verTxt = await page.textContent('#view');
await page.click('#creditsLink'); await settle();
const cr = await page.evaluate(() => ({ cards: document.querySelectorAll('#credits .credit').length, links: document.querySelectorAll('#credits a[href^="https://"]').length, t: document.querySelector('#credits').textContent }));
ok('Settings shows "Workout 1.4" and Credits & licenses renders', /Workout 1\.4/.test(verTxt) && cr.cards === 7 && cr.links === 11 && /RickyBennison/.test(cr.t) && /Dinh Bui Xuan/.test(cr.t) && /AscendAPI/.test(cr.t), `${cr.cards} cards, ${cr.links} links`);
await page.screenshot({ path: SHOTS + '04-credits.png', fullPage: true });
// Offline after the update
await ctx.setOffline(true);
await page.goto(BASE + '#/history'); await ready();
ok('offline after update: history readable', (await page.$$('.hist-session')).length >= 4);
await ctx.setOffline(false);
ok('no console errors (old and new versions)', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
console.log(`\n${results.filter(r => r[0] === 'PASS').length}/${results.length} passed`);
fs.writeFileSync(SHOTS + 'results.json', JSON.stringify({ results, errors }, null, 1));
