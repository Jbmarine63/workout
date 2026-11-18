// 1.5.2 test: the 51 new Recovery / Stretch / Routine GIFs load (HTTP 200 + decoded), are precached by sw.js, and are credited.
// Serve the parent folder:  (cd .. && python3 -m http.server 8765)  then  node tools/test/v152.mjs [baseUrl] [shotDir]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/workout-pwa-v15/';
const SHOTS = process.argv[3] || '/workspace/workout-pwa-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const R = await (await fetch(BASE + 'data/recovery.json')).json();
const moves = [...R.areas.flatMap(a => a.exercises), ...(R.swapMoves || []), ...R.stretching.dynamic, ...R.stretching.static, ...R.routines.flatMap(r => r.items)];
const withGif = moves.filter(m => m.gif);
ok('77 moves have a GIF (26 + 51 new)', withGif.length === 77, String(withGif.length));
const files = [...new Set(withGif.map(m => m.gif))];
const codes = [];
for (const f of files) { const r = await fetch(BASE + f); const b = await r.arrayBuffer(); codes.push([f, r.status, r.headers.get('content-type'), b.byteLength]); }
const bad = codes.filter(([, s, t, n]) => s !== 200 || !/gif/.test(t || '') || n < 1000);
ok(`every recovery gif URL is 200 image/gif (${files.length} files)`, bad.length === 0, JSON.stringify(bad));
const sw = await (await fetch(BASE + 'sw.js')).text();
ok('every recovery gif is in the SW precache list', files.every(f => sw.includes(`"${f}"`)));
const credited = new Set(R.gifCredits.map(g => g.file));
ok('every recovery gif has a gifCredits entry', files.every(f => credited.has(f)) && credited.size === 57, String(credited.size));
ok('Ba Duan Jin stays text-only', R.routines.find(r => r.key === 'baduanjin').items.every(i => !i.gif));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const settle = (ms = 300) => page.waitForTimeout(ms);
const imgsOk = () => page.evaluate(async () => { const im = [...document.querySelectorAll('#view img')]; await Promise.all(im.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); return { n: im.length, broken: im.filter(i => !i.naturalWidth).map(i => i.src) }; });
await page.goto(BASE); await page.waitForFunction(() => window.__app && window.__app.ready);
await page.goto(BASE + '#/recovery'); await settle();
for (const k of ['knee', 'ankle', 'hip', 'back', 'shoulder']) { const b = page.locator(`[data-act=area-open][data-k=${k}]`); if (await b.count() && (await b.textContent()).includes('Show')) { await b.click(); await settle(150); } }
let r1 = await imgsOk();
ok('Recovery areas: all thumbnails decode', r1.n === R.areas.flatMap(a => a.exercises).filter(e => e.gif).length && r1.n === 38 && r1.broken.length === 0, JSON.stringify(r1));
await page.evaluate(() => document.querySelector('a[href="#/recovery/ex/hip_01"]').scrollIntoView({ block: 'start' })); await settle();
await page.screenshot({ path: SHOTS + '/v152-recovery-hips.png' });
await page.goto(BASE + '#/recovery/stretch'); await settle(500);
const r2 = await imgsOk();
ok('Stretch tab: all thumbnails decode', r2.n >= 16 && r2.broken.length === 0, JSON.stringify(r2));
await page.screenshot({ path: SHOTS + '/v152-stretch-warmup.png' });
await page.evaluate(() => document.querySelector('[data-act=stretch-info][data-id=static_01]').scrollIntoView({ block: 'start' })); await settle();
await page.screenshot({ path: SHOTS + '/v152-stretch-static.png' });
await page.goto(BASE + '#/recovery/ex/back_03'); await settle(600);
const r3 = await imgsOk();
ok('Exercise detail (bird dog) shows the GIF', r3.n >= 1 && r3.broken.length === 0, JSON.stringify(r3));
await page.screenshot({ path: SHOTS + '/v152-birddog-dark.png' });
await page.goto(BASE + '#/credits'); await settle();
const cr = await page.textContent('#view');
ok('Credits: 57 Recovery GIF credits', (cr.match(/Recovery GIF:/g) || []).length === 57);
ok('Credits: new source lines', ['Shim Eu-ddeum', 'CC BY 3.0', 'EJERCICIO DE CODMAN', 'Md kamrujjamandesigner', 'saagar shrestha', 'kat frost', '1.5.2: 10 Recovery', '1.5.2: 12 Recovery'].every(s => cr.includes(s)));
await page.goto(BASE + '#/more'); await settle();
ok('version shows 1.5.2', (await page.textContent('#view')).includes('Workout 1.5.2'));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
