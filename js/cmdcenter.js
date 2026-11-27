/* ===================== COMMAND CENTER (2026-11-26) =====================
   Like the IT Console's Central Hub: one row at the top of the Dashboard with
   what matters at a glance — are the bots alive, the last alert, the next
   High impact news (countdown), today's P&L and this week's P&L (net worth tile swapped out
   2026-11-26: money totals don't belong on a screen anyone can see). Plus the HUD
   header reactor on every page, whose colour follows the bots.

   Bots: every v2 bot writes trading_signals.heartbeat_at each cycle (~5 min).
   BTC = symbol BTC, Gold = XAU, Alts = newest heartbeat of category altcoin.
   Alive = heartbeat younger than BOT_STALE_MIN. */
const BOT_STALE_MIN = 15;
const CMD = { bots: null, lastAlert: null, nextNews: null, fetchedAt: 0, timer: null };

function _cmdAgo(ts){
  const m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if(m < 1) return 'just now';
  if(m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`;
}
function _cmdIn(ts){
  const m = Math.max(0, Math.round((new Date(ts).getTime() - Date.now()) / 60000));
  if(m < 1) return 'now';
  if(m < 60) return 'in ' + m + 'm';
  const h = Math.floor(m / 60);
  return h < 24 ? `in ${h}h ${m % 60}m` : `in ${Math.floor(h / 24)}d ${h % 24}h`;
}
async function _cmdFetch(){
  if(typeof USER_ACCESS_TOKEN === 'undefined' || !USER_ACCESS_TOKEN) return;
  const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${USER_ACCESS_TOKEN}` };
  const nowIso = new Date().toISOString();
  try{
    const [sig, al, news] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/trading_signals?select=symbol,category,heartbeat_at`, { headers: H }).then(r => r.ok ? r.json() : []),
      fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?select=symbol,setup,alert_at&order=alert_at.desc&limit=1`, { headers: H }).then(r => r.ok ? r.json() : []),
      fetch(`${SUPABASE_URL}/rest/v1/economic_events?select=title,country,impact,event_date&event_date=gte.${encodeURIComponent(nowIso)}&order=event_date.asc&limit=40`, { headers: H }).then(r => r.ok ? r.json() : [])
    ]);
    const newest = rows => rows.map(r => r.heartbeat_at).filter(Boolean).sort().pop() || null;
    CMD.bots = [
      { key: 'BTC', label: 'BTC', at: newest(sig.filter(r => r.symbol === 'BTC')) },
      { key: 'XAU', label: 'Gold', at: newest(sig.filter(r => r.symbol === 'XAU')) },
      { key: 'ALTS', label: 'Alts', at: newest(sig.filter(r => r.category === 'altcoin')) }
    ].map(b => ({ ...b, alive: !!b.at && Date.now() - Date.parse(b.at) < BOT_STALE_MIN * 60000 }));
    CMD.lastAlert = al[0] || null;
    const isUS = e => typeof _econIsUS === 'function' ? _econIsUS(e) : /^(us|usd)$/i.test(e.country || '');
    CMD.nextNews = news.find(e => String(e.impact).toLowerCase() === 'high' && isUS(e)) || null;
    CMD.fetchedAt = Date.now();
  }catch(e){ console.warn('Command Center', e); }
  renderCommandCenter();
  _cmdReactorState();
}
function _cmdTodayPnl(){
  const today = new Date().toDateString();
  const rows = (typeof ALL_TRADES !== 'undefined' ? ALL_TRADES : [])
    .filter(t => !t.is_paper && t.close_date && new Date(t.close_date).toDateString() === today);
  // Net of fees, like every other P&L on the Dashboard (was gross until 2026-11-27).
  return { n: rows.length, pnl: rows.reduce((s, t) => s + netPnl(t), 0) };
}
// This week = Monday 00:00 local → now. W/L counts, not just money.
function _cmdWeekPnl(){
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const rows = (typeof ALL_TRADES !== 'undefined' ? ALL_TRADES : [])
    .filter(t => !t.is_paper && t.close_date && new Date(t.close_date) >= start);
  // Net of fees, and W/L from the trade's own Win/Loss, same as the KPIs and calendar.
  return { n: rows.length, w: rows.filter(_isWin).length, l: rows.filter(_isLoss).length, pnl: rows.reduce((s, t) => s + netPnl(t), 0) };
}
function renderCommandCenter(){
  const el = document.getElementById('cmdCenter');
  if(!el) return;
  const tile = (cls, onclick, label, value, sub, title) =>
    `<button type="button" class="cmd-tile ${cls}" onclick="${onclick}" title="${escapeHtml(title || '')}"><span class="cmd-k">${label}</span><span class="cmd-v">${value}</span><span class="cmd-s">${sub}</span></button>`;
  // Bots
  const bots = CMD.bots;
  const allOk = bots && bots.every(b => b.alive);
  const botsV = bots ? bots.map(b => `<span class="cmd-bot ${b.alive ? 'ok' : 'down'}"><i></i>${b.label}</span>`).join('') : '<span class="cmd-dim">Checking…</span>';
  const down = bots ? bots.filter(b => !b.alive) : [];
  const botsS = !bots ? '' : allOk ? `All running · checked ${_cmdAgo(CMD.fetchedAt)}`
    : `${down.map(b => b.label).join(', ')} not running${down[0].at ? ' · last seen ' + _cmdAgo(down[0].at) : ''}`;
  // Last alert
  const a = CMD.lastAlert;
  const alertV = a ? escapeHtml(`${a.symbol} · ${a.setup || 'Alert'}`) : '<span class="cmd-dim">None in 24h</span>';
  // Next news
  const n = CMD.nextNews;
  const newsV = n ? escapeHtml(n.title) : '<span class="cmd-dim">No High impact news ahead</span>';
  const newsS = n ? `${_cmdIn(n.event_date)} · ${new Date(n.event_date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'US · High impact';
  // Today's P&L
  const t = _cmdTodayPnl();
  const pnlV = `<span class="${t.pnl > 0 ? 'pos' : t.pnl < 0 ? 'neg' : ''}">${t.pnl >= 0 ? '+' : '−'}$${Math.abs(t.pnl).toFixed(2)}</span>`;
  // This week's P&L
  const w = _cmdWeekPnl();
  const wkV = `<span class="${w.pnl > 0 ? 'pos' : w.pnl < 0 ? 'neg' : ''}">${w.pnl >= 0 ? '+' : '−'}$${Math.abs(w.pnl).toFixed(2)}</span>`;
  const wkS = w.n ? `${w.w}W · ${w.l}L · ${w.n} trade${w.n === 1 ? '' : 's'}` : 'No trades closed yet';
  el.innerHTML =
    tile('cmd-bots ' + (bots ? (allOk ? 'is-ok' : 'is-down') : ''), "switchView('alerts')", 'Bots', `<span class="cmd-bots-row">${botsV}</span>`, botsS, 'BTC, Gold and Alts alert bots on the office laptop') +
    tile('', "switchView('alerts')", 'Last alert', alertV, a ? _cmdAgo(a.alert_at) : 'Trade Alerts', 'Open Trade Alerts') +
    tile('', "switchView('news')", 'Next news', newsV, newsS, 'Open the Economic Calendar') +
    tile('', "switchView('journal')", "Today's P&L", pnlV, `${t.n} trade${t.n === 1 ? '' : 's'} closed today`, 'Open Trade Journals') +
    tile('', "switchView('journal')", "This week's P&L", wkV, wkS, 'Trades closed since Monday · open Trade Journals');
}
function startCommandCenter(){
  clearInterval(CMD.timer);
  _cmdFetch();
  // Countdowns and "x m ago" tick every 30 s; the data itself every 60 s.
  let tick = 0;
  CMD.timer = setInterval(() => { tick++; if(tick % 2 === 0) _cmdFetch(); else renderCommandCenter(); }, 30000);
}

/* ---------- HUD header reactor (every page, HUD theme only) ---------- */
function _cmdReactorSvg(){
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="hr-a" cx="20" cy="20" r="17"/><circle class="hr-b" cx="20" cy="20" r="12"/><circle class="hr-c" cx="20" cy="20" r="5"/></svg>`;
}
// Inside each page title (<h1>), so header.top's own layout rules are untouched.
function _cmdReactorEnsure(){
  document.querySelectorAll('.view header.top h1').forEach(h => {
    if(h.querySelector('.hud-reactor')) return;
    const r = document.createElement('span');
    r.className = 'hud-reactor'; r.innerHTML = _cmdReactorSvg();
    h.insertBefore(r, h.firstChild);
  });
}
function _cmdReactorState(){
  _cmdReactorEnsure();
  const bad = !navigator.onLine || (CMD.bots && CMD.bots.some(b => !b.alive));
  const tip = !navigator.onLine ? 'No internet connection'
    : !CMD.bots ? 'Checking the bots…'
    : bad ? CMD.bots.filter(b => !b.alive).map(b => b.label).join(', ') + ' not running' : 'All bots running';
  document.querySelectorAll('.hud-reactor').forEach(r => { r.classList.toggle('bad', !!bad); r.title = tip; });
}
window.addEventListener('online', _cmdReactorState);
window.addEventListener('offline', _cmdReactorState);
setTimeout(startCommandCenter, 2500);
