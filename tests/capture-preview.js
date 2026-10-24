/* APP PREVIEW SCREENSHOTS para sa login page.
   Binubuksan ang tunay na dashboard sa headless Chrome, pero ang bawat request
   sa Supabase ay sinasagot ng pekeng data (fake-supabase.js + ang PREVIEW_DATA
   sa ibaba). Walang totoong account, pera o trade ang makakapasok: ang server
   na ito ay hindi kailanman tumatawag sa tunay na Supabase.

   Takbo:  node tests/capture-preview.js
   Labas:  img/preview/NN-name.webp  (1280x800) */
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const ROOT = __ROOT, PORT = 8931, CDP = 9363, W = 1280, H = 800;
const OUT = path.join(ROOT, 'img', 'preview');

/* Idinadagdag sa fake-supabase.js: makatotohanang sample para sa mga page na
   walang laman doon (Finance, Daily Plan, Trade Alerts), at mas maayos na
   pangalan at mga note. Lahat ay gawa-gawa. */
const PREVIEW_DATA = `
(() => {
  const T = window.FAKE_TABLES;
  const now = Date.now(), day = 864e5;
  const iso = d => new Date(d).toISOString().slice(0, 10);
  T.user_profile[0].display_name = 'Demo Trader';
  const SYM = ['BTC', 'BTC', 'ETH', 'XAU', 'SOL'];
  const NOTES = ['Waited for the 15M HL, entry at the 0.382.', 'Took it early, should have waited for the retest.',
    'Clean break and retest. Followed the plan.', 'Moved SL to BE after 1R.', 'News spike, stopped out.',
    'A+ setup, all confluences lined up.', 'Chased the move. Lesson: no FOMO.', 'Partial at 2R, rest at TP.'];
  // Kumpleto at magkakatugma ang bawat trade (walang "to fix" sa Journal).
  const PT = ['15 mins HL', '15 mins LH', '5 mins HL', '5 mins LH', '1 hour HL', '30 mins Invalidation Play'];
  const SETUP = { '15 mins HL': 'Bounce Play', '15 mins LH': 'Rejection Play', '5 mins HL': 'Bounce Play', '5 mins LH': 'Rejection Play', '1 hour HL': 'Bounce Play', '30 mins Invalidation Play': 'Invalidation Play' };
  const BASE = { BTC: 67000, ETH: 3500, XAU: 2650, SOL: 165 };
  T.trading_journal.forEach((t, i) => {
    t.symbol = SYM[i % SYM.length]; t.notes = NOTES[i % NOTES.length];
    t.rules_followed = (i % 4 === 0) ? 'No' : 'Yes'; t.chart_pattern = null;
    t.unfollowed_rules = t.rules_followed === 'Yes' ? 'Rules Followed' : ['Entered Without Confirmation', 'Moved Stop Loss', 'Revenge Trade'][i % 3];
    t.pattern_type = PT[i % PT.length]; t.trade_setup = SETUP[t.pattern_type];
    t.trade_type = /LH/.test(t.pattern_type) ? 'Short' : /Invalidation/.test(t.pattern_type) ? (i % 2 ? 'Short' : 'Long') : 'Long';
    t.execution_tf = ['1 min', '3 min', '5 min'][i % 3]; t.aof_phase = ['IC', 'EM', 'LM'][i % 3];
    t.account_type = ['Evaluation', 'Funded', 'Funded'][i % 3]; t.post_be_result = 'N/A';
    const dir = t.trade_type === 'Long' ? 1 : -1, entry = BASE[t.symbol] * (1 + ((i % 7) - 3) / 100);
    const size = +(t.position_size || 0.2), move = Math.abs(t.profit_loss || 0) / Math.max(size, 0.01) / (t.symbol === 'BTC' ? 1 : t.symbol === 'XAU' ? 100 : 10);
    const sgn = t.profit_loss > 0 ? 1 : t.profit_loss < 0 ? -1 : 0;
    t.entry_price = +entry.toFixed(2); t.close_price = +(entry + dir * sgn * move).toFixed(2);
    t.tp_price = +(entry * (1 + dir * 0.02)).toFixed(2); t.sl_price = +(entry * (1 - dir * 0.008)).toFixed(2);
  });
  // Gawa-gawang prop firm accounts na magkakatugma ang laki, balance at journal.
  const ACC = { 'Upscale 10K': ['Apex Funded 100K', 100000], 'Upscale 50K': ['Nova Capital 100K', 100000], 'Upscale 5K': ['Summit Prop 50K', 50000] };
  T.trading_journal.forEach(t => { if(ACC[t.account]) t.account = ACC[t.account][0]; });
  T.position_setups.forEach(s => { if(ACC[s.account_name]) s.account_name = ACC[s.account_name][0]; });
  T.trading_accounts.forEach(a => { const m = ACC[a.account_name]; if(!m) return;
    a.account_name = a.name = m[0]; a.account_size = m[1]; a.account_type = 'Funded'; a.firm = m[0].split(' ').slice(0, 2).join(' ');
    a.max_daily_loss_pct = 5; a.max_total_drawdown_pct = 10;
    const net = T.trading_journal.filter(t => t.account === a.account_name).reduce((s, t) => s + (t.profit_loss || 0) - (t.fee || 0), 0);
    a.current_balance = +(m[1] + net).toFixed(2); });  const ago = h => new Date(now - h * 36e5).toISOString();
  T.signal_alerts = [
    { id: 1, symbol: 'BTC', category: 'bitcoin', setup: '15M Higher Low', message: 'BTC.P 15M Higher Low Setup\\nPrice: 67,420\\n15M HL - Alert #1 today', alert_at: ago(0.3), seen: false, volume: 2.1e10 },
    { id: 2, symbol: 'ETHUSDT.P', category: 'altcoin', setup: '30M Long Invalidation', message: 'ETHUSDT.P 30M Long Invalidation\\nPrice: 3,512\\n30M Long Inv - Alert #1 today', alert_at: ago(0.9), seen: false, volume: 9.4e9 },
    { id: 3, symbol: 'BTC', category: 'bitcoin', setup: '5M Lower High', message: 'BTC.P 5M Lower High Setup\\nPrice: 67,880\\n5M LH - Alert #2 today', alert_at: ago(1.6), seen: true, volume: 2.1e10 },
    { id: 4, symbol: 'SOLUSDT.P', category: 'altcoin', setup: '15M Higher Low', message: 'SOLUSDT.P 15M Higher Low\\nPrice: 168.4\\n15M HL - Alert #1 today', alert_at: ago(2.4), seen: true, volume: 3.2e9 },
    { id: 5, symbol: 'XRPUSDT.P', category: 'altcoin', setup: '15M Lower High', message: 'XRPUSDT.P 15M Lower High\\nPrice: 0.612\\n15M LH - Alert #1 today', alert_at: ago(3.5), seen: true, volume: 1.4e9 },
    { id: 6, symbol: 'BTC', category: 'bitcoin', setup: '5M Higher Low', message: 'BTC.P 5M Higher Low Setup\\nPrice: 67,150\\n5M HL - Alert #1 today', alert_at: ago(4.8), seen: true, volume: 2.1e10 }];
  T.daily_plans = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, plan_date: iso(now - i * day),
    bias: ['Bullish', 'Bearish', 'Neutral'][i % 3], max_trades: 2, key_levels: '66,800 support · 68,200 resistance',
    plan_notes: 'Only A+ setups. Wait for the 15M structure.', psych: { sleep: 'Good', mood: 'Calm', focus: 'High' },
    followed: i === 0 ? null : ['Yes', 'Yes', 'Partly', 'Yes', 'No'][i % 5], went_well: i ? 'Waited for confirmation.' : null,
    improve: i ? 'Stop after 2 trades.' : null }));
  const m0 = new Date(), mStr = (k, d) => iso(new Date(m0.getFullYear(), m0.getMonth() - k, d));
  T.finance_accounts = [
    { id: 1, account_name: 'Main Bank', account_class: 'Debit', current_balance: 18420.5, currency: 'USD' },
    { id: 2, account_name: 'Emergency Fund', account_class: 'Debit', current_balance: 6000, currency: 'USD', parent_account_id: 1 },
    { id: 3, account_name: 'E-Wallet', account_class: 'Debit', current_balance: 640.25, currency: 'USD' },
    { id: 4, account_name: 'Rewards Card', account_class: 'Credit', current_balance: 0, credit_limit: 12000, currency: 'USD',
      billing_day: 20, due_day: 12, card_number: '0000', last_bill_paid: mStr(1, 1) }];
  const tx = []; let id = 1;
  const add = (k, d, type, amount, acc, cat, sub, desc, to) => tx.push({ id: id++, tx_date: mStr(k, d), tx_type: type, amount, account_id: acc, to_account_id: to || null, category: cat, subcategory: sub, description: desc, settled_bill: k >= 1 && acc === 4 ? mStr(1, 1) : null });
  [0, 1, 2].forEach(k => {
    add(k, 1, 'Income', 5200, 1, '💼 Salary', null, 'Salary');
    add(k, 3, 'Expense', 1400, 1, '🏠 Housing', 'Rent', 'Apartment rent');
    add(k, 5, 'Expense', 86.4, 4, '🍔 Food & Dining', 'Groceries', 'Supermarket');
    add(k, 7, 'Expense', 22.5, 4, '🚗 Transportation', 'Taxi', 'Ride to office');
    add(k, 9, 'Expense', 15.99, 4, '📺 Subscriptions', 'Streaming', 'Streaming service');
    add(k, 11, 'Expense', 48.2, 4, '🍔 Food & Dining', 'Restaurants', 'Dinner out');
    add(k, 14, 'Transfer', 500, 1, '💰 Savings & Investments', null, 'Monthly savings', 2);
    add(k, 16, 'Expense', 120, 1, '⚡ Utilities', 'Electricity', 'Electricity bill');
    add(k, 18, 'Income', 340, 1, '📈 Trading', null, 'Prop firm payout');
  });
  T.finance_transactions = tx;
  T.finance_recurring = [
    { id: 1, account_id: 4, kind: 'Installment', name: 'Laptop', category: '💻 Electronics', total_amount: 1800, total_payments: 12, payments_applied: 7, first_bill: mStr(7, 10) },
    { id: 2, account_id: 4, kind: 'Installment', name: 'Phone', category: '💻 Electronics', total_amount: 1200, total_payments: 12, payments_applied: 12, first_bill: mStr(12, 10) },
    { id: 3, account_id: 4, kind: 'Installment', name: 'Dental plan', category: '🏥 Health', total_amount: 600, total_payments: 6, payments_applied: 2, first_bill: mStr(2, 5) },
    { id: 4, account_id: 4, kind: 'Subscription', name: 'Music streaming', price: 10.99, cycle: 'Monthly', first_bill: mStr(9, 2) },
    { id: 5, account_id: 1, kind: 'Subscription', name: 'Cloud storage', price: 2.99, cycle: 'Monthly', first_bill: mStr(9, 2) }];
  T.finance_budgets = [{ id: 1, category: '🍔 Food & Dining', amount: 400 }, { id: 2, category: '🚗 Transportation', amount: 150 }];
  // Walang paalala o banner na sasakop sa larawan.
  try{ localStorage.setItem('tanaydana-reminders', JSON.stringify({ enabled: false })); }catch(e){}
})();
`;

