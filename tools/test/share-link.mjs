// WebKit + iPhone emulation for More → Share this app.
// Covers the system share sheet, user cancel, copy, a denied/missing clipboard,
// and the manual-copy sheet. Runs the same checks in a Safari tab and in a
// standalone Home Screen context. This is emulator coverage, not a physical iPhone.
//
//   BASE=http://127.0.0.1:8765/ SHOTS=/tmp/share-shots node tools/test/share-link.mjs
import { webkit, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const SHOTS = (process.env.SHOTS || '/tmp/share-shots').replace(/\/?$/, '/');
fs.mkdirSync(SHOTS, { recursive: true });
const CANONICAL = 'https://jbmarine63.github.io/workout/';
const results = [];
const errors = [];
const ok = (name, cond, extra = '') => {
  results.push([cond ? 'PASS' : 'FAIL', name, extra]);
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

const src = fs.readFileSync(new URL('../../js/app.js', import.meta.url), 'utf8');
const shareCase = src.slice(src.indexOf("case 'share-app'"), src.indexOf("case 'copy-link'"));
ok('share sheet starts before any await in the tap', shareCase.indexOf('startShare()') !== -1 && shareCase.indexOf('startShare()') < shareCase.indexOf('await'));
const startFn = src.slice(src.indexOf('function startShare'), src.indexOf('function tryExecCopy'));
ok('startShare calls navigator.share directly', startFn.includes('navigator.share(sharePayload())') && !startFn.includes('await'));
const copyFn = src.slice(src.indexOf('function copyShareUrl'), src.indexOf('function selectShareField'));
ok('copy starts writeText before it returns', copyFn.indexOf('writeText(SHARE_URL)') !== -1 && copyFn.indexOf('writeText(SHARE_URL)') < copyFn.indexOf('return pending'));
const sw = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
ok('service worker cache was rebuilt', /const VERSION = '[0-9a-f]{12}'/.test(sw) && !sw.includes("const VERSION = '094fd542e0db'"));
ok('service worker still precaches 99 GIFs', (sw.match(/demos\/[^"]+\.gif/g) || []).length === 99);
const gifs = fs.readdirSync(new URL('../../demos/', import.meta.url)).filter(n => n.endsWith('.gif'));
ok('demo folder still has 99 GIFs', gifs.length === 99);
for (const name of ['burpees.gif', 'spiderman_pushup_lottie.gif', 'hindu_pushup_dand_commons.gif', 'handstand_pushup_edb.gif']) {
  ok('kept ' + name, gifs.includes(name));
}

const browser = await webkit.launch();
const contexts = [];

async function makePage(label) {
  const standalone = label === 'home';
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark', hasTouch: true, isMobile: true });
  contexts.push(ctx);
  await ctx.addInitScript(flag => {
    if (flag) {
      try { Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get() { return true; } }); }
      catch (e) { /* instance override below */ }
    }
    const stub = { mode: 'success', clip: 'ok', exec: 'fail', calls: [], clips: [], execs: [], installError: '' };
    window.__shareStub = stub;
    function share(data) {
      stub.calls.push({
        data,
        active: navigator.userActivation ? navigator.userActivation.isActive : null,
        standalone: navigator.standalone === true
      });
      if (stub.mode === 'success') return Promise.resolve();
      if (stub.mode === 'cancel') return Promise.reject(new DOMException('Share canceled', 'AbortError'));
      if (stub.mode === 'hang') return stub.hang;
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    }
    try { Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: share }); }
    catch (e) { stub.installError += 'share ' + e; }
    if (flag) {
      try { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); }
      catch (e) { stub.installError += 'standalone ' + e; }
    }
    const clip = {
      writeText(text) {
        stub.clips.push({ text, active: navigator.userActivation ? navigator.userActivation.isActive : null });
        if (stub.clip === 'ok') return Promise.resolve();
        return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      }
    };
    try {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get() { return stub.clip === 'absent' ? undefined : clip; } });
    } catch (e) { stub.installError += 'clip ' + e; }
    const orig = Document.prototype.execCommand;
    Document.prototype.execCommand = function (cmd) {
      if (cmd === 'copy') {
        stub.execs.push(cmd);
        return stub.exec === 'ok';
      }
      return orig.apply(this, arguments);
    };
  }, standalone);
  const page = await ctx.newPage();
  const bucket = [];
  page.on('pageerror', e => {
    // Headless WebKit has no audio output. The existing tap handler creates an
    // AudioContext, which throws here. It is not part of sharing.
    if (/Failed to start the audio device/.test(e.message)) return;
    const m = label + ' pageerror: ' + e.message; bucket.push(m); errors.push(m);
  });
  page.on('console', m => { if (m.type() === 'error') { const t = label + ' console: ' + m.text(); bucket.push(t); errors.push(t); } });
  page.__errs = bucket;
  await page.goto(BASE + '#/more');
  await page.waitForFunction(() => window.__app && window.__app.ready);
  await page.waitForSelector('#shareApp');
  return page;
}

