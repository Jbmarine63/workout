import { chromium, devices } from 'playwright';
import fs from 'fs';
const BASE = 'http://127.0.0.1:8765/workout-pwa/';
const SHOTS = '/workspace/workout-pwa-shots/';
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const settle = () => page.waitForTimeout(200);
const ready = () => page.waitForFunction(() => window.__app && window.__app.ready);
await page.goto(BASE); await ready();
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); await ready();
ok('service worker controls page', await page.evaluate(() => !!navigator.serviceWorker.controller));
ok('a2hs hint shown on iOS UA in browser', await page.isVisible('#a2hs'));
await page.screenshot({ path: SHOTS + '01-program-week1.png' });
const prog = JSON.parse(fs.readFileSync('/workspace/workout-pwa/data/program16.json', 'utf8'));
// precache completeness
const cacheInfo = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); const reqs = await c.keys(); return { ks, n: reqs.length, gifs: reqs.filter(r => r.url.endsWith('.gif')).length, prog: reqs.some(r => r.url.endsWith('program16.json')) }; });
ok('precache has all GIFs + program16.json', cacheInfo.gifs === 60 && cacheInfo.prog, JSON.stringify(cacheInfo));
// all weeks & days
let bad = [];
for (const w of prog.weeks) {
  await page.click(`[data-act=pick-week][data-w="${w.week}"]`); await settle();
  const subs = await page.$$eval('#subs li', els => els.length).catch(() => 0);
  if (subs !== w.substitutions.length) bad.push(`w${w.week} subs ${subs}/${w.substitutions.length}`);
  const subText = await page.textContent('#weekHeader');
  for (const s of w.substitutions) if (!subText.includes(s)) bad.push(`w${w.week} missing sub text`);
  for (const n of w.appNotes) if (!subText.includes(n)) bad.push(`w${w.week} missing app note`);
  for (const d of w.days) {
    await page.click(`[data-act=pick-day][data-d="${d.day}"]`); await settle();
    const dc = await page.$eval('#dayContent', el => ({ w: el.dataset.week, d: el.dataset.day, ex: el.querySelectorAll('.prog-ex').length, iv: !!el.querySelector('#intervalDay'), rest: !!el.querySelector('#restDay'), text: el.textContent }));
    const nEx = w.groups.reduce((a, g) => a + g.exercises.length, 0);
    if (dc.w != w.week || dc.d !== d.day) bad.push(`w${w.week}${d.day} wrong selection`);
    if (d.type === 'resistance') {
      if (dc.ex !== nEx) bad.push(`w${w.week}${d.day} ex ${dc.ex}/${nEx}`);
      const codes = w.groups.flatMap(g => g.exercises.map(e => e.code));
      let pos = -1; for (const c of codes) { const p = dc.text.indexOf(c, pos + 1); if (p < 0) { bad.push(`w${w.week} code order ${c}`); break; } pos = p; }
    }
    if (d.type === 'interval' && !(dc.iv && dc.text.includes(`${w.interval.rounds} rounds`))) bad.push(`w${w.week}${d.day} interval`);
    if (d.type === 'rest' && !dc.rest) bad.push(`w${w.week}${d.day} rest`);
  }
}
ok('all 16 weeks x 7 days render correctly (order, subs, app notes, cardio, rest)', bad.length === 0, bad.slice(0, 8).join('; '));
await page.click('[data-act=pick-week][data-w="5"]'); await settle(); await page.click('[data-act=pick-day][data-d="MON"]'); await settle();
await page.screenshot({ path: SHOTS + '02-program-week5-circuit.png', fullPage: false });
await page.click('[data-act=pick-week][data-w="1"]'); await settle(); await page.click('[data-act=pick-day][data-d="MON"]'); await settle();
await page.evaluate(() => document.querySelector('#dayContent').scrollIntoView());
await page.locator('#dayContent details summary', { hasText: 'Show demo' }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: SHOTS + '03-program-week1-mon-routine.png' });
// start session
await page.locator('[data-act=start-program]').first().click(); await settle();
await page.waitForSelector('#sessionView');
const nItems = await page.$$eval('#sessionView .ex[data-i]', e => e.length);
ok('week 1 Monday session preloaded with 6 exercises', nItems === 6, String(nItems));
const firstTitles = await page.$$eval('#sessionView .ex-title', e => e.map(x => x.textContent));
ok('session order matches page (A1 Standard pushups first, C2 last)', firstTitles[0] === 'Standard pushups' && firstTitles.length === 6, firstTitles.join(' | '));
await page.click('.ex[data-i="0"] [data-act=log-set]'); await settle();
const hint1 = await page.textContent('#hint');
ok('A1 set logged -> no-rest-inside-superset prompt', /No rest inside the superset.*A2/.test(hint1), hint1);
ok('set row saved with target reps 20', await page.inputValue('.ex[data-i="0"] input[data-k=reps]') === '20');
await page.click('.ex[data-i="1"] [data-act=log-set]'); await settle();
const hint2 = await page.textContent('#hint');
ok('A2 set -> rest 60s then back to A1 round 2', /Rest 60s, then A1 .*round 2 of 3/.test(hint2), hint2);
ok('rest timer running', await page.isVisible('#timerbar') && /Rest/.test(await page.textContent('#tbLabel')));
await page.screenshot({ path: SHOTS + '04-session-rest-timer.png' });
// timer pause / adjust
await page.click('[data-act=timer-pause]'); await settle();
const r1 = await page.evaluate(() => window.__app.Timer.remainingMs());
await page.waitForTimeout(1200);
const r2 = await page.evaluate(() => window.__app.Timer.remainingMs());
ok('pause freezes remaining time', Math.abs(r1 - r2) < 5, `${r1} ${r2}`);
await page.click('[data-act=timer-adj][data-d="15"]'); await settle();
const r3 = await page.evaluate(() => window.__app.Timer.remainingMs());
ok('+15s adjusts', Math.abs(r3 - r1 - 15000) < 50, `${r3}`);
await page.click('[data-act=timer-pause]'); await settle();
// timestamp-based: simulate 2 minutes passing while backgrounded
await page.evaluate(() => { const t = window.__app.Timer; t.stopLoop(); t.st.endAt -= 120000; });
await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
ok('timer uses timestamps (done after simulated background time)', await page.evaluate(() => window.__app.Timer.st.done === true));
// persisted timer survives reload
await page.click('[data-act=t-rest]'); await settle();
await page.reload(); await ready();
ok('running timer survives reload', await page.evaluate(() => !!window.__app.Timer.st && !window.__app.Timer.st.done) && await page.isVisible('#timerbar'));
await page.click('[data-act=timer-skip]'); await settle();
// edit item 0
await page.click('.ex[data-i="0"] .itemmenu summary'); await settle();
await page.click('.ex[data-i="0"] [data-act=edit]'); await settle();
await page.fill('#e_reps', '25'); await page.fill('#e_sets', '4'); await page.fill('#e_rest', '10'); await page.fill('#e_work', '30');
await page.click('[data-act=edit-save]'); await settle();
const tl = await page.textContent('.ex[data-i="0"] .target');
ok('edit sets/reps/rest/work', /4 × 25 · rest 10 s after · work 30 s/.test(tl), tl);
ok('work timer chip appears', await page.isVisible('.ex[data-i="0"] [data-act=t-work]'));
// swap item 2
await page.click('.ex[data-i="2"] .itemmenu summary'); await settle(); await page.click('.ex[data-i="2"] [data-act=swap]'); await settle();
await page.fill('#pickSearch', 'jump squat');
await page.locator('#pickList [data-act=modal-val]:not(.hidden)').first().click(); await settle();
const t2 = await page.textContent('.ex[data-i="2"] .ex-title'); const n2 = await page.textContent('.ex[data-i="2"]');
ok('swap exercise', /jump squat/i.test(t2) && /Swapped in for: Stationary Lunges/.test(n2), t2);
// move down item 0
await page.click('.ex[data-i="0"] .itemmenu summary'); await settle(); await page.click('.ex[data-i="0"] [data-act=move][data-d="1"]'); await settle();
const tm = await page.$$eval('#sessionView .ex-title', e => e.map(x => x.textContent));
ok('move down', tm[0] === 'Body Squat' && tm[1] === 'Standard pushups', tm.slice(0, 2).join(','));
// add exercise
await page.click('[data-act=add-ex]'); await settle(); await page.fill('#pickSearch', 'plank');
await page.locator('#pickList [data-act=modal-val]:not(.hidden)').first().click(); await settle();
ok('add exercise', (await page.$$eval('#sessionView .ex[data-i]', e => e.length)) === 7);
// remove with confirm (item 1 has a logged set)
await page.click('.ex[data-i="1"] .itemmenu summary'); await settle(); await page.click('.ex[data-i="1"] [data-act=remove]'); await settle();
ok('remove asks to confirm when sets logged', await page.isVisible('#modal .sheet') && /deletes the 1 set/.test(await page.textContent('#modal')));
await page.screenshot({ path: SHOTS + '05-remove-confirm.png' });
await page.click('#modal [data-v=""]'); await settle();
ok('cancel keeps item', (await page.$$eval('#sessionView .ex[data-i]', e => e.length)) === 7);
await page.click('.ex[data-i="6"] .itemmenu summary'); await settle(); await page.click('.ex[data-i="6"] [data-act=remove]'); await settle();
ok('remove without sets (no confirm)', (await page.$$eval('#sessionView .ex[data-i]', e => e.length)) === 6);
// edit logged set reps
await page.fill('.ex[data-i="0"] input[data-k=reps]', '18'); await page.press('.ex[data-i="0"] input[data-k=reps]', 'Tab'); await settle();
await page.waitForTimeout(200);
ok('edit logged set persists', await page.evaluate(() => window.__app.S.sessions[0].items[0].sets[0].reps === 18));
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: SHOTS + '06-session-edited.png' });
await page.click('[data-act=finish]'); await settle();
await page.waitForSelector('.hist-session');
ok('finished workout in History', (await page.$$('.hist-session')).length === 1);
// interval
await page.goto(BASE + '#/program/w/3/d/TUE'); await ready();
await page.click('[data-act=open-interval]'); await settle();
await page.fill('[data-ifield=activity]', 'Run / sprint'); await page.press('[data-ifield=activity]', 'Tab'); await settle();
await page.click('[data-act=interval-start]'); await settle();
ok('interval timer starts with warm-up', /Warm up/.test(await page.textContent('#tbLabel')));
await page.evaluate(() => { const t = window.__app.Timer; t.st.endAt -= (5 * 60 + 60 + 30) * 1000; t.tick(); });
const lab = await page.textContent('#tbLabel');
ok('interval phases chain by timestamp (skipped warm-up + high -> moderate r1)', /Moderate — round 1 of 3/.test(lab), lab);
await page.screenshot({ path: SHOTS + '07-interval-timer.png' });
await page.click('[data-act=timer-skip]'); await settle();
ok('skip to next phase', /High intensity — round 2 of 3/.test(await page.textContent('#tbLabel')));
await page.fill('[data-ifield=notes]', 'felt good'); await page.press('[data-ifield=notes]', 'Tab'); await settle();
await page.click('[data-act=interval-save]'); await settle();
await page.waitForSelector('.hist-interval');
const hi = await page.textContent('.hist-interval');
ok('interval entry saved & in History', /Week 3 · Tue/.test(hi) && /Run \/ sprint/.test(hi) && /3 rounds/.test(hi), hi.replace(/\s+/g, ' '));
await page.screenshot({ path: SHOTS + '08-history.png' });
// edit interval
await page.click('.hist-interval'); await settle(); await page.fill('[data-ifield=durationMinutes]', '21'); await page.press('[data-ifield=durationMinutes]', 'Tab'); await settle();
await page.click('[data-act=interval-save]'); await settle(); await page.waitForSelector('.hist-interval');
ok('interval edit saved', /21 min/.test(await page.textContent('.hist-interval')));
// export
await page.goto(BASE + '#/more'); await ready();
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export-share]')]);
const p = await dl.path(); const exported = JSON.parse(fs.readFileSync(p, 'utf8'));
ok('export JSON (share falls back to download)', exported.app === 'workout-pwa' && exported.sessions.length === 1 && exported.intervals.length === 1, dl.suggestedFilename());
fs.copyFileSync(p, '/tmp/backup.json');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export-csv]')]);
const csv = fs.readFileSync(await dl2.path(), 'utf8');
ok('CSV export', csv.startsWith('type,date') && csv.split('\r\n').length >= 3, csv.split('\r\n').length + ' lines');
await page.screenshot({ path: SHOTS + '09-more-backup.png' });
// delete interval then merge-import
await page.goto(BASE + '#/history'); await page.click('.hist-interval'); await settle(); await page.click('[data-act=interval-del]'); await settle();
await page.click('#modal [data-v=ok]'); await settle(); await page.waitForTimeout(300);
ok('delete interval with confirm', await page.evaluate(() => window.__app.S.intervals.length === 0));
await page.goto(BASE + '#/more'); await ready();
await page.setInputFiles('#importFile', '/tmp/backup.json');
await page.waitForSelector('#modal .sheet'); await page.click('#modal [data-v=merge]'); await settle(); await page.waitForTimeout(500);
let st = await page.evaluate(() => ({ s: window.__app.S.sessions.length, i: window.__app.S.intervals.length }));
ok('import merge restores missing entry without duplicating', st.s === 1 && st.i === 1, JSON.stringify(st));
// replace
await page.setInputFiles('#importFile', '/tmp/backup.json');
await page.waitForSelector('#modal .sheet'); await page.click('#modal [data-v=replace]'); await settle();
await page.waitForSelector('#modal [data-v=ok]'); await page.click('#modal [data-v=ok]'); await settle(); await page.waitForTimeout(500);
st = await page.evaluate(() => ({ s: window.__app.S.sessions.length, i: window.__app.S.intervals.length, sets: window.__app.S.sessions[0].items.reduce((a, x) => a + x.sets.length, 0) }));
ok('import replace round-trips', st.s === 1 && st.i === 1 && st.sets === 2, JSON.stringify(st));
// exercises tab
await page.goto(BASE + '#/exercises'); await ready();
const libN = await page.$$eval('#exList > .ex', e => e.length);
await page.fill('#exSearch', 'pushup');
const vis = await page.$$eval('#exList > .ex:not(.hidden)', e => e.length);
ok('exercise library + search', libN > 50 && vis > 0 && vis < libN, `${libN} total, ${vis} match "pushup"`);
await page.locator('#exList > .ex:not(.hidden) details summary').first().click(); await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + '10-exercises.png' });
await page.locator('#exList > .ex:not(.hidden) [data-act=ex-add]').first().click(); await settle();
ok('pick exercise into new session', await page.evaluate(() => window.__app.S.sessions.some(s => !s.finished && s.items.length === 1)));
// offline
await ctx.setOffline(true);
await page.goto(BASE + '#/program/w/9/d/MON'); await ready();
ok('offline reload works', await page.isVisible('#weekHeader') && await page.isVisible('#offlineBadge'));
const gifRes = await page.evaluate(async () => {
  const list = await (await fetch('data/program16.json')).json();
  const srcs = [...new Set(list.weeks.flatMap(w => w.groups.flatMap(g => g.exercises.map(e => e.demoGif).filter(Boolean))))];
  const all = (await (await caches.open((await caches.keys())[0])).keys()).map(r => r.url).filter(u => u.endsWith('.gif'));
  const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = src; });
  const r = await Promise.all(all.map(load));
  return { referenced: srcs.length, total: all.length, loaded: r.filter(Boolean).length };
});
ok('all GIFs load offline', gifRes.loaded === gifRes.total && gifRes.total === 60, JSON.stringify(gifRes));
await page.locator('#dayContent details summary', { hasText: 'Show demo' }).first().click(); await page.waitForTimeout(300);
const imgOk = await page.$eval('#dayContent details[open] img', i => i.complete && i.naturalWidth > 0);
ok('demo GIF renders in UI offline', imgOk);
await page.evaluate(() => document.querySelector('#dayContent details[open]').scrollIntoView());
await page.screenshot({ path: SHOTS + '11-offline-week9-demo.png' });
await page.goto(BASE + '#/history'); await ready();
ok('offline history readable', (await page.$$('.hist-session')).length >= 1);
await ctx.setOffline(false);
// light theme screenshot
const ctx2 = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'light' });
const p2 = await ctx2.newPage(); await p2.goto(BASE + '#/program/w/13/d/WED'); await p2.waitForFunction(() => window.__app && window.__app.ready);
await p2.screenshot({ path: SHOTS + '12-light-theme-week13.png' });
const manifestOk = await p2.evaluate(async () => { const m = await (await fetch('manifest.webmanifest')).json(); return m.display === 'standalone' && m.icons.map(i => i.sizes).join(); });
ok('manifest standalone + icons', !!manifestOk, String(manifestOk));
ok('no JS errors', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
fs.writeFileSync('/workspace/pwa-test/results.json', JSON.stringify({ results, errors }, null, 1));
console.log(`\n${results.filter(r => r[0] === 'PASS').length}/${results.length} passed`);
