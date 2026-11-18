// 1.5.1 test: colour schemes (More -> Settings -> Color scheme), persistence, light/dark variants, fallback.
// Serve the parent folder:  (cd .. && python3 -m http.server 8765)  then  node tools/test/themes.mjs [baseUrl]
import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'http://127.0.0.1:8765/workout-pwa-v15/';
const results = []; const errors = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ready = () => page.waitForFunction(() => window.__app && window.__app.ready);
const vars = () => page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { accent: cs.getPropertyValue('--accent').trim(), blue: cs.getPropertyValue('--blue').trim(), scheme: document.documentElement.dataset.scheme, theme: document.documentElement.dataset.theme }; });
const EXPECT = {
  default: { dark: ['#ff7a1a', '#5cc8ff'], light: ['#c2410c', '#0b74b8'] },
  marine: { dark: ['#ff5252', '#ffc72c'], light: ['#b3121b', '#7d5c00'] },
  army: { dark: ['#a3b86c', '#d9bf8c'], light: ['#4b5320', '#7a5c22'] },
  navy: { dark: ['#7aa2ff', '#f2c14e'], light: ['#1f3a7a', '#7d5c00'] },
  airforce: { dark: ['#8fa8ff', '#c0c6cf'], light: ['#00308f', '#5a6370'] },
};
await page.goto(BASE + '#/more'); await ready();
ok('default scheme on first run', (await vars()).scheme === 'default');
const opts = await page.$$eval('select[data-setting=colorScheme] option', os => os.map(o => [o.value, o.textContent]));
ok('picker lists 5 schemes in order', JSON.stringify(opts) === JSON.stringify([['default', 'Default'], ['marine', 'Marine'], ['army', 'Army'], ['navy', 'Navy'], ['airforce', 'Air Force']]), JSON.stringify(opts));
for (const theme of ['dark', 'light']) {
  await page.selectOption('select[data-setting=theme]', theme);
  for (const [k, e] of Object.entries(EXPECT)) {
    await page.selectOption('select[data-setting=colorScheme]', k); await page.waitForTimeout(60);
    const v = await vars();
    ok(`${k}/${theme} css vars`, v.scheme === k && v.theme === theme && v.accent === e[theme][0] && v.blue === e[theme][1], JSON.stringify(v));
  }
}
// The accent actually reaches a primary button.
await page.selectOption('select[data-setting=theme]', 'dark');
await page.selectOption('select[data-setting=colorScheme]', 'marine');
const btnBg = await page.$eval('button.primary', b => getComputedStyle(b).backgroundColor);
ok('primary button uses scheme accent', btnBg === 'rgb(255, 82, 82)', btnBg);
// Persisted in IndexedDB settings and survives a reload.
await page.reload(); await ready();
ok('choice survives reload', (await vars()).scheme === 'marine' && await page.evaluate(() => window.__app.S.settings.colorScheme) === 'marine');
const stored = await page.evaluate(() => window.__app.DB.kvGet('settings', {}));
ok('stored in kv settings (no new store)', stored.colorScheme === 'marine');
ok('IndexedDB still version 2', await page.evaluate(() => new Promise(r => { const q = indexedDB.open('workout-pwa'); q.onsuccess = () => { const v = q.result.version; q.result.close(); r(v === 2); }; })));
ok('theme-color follows the background', await page.$eval('#themeColor', m => m.content) === '#0e1012');
ok('backup includes colorScheme', await page.evaluate(() => JSON.parse(window.__app.buildBackup().json).settings?.colorScheme === 'marine'));
// Unknown value (old/hand-edited backup) falls back to Default.
await page.evaluate(async () => { const a = window.__app; a.S.settings.colorScheme = 'pink'; await a.DB.kvSet('settings', a.S.settings); });
await page.reload(); await ready();
ok('unknown value falls back to default', (await vars()).scheme === 'default' && await page.$eval('select[data-setting=colorScheme]', s => s.value).catch(() => 'n/a') !== 'pink');
ok('version shows 1.5.2', (await page.textContent('body')).includes('Workout 1.5.2'));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