async function reset(page, opts = {}) {
  await page.evaluate(o => {
    const s = window.__shareStub;
    s.mode = o.mode || 'success';
    s.clip = o.clip || 'ok';
    s.exec = o.exec || 'fail';
    s.calls.length = 0;
    s.clips.length = 0;
    s.execs.length = 0;
    s.hang = new Promise(r => { s.release = r; });
    const modal = document.querySelector('#modal');
    modal.hidden = true; modal.innerHTML = '';
    const toast = document.querySelector('#toast');
    toast.hidden = true; toast.textContent = '';
    const btn = document.querySelector('#shareApp');
    if (btn) delete btn.dataset.busy;
  }, opts);
}
const stub = page => page.evaluate(() => window.__shareStub);
const toast = page => page.locator('#toast').evaluate(el => el.hidden ? '' : el.textContent);
const modalOpen = page => page.locator('#modal').evaluate(el => !el.hidden);

for (const label of ['tab', 'home']) {
  const page = await makePage(label);
  const where = label === 'home' ? 'Home Screen' : 'Safari tab';
  const installed = await page.evaluate(() => ({
    installError: window.__shareStub.installError,
    share: typeof navigator.share,
    standalone: navigator.standalone === true,
    homeText: document.body.innerText.includes('running from Home Screen'),
    tabText: document.body.innerText.includes('running in the browser'),
    url: window.__app.SHARE_URL
  }));
  ok(where + ': share stub installed', installed.installError === '' && installed.share === 'function', installed.installError);
  ok(where + ': canonical url', installed.url === CANONICAL && (await page.locator('.share-url').innerText()) === CANONICAL);
  ok(where + ': backup share stays a separate button', await page.locator('[data-act=export-share]').count() === 1);
  if (label === 'home') ok(where + ': standalone flag', installed.standalone === true && installed.homeText);
  else ok(where + ': browser tab flag', installed.standalone === false && installed.tabText);
  await page.locator('#shareCard').screenshot({ path: SHOTS + 'share-card-' + label + '.png' });
  await page.screenshot({ path: SHOTS + 'more-' + label + '.png' });

  await reset(page, { mode: 'success', clip: 'ok' });
  await page.tap('#shareApp');
  await page.waitForFunction(() => window.__shareStub.calls.length === 1);
  let s = await stub(page);
  const data = s.calls[0].data;
  ok(where + ': Share calls navigator.share with the canonical url',
    data && data.url === CANONICAL && data.title === 'Workout' && !data.files && !data.text && s.clips.length === 0,
    JSON.stringify(data));
  ok(where + ': share ran during the tap', s.calls[0].active === true, 'userActivation=' + s.calls[0].active);
  ok(where + ': successful share does not copy or open a sheet', (await toast(page)) === '' && !(await modalOpen(page)));

  await reset(page, { mode: 'cancel' });
  await page.tap('#shareApp');
  await page.waitForTimeout(80);
  s = await stub(page);
  ok(where + ': cancelling the sheet stays quiet',
    s.calls.length === 1 && s.clips.length === 0 && s.execs.length === 0 && (await toast(page)) === '' && !(await modalOpen(page)));

  await reset(page, { mode: 'denied', clip: 'ok' });
  await page.tap('#shareApp');
  await page.waitForFunction(() => !document.querySelector('#toast').hidden);
  s = await stub(page);
  ok(where + ': share blocked falls back to copy',
    s.calls.length === 1 && s.clips.length === 1 && s.clips[0].text === CANONICAL && (await toast(page)) === 'Link copied' && !(await modalOpen(page)));

  await reset(page, { mode: 'success', clip: 'ok' });
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
  await page.tap('#shareApp');
  await page.waitForFunction(() => !document.querySelector('#toast').hidden);
  s = await stub(page);
  ok(where + ': no share API copies the link from the Share button',
    s.calls.length === 0 && s.clips.length === 1 && s.clips[0].text === CANONICAL && s.clips[0].active === true && (await toast(page)) === 'Link copied');
  // Put the stub back for the remaining Share clicks.
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: function (data) {
    const stub = window.__shareStub;
    stub.calls.push({ data, active: navigator.userActivation ? navigator.userActivation.isActive : null, standalone: navigator.standalone === true });
    if (stub.mode === 'success') return Promise.resolve();
    if (stub.mode === 'cancel') return Promise.reject(new DOMException('Share canceled', 'AbortError'));
    if (stub.mode === 'hang') return stub.hang;
    return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
  } }); });

  await reset(page, { clip: 'ok' });
  await page.tap('#copyLink');
  await page.waitForFunction(() => !document.querySelector('#toast').hidden);
  s = await stub(page);
  ok(where + ': Copy link writes the canonical url during the tap',
    s.clips.length === 1 && s.clips[0].text === CANONICAL && s.clips[0].active === true && s.calls.length === 0 && (await toast(page)) === 'Link copied');
  if (label === 'tab') await page.screenshot({ path: SHOTS + 'link-copied-toast.png' });

  await reset(page, { clip: 'denied', exec: 'ok' });
  await page.tap('#copyLink');
  await page.waitForFunction(() => !document.querySelector('#toast').hidden);
  s = await stub(page);
  ok(where + ': denied clipboard uses execCommand',
    s.clips.length === 1 && s.execs.length === 1 && (await toast(page)) === 'Link copied' && !(await modalOpen(page)));

  await reset(page, { clip: 'denied', exec: 'fail' });
  await page.tap('#copyLink');
  await page.waitForSelector('#shareUrlField');
  s = await stub(page);
  const field = await page.locator('#shareUrlField').evaluate(el => ({
    value: el.value, readOnly: el.readOnly, start: el.selectionStart, end: el.selectionEnd
  }));
  ok(where + ': denied clipboard with no execCommand shows the address',
    s.clips.length === 1 && s.execs.length === 1 && await modalOpen(page) && field.value === CANONICAL && field.readOnly,
    JSON.stringify(field));
  if (label === 'tab') await page.screenshot({ path: SHOTS + 'manual-copy-sheet.png' });

  // A later tap on the sheet's Copy link is a new user activation.
  await page.evaluate(() => { window.__shareStub.clip = 'ok'; window.__shareStub.clips.length = 0; window.__shareStub.execs.length = 0; });
  await page.tap('#modal [data-act=copy-link]');
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Link copied');
  s = await stub(page);
  ok(where + ': Copy link on the fallback sheet copies, then closes',
    s.clips.length === 1 && s.clips[0].text === CANONICAL && s.clips[0].active === true && !(await modalOpen(page)));

  await reset(page, { mode: 'denied', clip: 'absent', exec: 'fail' });
  await page.tap('#shareApp');
  await page.waitForSelector('#shareUrlField');
  s = await stub(page);
  ok(where + ': missing clipboard opens manual copy from Share',
    s.calls.length === 1 && s.clips.length === 0 && s.execs.length === 1 && (await page.locator('#shareUrlField').inputValue()) === CANONICAL);
  await page.tap('#modal [data-act=modal-val]');
  await page.waitForFunction(() => document.querySelector('#modal').hidden);
  ok(where + ': closing the sheet leaves no error toast', (await toast(page)) === '' && !(await modalOpen(page)));

  await reset(page, { mode: 'hang', clip: 'ok' });
  await page.tap('#shareApp');
  await page.waitForFunction(() => window.__shareStub.calls.length === 1);
  await page.tap('#shareApp');
  await page.waitForTimeout(50);
  s = await stub(page);
  ok(where + ': a second tap does not open another sheet', s.calls.length === 1 && s.clips.length === 0);
  await page.evaluate(() => window.__shareStub.release());
  await page.waitForFunction(() => !document.querySelector('#shareApp').dataset.busy);
  ok(where + ': no console or page errors', page.__errs.length === 0, page.__errs.join(' | '));
}