const SLIDES = [
  { file: '01-dashboard', view: 'dashboard' },
  { file: '02-calendar', view: 'dashboard', scrollTo: '#calendarGrid, .cal-grid' },
  { file: '03-journal', view: 'journal' },
  { file: '04-accounts', view: 'accounts' },
  { file: '05-playbooks', view: 'playbooks' },
  { file: '06-calculator', view: 'calculator', run: `(()=>{ const set = (id, v) => { const el = document.getElementById(id); if(el){ el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }; set('psSymbol', 'BTC/USD'); set('psEntry', '67000'); set('psTP', '68600'); set('psSL', '66450'); if(typeof renderPosSizeCalculator === 'function') renderPosSizeCalculator(); })()` },
  { file: '07-alerts', view: 'alerts', run: `(typeof switchAlertsTab === 'function' && switchAlertsTab('bitcoin'))` },
  { file: '08-plan', view: 'plan' },
  { file: '09-finance', view: 'finance', tab: 'dashboard' },
  { file: '10-finance-accounts', view: 'finance', tab: 'accounts' },
  { file: '11-finance-recurring', view: 'finance', tab: 'recurring' },
  { file: '12-challenges', view: 'challenges' }
];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p === '/') p = '/index.html';
  if(p === '/js/supabase.js'){
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(path.join(__dirname, 'fake-supabase.js'), 'utf8') + PREVIEW_DATA);
  }
  if(p.startsWith('/api/')){ res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"events":[]}'); }
  fs.readFile(path.join(ROOT, p), (e, b) => { if(e) return res.writeHead(404).end(); res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }); res.end(b); });
});
let ws, id = 0, S; const pend = new Map();
const send = (m, p, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {}, sessionId: s })); setTimeout(() => { if(pend.delete(i)) rej(new Error('timeout ' + m)); }, 40000); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(e){ const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: e }, S); if(r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || '?').split('\n')[0]); return r.result.value; }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdpPV-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
  let info; for(let i = 0; i < 60 && !info; i++){ await sleep(250); try{ info = await (await fetch('http://127.0.0.1:' + CDP + '/json/version')).json(); }catch(e){} }
  ws = new WebSocket(info.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if(m.id && pend.has(m.id)){ const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  S = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dashboard.html` }, S);
  for(let i = 0; i < 60; i++){ await sleep(250); const n = await ev('typeof ALL_TRADES==="undefined"?-1:ALL_TRADES.length'); if(n > 0) break; }
  await sleep(2500);
  const clean = `(()=>{ document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    const b = document.getElementById('upBannerWrap'); if(b) b.innerHTML = '';
    document.querySelectorAll('.toast, #toast').forEach(t => t.style.display = 'none'); window.scrollTo(0, 0);
    document.querySelectorAll('.main, main, .content').forEach(m => { try{ m.scrollTop = 0; }catch(e){} }); })()`;
  if(process.env.PV_DEBUG){ console.log(JSON.stringify(await ev(`({ cp: (FIELD_OPTIONS.chart_pattern||[]).slice(0,8), tagKeys: Object.keys(FIELD_OPTIONS).filter(k => /rule|tag/i.test(k)), tags: (FIELD_OPTIONS.unfollowed_rules_options || FIELD_OPTIONS.trade_tags || (typeof UNFOLLOWED_RULES_OPTIONS !== 'undefined' ? UNFOLLOWED_RULES_OPTIONS : [])).slice(0,8), miss: [...new Set(RAW_TRADES.flatMap(r => _journalMissingFields(r)))], inv: [...new Set(RAW_TRADES.flatMap(r => (_journalInvalidFields(r) || []).map(x => typeof x === 'string' ? x : JSON.stringify(x))))].slice(0, 12), sample: RAW_TRADES.slice(0,3).map(r => _journalInvalidFields(r)) })`))); process.exit(0); }
  /* Dalawang set: desktop (1280x800) at phone (390x640, '-m', mobile-mode). */
  let total = 0;
  for(const mob of [false, true]){
  if(mob){ await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 640, deviceScaleFactor: 2, mobile: true }, S); await ev(`document.body.classList.add('mobile-mode')`); await sleep(800); }
  for(const s of SLIDES){
    await ev(`switchView('${s.view}')`); await sleep(1800);
    if(s.tab){ await ev(`switchFinanceTab('${s.tab}')`); await sleep(1500); }
    if(s.run){ await ev(s.run); await sleep(900); }
    await ev(clean);
    if(s.scrollTo) await ev(`(()=>{ const el = document.querySelector(${JSON.stringify(s.scrollTo)}); if(el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); })()`);
    // Sa phone: lampasan ang pamagat ng page para ang laman mismo ang makita.
    else if(mob) await ev(`(()=>{ const hs = [...document.querySelectorAll('.view.active header.top')]; const h = hs[hs.length - 1]; if(h) window.scrollTo(0, h.getBoundingClientRect().bottom + window.scrollY - 6); })()`);
    await sleep(500);
    const shot = await send('Page.captureScreenshot', { format: 'webp', quality: mob ? 72 : 80 }, S);
    const buf = Buffer.from(shot.data, 'base64'); total += buf.length;
    fs.writeFileSync(path.join(OUT, s.file + (mob ? '-m' : '') + '.webp'), buf);
    console.log('  ' + (s.file + (mob ? '-m' : '')).padEnd(24) + Math.round(buf.length / 1024) + ' KB');
  }
  }
  console.log('  total ' + Math.round(total / 1024) + ' KB');
  try{ chrome.kill(); }catch(e){} server.close(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
