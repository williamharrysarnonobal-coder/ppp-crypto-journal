// Login page App preview: opens, steps, keyboard, swipe, every image loads,
// and no sideways scroll at 390px. Logged-out stub Supabase (no redirect).
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const PORT = 8933, CDP = 9365;
const STUB = `const SUPABASE_URL='https://fake.supabase.test', SUPABASE_KEY='x';
const sb = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }) } };`;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p === '/js/supabase.js'){ res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(STUB); }
  fs.readFile(path.join(__ROOT, p), (e, b) => { if(e) return res.writeHead(404).end(); res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
let ws, id = 0, S; const pend = new Map(), errors = [];
const send = (m, p, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {}, sessionId: s })); setTimeout(() => { if(pend.delete(i)) rej(new Error('timeout ' + m)); }, 30000); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(e){ const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: e }, S); if(r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || '?').split('\n')[0]); return r.result.value; }
let fail = 0; const ok = (l, c, x) => { if(!c) fail++; console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpLP-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  let info; for(let i = 0; i < 60 && !info; i++){ await sleep(250); try{ info = await (await fetch('http://127.0.0.1:' + CDP + '/json/version')).json(); }catch(e){} }
  ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if(m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '?').split('\n')[0]); if(m.id && pend.has(m.id)){ const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  S = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S);
  const shot = async n => { const s = await send('Page.captureScreenshot', { format: 'png' }, S); fs.writeFileSync(path.join(__dirname, n), Buffer.from(s.data, 'base64')); };
  for(const [w, h, mobile, tag] of [[1440, 900, false, 'desktop'], [390, 844, true, 'mobile']]){
    console.log(tag.toUpperCase());
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }, S);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/login.html` }, S); await sleep(1500);
    ok('still on login page', /login\.html/.test(await ev('location.pathname')));
    ok('two preview buttons', (await ev(`document.querySelectorAll('[onclick="openAppPreview()"]').length`)) === 2);
    if(tag === 'desktop') await shot('login-page.png');
    await ev(`document.querySelector('.auth-preview-btn').click()`); await sleep(700);
    ok('opens on slide 1', await ev(`document.getElementById('appPreview').classList.contains('open') && document.getElementById('pvCount').textContent === '1 / 12'`));
    await shot(`login-preview-${tag}.png`);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`);
    ok('arrow key → slide 2', (await ev(`document.getElementById('pvCount').textContent`)) === '2 / 12');
    await ev(`stepAppPreview(-2)`);
    ok('wraps backwards to 12', (await ev(`document.getElementById('pvCount').textContent`)) === '12 / 12');
    const broken = await ev(`(async () => { const bad = []; for(let i = 0; i < APP_PREVIEW.length; i++){ const ok = await new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth === 1280); im.onerror = () => r(false); im.src = 'img/preview/' + APP_PREVIEW[i][0] + '.webp'; }); if(!ok) bad.push(APP_PREVIEW[i][0]); } return bad; })()`);
    ok('all 12 images load', !broken.length, broken.join(','));
    const cur = await ev(`document.getElementById('pvImg').currentSrc`);
    ok(mobile ? 'phone uses the -m screenshot' : 'desktop uses the wide screenshot', mobile ? /-m\.webp$/.test(cur) : /\d-[a-z-]+\.webp$/.test(cur) && !/-m\.webp$/.test(cur), cur.split('/').pop());
    const lay = await ev(`({ doc: document.documentElement.scrollWidth, box: Math.round(document.querySelector('.pv-box').getBoundingClientRect().right), boxH: Math.round(document.querySelector('.pv-box').getBoundingClientRect().height) })`);
    ok('fits the screen', lay.doc <= w && lay.box <= w && lay.boxH <= h, JSON.stringify(lay));
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    ok('Escape closes', !(await ev(`document.getElementById('appPreview').classList.contains('open')`)));
  }
  ok('no JS errors', !errors.length, errors.join(' | '));
  console.log(fail ? `\n${fail} MALI` : '\nlahat pumasa');
  try{ chrome.kill(); }catch(e){} server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BUMAGSAK: ' + e.message); process.exit(1); });