// Workout data, credits and a v1.4 GIF survive the share actions.
{
  const page = contexts.length ? await (async () => {
    const ctx = contexts[0];
    return ctx.pages()[0];
  })() : null;
  await page.evaluate(async () => {
    const a = window.__app;
    await a.DB.put('sessions', { uid: 'keep-me', date: 1, name: 'Keep', notes: 'do not touch', finished: true, items: [{ label: 'Pushups', sets: [{ reps: 8, weight: 25 }] }] });
    await a.DB.put('intervals', { uid: 'keep-cardio', date: 2, activity: 'Run', done: true, notes: 'kept' });
    await a.refresh();
  });
  const before = await page.evaluate(async () => {
    const a = window.__app;
    return { s: await a.DB.all('sessions'), i: await a.DB.all('intervals') };
  });
  await page.evaluate(() => { window.__shareStub.mode = 'cancel'; window.__shareStub.clip = 'denied'; window.__shareStub.exec = 'fail'; });
  await page.tap('#shareApp');
  await page.waitForTimeout(60);
  await page.tap('#copyLink');
  await page.waitForSelector('#shareUrlField');
  await page.tap('#modal [data-act=modal-val]');
  const after = await page.evaluate(async () => {
    const a = window.__app;
    return { s: await a.DB.all('sessions'), i: await a.DB.all('intervals') };
  });
  ok('share and copy do not change workout data', JSON.stringify(before) === JSON.stringify(after), `${after.s.length} workouts`);
  await page.tap('#creditsLink');
  await page.waitForSelector('#credits');
  const credits = await page.locator('#credits').innerText();
  ok('credits still list the v1.4 sources',
    credits.includes('LottieFiles') && credits.includes('Wikimedia Commons') && credits.includes('ExerciseDB') && credits.includes('FitnessGenerator'));
  const gif = await page.request.get(BASE + 'demos/burpees.gif');
  ok('a v1.4 GIF still loads', gif.ok() && (await gif.body()).slice(0, 3).toString() === 'GIF');
}

await Promise.all(contexts.map(c => c.close()));
await browser.close();
const failed = results.filter(r => r[0] === 'FAIL');
console.log(failed.length ? failed.length + ' FAILED' : 'ALL PASS ' + results.length);
if (failed.length || errors.length) process.exit(1);
