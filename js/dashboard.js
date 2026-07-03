let USER_ACCESS_TOKEN = null;
let CURRENT_USER_EMAIL = null;
const ADMIN_EMAIL = 'williamharry.s.arnonobal@gmail.com';
function isAdminUser(){ return CURRENT_USER_EMAIL === ADMIN_EMAIL; }

let ALL_TRADES = [];
let RAW_TRADES = [];
let FILTERED = [];
let calMonth = new Date();
let activeTab = "trade_setup";
let equityChartRef = null;
let winLossChartRef = null;
let breakdownChartRef = null;
let disciplineRadarRef = null;
let dayOfWeekChartRef = null;
let symbolFrequencyChartRef = null;
let currentView = "profile";

const MOON_ICON_SVG = '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_ICON_SVG = '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function setLoading(pct){
  document.getElementById('loadingBar').style.width = pct + '%';
  if(pct >= 100){ setTimeout(()=>{document.getElementById('loadingBar').style.width='0%';}, 400); }
}

function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('collapsed');
}

(function setupSidebarTooltips(){
  const tip = document.getElementById('sidebarTooltip');
  const sidebar = document.getElementById('sidebar');
  if(!tip || !sidebar) return;

  sidebar.querySelectorAll('.nav-item, .theme-toggle').forEach(item => {
    item.addEventListener('mouseenter', () => {
      if(!sidebar.classList.contains('collapsed')) return;
      const label = item.querySelector('.nav-tooltip');
      if(!label) return;
      const rect = item.getBoundingClientRect();
      tip.textContent = label.textContent;
      tip.style.left = `${rect.right + 12}px`;
      tip.style.top = `${rect.top + rect.height / 2}px`;
      tip.style.transform = 'translateY(-50%)';
      tip.classList.add('show');
    });
    item.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
})();

function toggleTheme(){
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try{ localStorage.setItem('ledger-theme', next); }catch(e){}

  document.getElementById('themeToggleBtn').innerHTML = next === 'light'
    ? `${SUN_ICON_SVG} <span class="nav-label">Light mode</span><span class="nav-tooltip">Light mode</span>`
    : `${MOON_ICON_SVG} <span class="nav-label">Dark mode</span><span class="nav-tooltip">Dark mode</span>`;

  // re-render charts so their colors match the new theme
  if(FILTERED.length || ALL_TRADES.length){
    renderKPIs();
    renderEquityCurve();
    renderWinLossChart();
    renderDisciplineRadar();
    renderDayOfWeekChart();
    renderSymbolFrequencyChart();
    renderBreakdown();
  }
}

(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-theme'); }catch(e){}
  if(saved === 'light'){
    document.documentElement.setAttribute('data-theme','light');
    const btn = document.getElementById('themeToggleBtn');
    if(btn) btn.innerHTML = `${SUN_ICON_SVG} <span class="nav-label">Light mode</span><span class="nav-tooltip">Light mode</span>`;
  }
})();

function switchView(view){
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if(view === 'journal') renderJournalTable();
  if(view === 'config'){ renderColumnConfigUI(); renderOptionsEditor(); renderFormFieldConfigUI(); }
  if(view === 'alerts'){ loadSignalAlerts(); startAlertsPolling(); } else { stopAlertsPolling(); }
  if(view === 'achievements') loadAchievements();
  if(view === 'news') loadMarketNewsWidget();
  if(view === 'challenges') renderChallenges();
  if(view === 'profile') loadProfile();
  if(view === 'accounts') loadAccounts();
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* Auto-refresh Trade Alerts while that tab is open — the bots only push
   every ~5 min, so a short poll is enough to feel "live" without a
   websocket subscription. */
let alertsPollTimer = null;
function startAlertsPolling(){
  stopAlertsPolling();
  alertsPollTimer = setInterval(() => { if(currentView === 'alerts') loadSignalAlerts(); }, 30000);
}
function stopAlertsPolling(){
  if(alertsPollTimer){ clearInterval(alertsPollTimer); alertsPollTimer = null; }
}

async function initApp(){
  const session = await requireSession(); // redirects to login.html if not logged in
  if(!session) return;
  USER_ACCESS_TOKEN = session.access_token;
  CURRENT_USER_EMAIL = session.user?.email || null;

  loadColumnConfig();
  loadOptionsConfig();
  loadFormFieldConfig();
  loadAccounts();

  setLoading(30);

  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=*&order=close_date.asc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    setLoading(70);

    if(!res.ok){
      const t = await res.text();
      throw new Error(`HTTP ${res.status} — ${t.slice(0,200)}`);
    }

    const data = await res.json();
    RAW_TRADES = data;
    ALL_TRADES = data.map(normalizeTrade);

    setLoading(100);
    document.getElementById('app').style.display = 'block';

    populateAccountFilter();
    applyFilters();
    populateJournalFilters();
    renderJournalTable();
    loadProfile();

  }catch(e){
    setLoading(100);
    alert("Couldn't load your trades: " + e.message);
  }
}

window.addEventListener('DOMContentLoaded', initApp);

function normalizeTrade(r){
  return {
    position_id: r.position_id,
    open_date: r.open_date ? new Date(r.open_date) : null,
    close_date: r.close_date ? new Date(r.close_date) : (r.open_date ? new Date(r.open_date) : null),
    symbol: r.symbol || "—",
    win_loss: (r.win_loss || "").trim(),
    trade_type: r.trade_type || "—",
    profit_loss: r.profit_loss != null ? parseFloat(r.profit_loss) : 0,
    fee: r.fee != null ? parseFloat(r.fee) : 0,
    pnl_percent: r.pnl_percent != null ? parseFloat(r.pnl_percent) : null,
    rr: r.rr != null ? parseFloat(r.rr) : null,
    trade_setup: r.trade_setup || "Unspecified",
    pattern_type: r.pattern_type || "Unspecified",
    execution_tf: r.execution_tf || "Unspecified",
    exit_type: r.exit_type || "",
    session: r.session || computeSession(r) || "Unspecified",
    day_of_week: r.day_of_week || (r.close_date ? new Date(r.close_date).toLocaleDateString('en-US',{weekday:'long'}) : "Unspecified"),
    emotion: r.emotion || "Unspecified",
    rules_followed: r.rules_followed || "",
    unfollowed_rules: r.unfollowed_rules || "",
    account: r.account || "Unspecified",
    account_type: r.account_type || "",
    notes: r.notes || ""
  };
}

/* ---------------- Computed fields (mirrors the AppSheet formulas) ---------------- */
function computeObjective(row){
  const open = row.open_date ? new Date(row.open_date) : null;
  const close = row.close_date ? new Date(row.close_date) : null;
  if(!open || !close || isNaN(open) || isNaN(close)) return '';
  const hours = (close - open) / 36e5;
  if(hours < 3) return 'Scalping';
  if(hours < 23) return 'Intraday';
  if(hours < 72) return 'Day Trade';
  return 'Position Trade';
}

function computeDuration(row){
  const open = row.open_date ? new Date(row.open_date) : null;
  const close = row.close_date ? new Date(row.close_date) : null;
  if(!open || !close || isNaN(open) || isNaN(close)) return '';
  const totalMinutes = Math.floor((close - open) / 60000);
  if(totalMinutes < 60) return `${totalMinutes} mins`;
  if(totalMinutes < 1440){
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h} hours` + (m > 0 ? ` ${m} mins` : '');
  }
  const d = Math.floor(totalMinutes / 1440);
  const remH = Math.floor((totalMinutes % 1440) / 60);
  return `${d} days` + (remH > 0 ? ` ${remH} hours` : '');
}

function computeSession(row){
  if(!row.open_date) return '';
  const open = new Date(row.open_date);
  if(isNaN(open)) return '';
  const hour = open.getHours(); // uses the viewer's local timezone
  if(hour >= 4 && hour < 12) return 'Asia';
  if(hour >= 12 && hour < 17) return 'London';
  if(hour >= 17 && hour < 21) return 'London + NY Overlap';
  if(hour >= 21 || hour < 2) return 'New York';
  return 'Low Liquidity';
}

function computeDayOfWeek(row){
  const d = row.close_date ? new Date(row.close_date) : (row.open_date ? new Date(row.open_date) : null);
  if(!d || isNaN(d)) return '';
  return d.toLocaleDateString('en-US', {weekday:'long'});
}

function computeTradeSummary(row){
  const val = (v) => (v === null || v === undefined || v === '') ? '—' : v;
  const money = (v) => { const n = parseFloat(v); return isNaN(n) ? val(v) : fmtMoney(n); };
  const pct = (v) => { const n = parseFloat(v); return isNaN(n) ? val(v) : n.toFixed(2)+'%'; };

  return [
    `<b>Symbol:</b> ${val(row.symbol)}`,
    `<hr>`,
    `<b>Trade Setup Details:</b>`,
    `<hr>`,
    `<b>Trade Setup:</b> ${val(row.trade_setup)}`,
    `<b>Pattern Type:</b> ${val(row.pattern_type)}`,
    `<b>AOF Phase:</b> ${val(row.aof_phase)}`,
    `<b>Execution TF:</b> ${val(row.execution_tf)}`,
    `<b>Objective:</b> ${computeObjective(row) || '—'}`,
    `<b>Trade Type:</b> ${val(row.trade_type)}`,
    ``,
    `<b>Trade Result:</b>`,
    `<hr>`,
    `<b>Result:</b> ${val(row.win_loss)}`,
    `<b>Profit/Loss:</b> ${money(row.profit_loss)}`,
    `<b>PNL Percent:</b> ${pct(row.pnl_percent)}`,
    `<b>Fee:</b> ${money(row.fee)}`,
    `<b>Trade Duration:</b> ${computeDuration(row) || '—'}`,
    ``,
    `<b>Rules Result:</b>`,
    `<hr>`,
    `<b>Rules Followed?:</b> ${val(row.rules_followed)}`,
    `<b>Unfollowed Rules:</b> ${val(row.unfollowed_rules)}`,
    ``,
    `<b>Notes:</b>`,
    `<hr>`,
    val(row.notes)
  ].join('<br>');
}

function populateAccountFilter(){
  const accounts = [...new Set(ALL_TRADES.map(t => t.account).filter(Boolean))].sort();
  const sel = document.getElementById('accountFilter');
  accounts.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
}

function applyFilters(){
  const range = document.getElementById('rangeFilter').value;
  const acct = document.getElementById('accountFilter').value;
  const now = new Date();

  FILTERED = ALL_TRADES.filter(t => {
    if(acct !== 'all' && t.account !== acct) return false;
    if(!t.close_date) return range === 'all';
    if(range === '30'){
      const cutoff = new Date(); cutoff.setDate(now.getDate()-30);
      return t.close_date >= cutoff;
    }
    if(range === '90'){
      const cutoff = new Date(); cutoff.setDate(now.getDate()-90);
      return t.close_date >= cutoff;
    }
    if(range === 'month'){
      return t.close_date.getMonth() === now.getMonth() && t.close_date.getFullYear() === now.getFullYear();
    }
    return true;
  });

  document.getElementById('tradeCountLabel').textContent = `${FILTERED.length} trade${FILTERED.length===1?'':'s'} in view`;

  renderKPIs();
  renderCalendar();
  renderEquityCurve();
  renderWinLossChart();
  renderDisciplineRadar();
  renderDayOfWeekChart();
  renderSymbolFrequencyChart();
  renderBreakdownTabs();
  renderBreakdown();
  document.getElementById('aiOutput').style.display = 'none';
}

function fmtMoney(n){
  const sign = n < 0 ? "-" : "+";
  return sign + "$" + Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtNum(n, d=2){
  if(n === null || isNaN(n)) return "—";
  return n.toFixed(d);
}

/* ---------------- KPIs ---------------- */
function sparklineSVG(values, color){
  if(!values.length) return '';
  const w = 90, h = 26, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const step = values.length > 1 ? (w - pad*2) / (values.length - 1) : 0;
  const points = values.map((v,i) => {
    const x = pad + i*step;
    const y = h - pad - ((v - min) / range) * (h - pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:8px;">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderKPIs(){
  const t = FILTERED;
  const wins = t.filter(x => x.win_loss.toLowerCase() === 'win');
  const losses = t.filter(x => x.win_loss.toLowerCase() === 'loss');
  const totalPnl = t.reduce((s,x) => s + (x.profit_loss||0), 0);
  const winRate = t.length ? (wins.length / t.length * 100) : 0;
  const grossWin = wins.reduce((s,x)=> s + Math.max(x.profit_loss,0), 0);
  const grossLoss = Math.abs(losses.reduce((s,x)=> s + Math.min(x.profit_loss,0), 0));
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss) : (grossWin > 0 ? Infinity : 0);
  const rrVals = t.map(x=>x.rr).filter(x => x !== null && !isNaN(x));
  const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
  const avgWin = wins.length ? grossWin/wins.length : 0;
  const avgLoss = losses.length ? (losses.reduce((s,x)=>s+x.profit_loss,0)/losses.length) : 0;

  // current streak (most recent trades first)
  const sorted = [...t].filter(x=>x.close_date).sort((a,b)=> b.close_date - a.close_date);
  let streak = 0, streakType = null;
  for(const tr of sorted){
    const wl = tr.win_loss.toLowerCase();
    if(wl !== 'win' && wl !== 'loss') continue;
    if(streakType === null){ streakType = wl; streak = 1; }
    else if(wl === streakType){ streak++; }
    else break;
  }

  const pfDisplay = profitFactor===Infinity ? 100 : Math.min(profitFactor/3*100, 100);
  const rrDisplay = avgRR === null ? 0 : Math.min(Math.max(avgRR,0)/3*100, 100);
  const winBarPct = (Math.abs(avgWin)+Math.abs(avgLoss)) > 0 ? Math.abs(avgWin)/(Math.abs(avgWin)+Math.abs(avgLoss))*100 : 50;
  const feesTotal = t.reduce((s,x)=>s+(x.fee||0),0);
  const feesShare = grossWin > 0 ? Math.min(feesTotal/grossWin*100, 100) : 0;
  const streakIcons = streakType
    ? `<div style="margin-top:10px;font-size:15px;letter-spacing:3px;color:${streakType==='win'?cssVar('--win'):cssVar('--loss')};">${'$'.repeat(Math.min(streak,10))}${streak>10?'+':''}</div>`
    : '';

  // cumulative P/L trend (for the Total PnL sparkline) — last 30 closed trades in view
  const sortedByDate = [...t].filter(x=>x.close_date).sort((a,b)=> a.close_date - b.close_date);
  let cum = 0;
  const pnlTrend = sortedByDate.map(x => (cum += x.profit_loss || 0)).slice(-30);

  const kpis = [
    {label:"Total PnL", value: fmtMoney(totalPnl), cls: totalPnl>=0?'pos':'neg',
      bar: pnlTrend.length > 1 ? sparklineSVG(pnlTrend, totalPnl>=0?cssVar('--win'):cssVar('--loss')) : ''},
    {label:"Win rate", value: fmtNum(winRate,1)+"%", cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${winRate}%;background:${cssVar('--win')};"></div><div style="width:${100-winRate}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Profit factor", value: profitFactor===Infinity?"∞":fmtNum(profitFactor,2), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${pfDisplay}%;background:${cssVar('--win')};"></div><div style="width:${100-pfDisplay}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Avg RR", value: avgRR===null?"—":fmtNum(avgRR,2), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${rrDisplay}%;background:${cssVar('--win')};"></div><div style="width:${100-rrDisplay}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Total trades", value: t.length, cls:'',
      bar: t.length ? `<div style="margin-top:8px;font-size:11px;color:var(--muted);">${wins.length} win${wins.length!==1?'s':''} · ${losses.length} loss${losses.length!==1?'es':''}</div>` : ''},
    {label:"Avg win / loss", value: fmtMoney(avgWin).replace('+','')+" / "+fmtMoney(avgLoss), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${winBarPct}%;background:${cssVar('--win')};"></div><div style="width:${100-winBarPct}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Current streak", value: streakType ? `${streak} ${streakType}${streak>1?'s':''}` : "—", cls: streakType==='win'?'pos':(streakType==='loss'?'neg':''),
      bar: streakIcons},
    {label:"Fees paid", value: "$"+fmtNum(feesTotal,2), cls:'',
      bar: `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${feesShare}%;background:${cssVar('--warn')};"></div></div><div style="margin-top:6px;font-size:10.5px;color:var(--muted);">${fmtNum(feesShare,1)}% of gross win</div>`}
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls}">${k.value}</div>${k.bar||''}</div>`
  ).join('');
}

/* ---------------- Calendar ---------------- */
function shiftMonth(dir){
  calMonth.setMonth(calMonth.getMonth() + dir);
  renderCalendar();
}

function renderCalendar(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  document.getElementById('calLabel').textContent = calMonth.toLocaleDateString('en-US',{month:'long', year:'numeric'});

  const byDay = {};
  FILTERED.forEach(t => {
    if(!t.close_date) return;
    if(t.close_date.getFullYear() !== y || t.close_date.getMonth() !== m) return;
    const key = t.close_date.getDate();
    if(!byDay[key]) byDay[key] = {pnl:0, count:0, trades:[]};
    byDay[key].pnl += t.profit_loss || 0;
    byDay[key].count += 1;
    byDay[key].trades.push(t);
  });

  let bestDay = null, bestPnl = -Infinity;
  Object.entries(byDay).forEach(([d,v]) => { if(v.pnl > bestPnl){ bestPnl = v.pnl; bestDay = d; } });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d=>`<div class="cal-dow">${d}</div>`).join('') + `<div class="cal-dow" style="color:var(--accent);">Week</div>`;

  // build a flat list of cells (nulls = blank), padded so it splits evenly into rows of 7
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  window._calByWeek = [];

  for(let i=0; i<cells.length; i+=7){
    const weekCells = cells.slice(i, i+7);

    let weekPnl = 0, weekCount = 0, weekTrades = [];
    weekCells.forEach(d => {
      if(d === null) return;
      const info = byDay[d];
      if(info){ weekPnl += info.pnl; weekCount += info.count; weekTrades = weekTrades.concat(info.trades); }
    });

    weekCells.forEach(d => {
      if(d === null){ html += `<div class="cal-cell empty"></div>`; return; }
      const info = byDay[d];
      let cls = '', pnlHtml = '', click = '';
      if(info){
        cls = info.pnl >= 0 ? 'win' : 'loss';
        if(String(d) === bestDay) cls += ' best';
        pnlHtml = `<div class="p">${fmtMoney(info.pnl)}</div><div style="font-size:10.5px;color:var(--muted);">${info.count} trade${info.count>1?'s':''}</div>`;
        click = `onclick="showDayTrades(${y}, ${m}, ${d})"`;
      }
      html += `<div class="cal-cell ${cls}" ${click}><div class="d">${d}</div>${pnlHtml}</div>`;
    });

    // weekly summary cell
    const wkCls = weekCount > 0 ? (weekPnl >= 0 ? 'win' : 'loss') : '';
    const wkBody = weekCount > 0
      ? `<div class="p">${fmtMoney(weekPnl)}</div><div style="font-size:10.5px;color:var(--muted);">${weekCount} trade${weekCount>1?'s':''}</div>`
      : `<div style="font-size:10.5px;color:var(--muted);">—</div>`;
    const weekIdx = window._calByWeek.length;
    window._calByWeek.push({trades: weekTrades, pnl: weekPnl, count: weekCount, days: weekCells.filter(d => d !== null)});
    const wkClick = weekCount > 0 ? `onclick="showWeekTrades(${weekIdx})"` : '';
    html += `<div class="cal-cell week-cell ${wkCls}" ${wkClick}><div class="d" style="color:var(--accent);">Σ</div>${wkBody}</div>`;
  }

  document.getElementById('calGrid').innerHTML = html;
  window._calByDay = byDay;
}

/* ---------------- Equity curve ---------------- */
function renderEquityCurve(){
  const sorted = [...FILTERED].filter(t=>t.close_date).sort((a,b)=> a.close_date - b.close_date);
  let cum = 0;
  const labels = [], values = [];
  sorted.forEach(t => {
    cum += t.profit_loss || 0;
    labels.push(t.close_date.toLocaleDateString('en-US',{month:'short', day:'numeric'}));
    values.push(cum);
  });

  const ctx = document.getElementById('equityChart').getContext('2d');
  if(equityChartRef) equityChartRef.destroy();

  if(values.length === 0){
    ctx.canvas.parentElement.querySelector('canvas').style.display='none';
    return;
  }

  const finalVal = values[values.length-1];
  const lineColor = finalVal >= 0 ? cssVar('--win') : cssVar('--loss');
  const segColor = (ctx) => (ctx.p0.parsed.y < 0 || ctx.p1.parsed.y < 0) ? cssVar('--loss') : cssVar('--win');

  equityChartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        segment: {
          borderColor: segColor,
          backgroundColor: (ctx) => segColor(ctx) + '22'
        },
        fill: 'origin',
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display:false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => 'Cumulative P/L: ' + fmtMoney(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: { display: labels.length < 25, ticks:{color:cssVar('--muted'), font:{size:10}}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} }
      }
    }
  });
}

/* ---------------- Win / Loss donut ---------------- */
function renderWinLossChart(){
  const ctx = document.getElementById('winLossChart').getContext('2d');
  if(winLossChartRef) winLossChartRef.destroy();

  if(FILTERED.length === 0){
    document.getElementById('winLossLegend').innerHTML = `<div class="empty-state">No trades in view.</div>`;
    return;
  }

  // tally every distinct value actually present in win_loss
  const counts = {};
  FILTERED.forEach(t => {
    const v = (t.win_loss || '').trim() || 'Unspecified';
    counts[v] = (counts[v] || 0) + 1;
  });

  const knownColors = {
    'Win': cssVar('--win'),
    'Loss': cssVar('--loss'),
    'Breakeven': cssVar('--info'),
    'Liquidated': cssVar('--warn')
  };
  const preferredOrder = ['Win','Loss','Breakeven','Liquidated'];

  const labels = [], dataVals = [], colors = [];
  preferredOrder.forEach(k => {
    if(counts[k]){ labels.push(k); dataVals.push(counts[k]); colors.push(knownColors[k]); delete counts[k]; }
  });
  // anything left over (unexpected values) — still shown by name, not lumped as "Other"
  Object.entries(counts).forEach(([k,v]) => { labels.push(k); dataVals.push(v); colors.push(cssVar('--muted')); });

  winLossChartRef = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: dataVals, backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: { legend: { display:false } }
    }
  });

  const total = FILTERED.length;
  document.getElementById('winLossLegend').innerHTML = labels.map((label, i) => `
    <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
      <span><span style="color:${colors[i]};">●</span> ${label}</span>
      <span class="num">${dataVals[i]} (${fmtNum(dataVals[i]/total*100,1)}%)</span>
    </div>
  `).join('');
}

/* ---------------- Discipline radar ---------------- */
function renderDisciplineRadar(){
  const ctx = document.getElementById('disciplineRadar').getContext('2d');
  if(disciplineRadarRef) disciplineRadarRef.destroy();

  const t = FILTERED;
  if(t.length === 0){
    return;
  }

  const wins = t.filter(x => x.win_loss.toLowerCase() === 'win').length;
  const winRate = t.length ? (wins/t.length*100) : 0;

  const followed = t.filter(x => x.unfollowed_rules.trim().toLowerCase() === 'rules followed').length;
  const broken = t.filter(x => x.unfollowed_rules.trim() !== '' && x.unfollowed_rules.trim().toLowerCase() !== 'rules followed').length;
  const disciplineTotal = followed + broken;
  const disciplinePct = disciplineTotal ? (followed/disciplineTotal*100) : 0;

  const rrVals = t.map(x=>x.rr).filter(x => x !== null && !isNaN(x));
  const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : 0;
  const rewardScore = Math.min(Math.max(avgRR,0)/3*100, 100);

  const grossWin = t.filter(x=>x.win_loss.toLowerCase()==='win').reduce((s,x)=>s+Math.max(x.profit_loss,0),0);
  const grossLoss = Math.abs(t.filter(x=>x.win_loss.toLowerCase()==='loss').reduce((s,x)=>s+Math.min(x.profit_loss,0),0));
  const profitFactor = grossLoss > 0 ? (grossWin/grossLoss) : (grossWin > 0 ? 3 : 0);
  const consistencyScore = Math.min(profitFactor/3*100, 100);

  const badExits = t.filter(x => {
    const et = (x.exit_type||'').toLowerCase();
    const wl = (x.win_loss||'').toLowerCase();
    return et === 'sl hit' || wl === 'liquidated';
  }).length;
  const riskControlScore = t.length ? Math.max(0, 100 - (badExits/t.length*100)) : 0;

  disciplineRadarRef = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Win Rate','Discipline','Reward (RR)','Consistency (PF)','Risk Control'],
      datasets: [{
        data: [winRate, disciplinePct, rewardScore, consistencyScore, riskControlScore],
        backgroundColor: cssVar('--accent') + '33',
        borderColor: cssVar('--accent'),
        pointBackgroundColor: cssVar('--accent'),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { display:false, stepSize:20 },
          grid: { color: cssVar('--rule') },
          angleLines: { color: cssVar('--rule') },
          pointLabels: { color: cssVar('--ink'), font:{size:11} }
        }
      },
      plugins: {
        legend: { display:false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const explanations = {
                'Win Rate': 'Wins ÷ total trades in view.',
                'Discipline': '"Rules Followed" trades ÷ all trades with a discipline note logged.',
                'Reward (RR)': 'Average risk:reward ratio, scaled so RR 3.0+ = 100.',
                'Consistency (PF)': 'Profit factor (gross wins ÷ gross losses), scaled so PF 3.0+ = 100.',
                'Risk Control': '100 minus the % of trades that hit stop-loss or were liquidated.'
              };
              const label = ctx.label;
              const val = ctx.parsed.r;
              const lines = [`${label}: ${val.toFixed(0)} / 100`];
              if(explanations[label]) lines.push(explanations[label]);
              return lines;
            }
          }
        }
      }
    }
  });
}

/* ---------------- Day of week performance ---------------- */
function renderDayOfWeekChart(){
  const canvas = document.getElementById('dayOfWeekChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(dayOfWeekChartRef) dayOfWeekChartRef.destroy();

  const order = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const sums = {};
  order.forEach(d => sums[d] = {pnl:0, count:0});

  FILTERED.forEach(t => {
    const raw = (t.day_of_week || '').trim();
    const match = order.find(d => d.toLowerCase() === raw.toLowerCase());
    if(match){ sums[match].pnl += t.profit_loss || 0; sums[match].count += 1; }
  });

  const labels = order.map(d => d.slice(0,3));
  const values = order.map(d => sums[d].pnl);
  const colors = values.map(v => v >= 0 ? cssVar('--win') : cssVar('--loss'));

  dayOfWeekChartRef = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 34 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if(elements.length) showCategoryTrades('day_of_week', order[elements[0].index]);
      },
      onHover: (evt, elements) => { canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10.5}}, grid:{display:false} },
        y: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} }
      }
    }
  });
}

/* ---------------- Most traded symbols ---------------- */
function renderSymbolFrequencyChart(){
  const canvas = document.getElementById('symbolFrequencyChart');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(symbolFrequencyChartRef) symbolFrequencyChartRef.destroy();

  const counts = {};
  FILTERED.forEach(t => {
    const key = t.symbol || 'Unspecified';
    counts[key] = (counts[key] || 0) + 1;
  });

  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const labels = top.map(([k]) => k);
  const values = top.map(([,v]) => v);

  if(labels.length === 0) return;

  symbolFrequencyChartRef = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: cssVar('--accent'), borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if(elements.length) showCategoryTrades('symbol', labels[elements[0].index]);
      },
      onHover: (evt, elements) => { canvas.style.cursor = elements.length ? 'pointer' : 'default'; },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10}}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--ink'), font:{size:11}}, grid:{display:false} }
      }
    }
  });
}

/* ---------------- Modal / clickable drill-down ---------------- */
function closeModal(){
  document.getElementById('tradeModal').classList.remove('open');
}

function renderTradeCards(trades){
  if(!trades.length) return `<div class="empty-state">No trades here.</div>`;

  const sorted = [...trades].sort((a,b) => (b.close_date||0) - (a.close_date||0));

  return sorted.map(t => {
    const isWin = t.win_loss.toLowerCase() === 'win';
    const dot = isWin ? '🟢' : (t.win_loss.toLowerCase()==='loss' ? '🔴' : '⚪');
    const dateStr = t.close_date ? t.close_date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
    return `
      <div class="trade-card">
        <div class="tc-top">
          <span class="tc-symbol">${dot} ${t.symbol} <span style="color:var(--muted);font-weight:400;">${t.trade_type}</span></span>
          <span class="tc-pnl ${t.profit_loss>=0?'pos':'neg'}">${fmtMoney(t.profit_loss)}</span>
        </div>
        <div class="tc-meta">
          <span>${dateStr}</span>
          ${t.trade_setup && t.trade_setup!=='Unspecified' ? `<span>📐 ${t.trade_setup}</span>` : ''}
          ${t.session && t.session!=='Unspecified' ? `<span>🕒 ${t.session}</span>` : ''}
          ${t.rr!==null && !isNaN(t.rr) ? `<span>🎯 RR ${fmtNum(t.rr,2)}</span>` : ''}
          ${t.emotion && t.emotion!=='Unspecified' ? `<span>🧠 ${t.emotion}</span>` : ''}
        </div>
        ${t.unfollowed_rules ? `<div class="tc-notes" style="color:var(--loss);">⚠️ ${t.unfollowed_rules}</div>` : ''}
        ${t.notes ? `<div class="tc-notes">${t.notes}</div>` : ''}
        ${t.link ? `<div style="margin-top:6px;"><a href="${t.link}" target="_blank" style="color:var(--accent);font-size:11.5px;">View →</a></div>` : ''}
      </div>
    `;
  }).join('');
}

function showDayTrades(y, m, d){
  const info = window._calByDay ? window._calByDay[d] : null;
  const trades = info ? info.trades : [];
  const dateLabel = new Date(y, m, d).toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric', year:'numeric'});

  document.getElementById('modalTitle').textContent = dateLabel;
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showWeekTrades(weekIdx){
  const week = window._calByWeek ? window._calByWeek[weekIdx] : null;
  if(!week || !week.trades.length) return;

  const days = [...week.days].sort((a,b) => a-b);
  const monthLabel = calMonth.toLocaleDateString('en-US',{month:'long', year:'numeric'});
  const rangeLabel = days.length > 1 ? `${days[0]}–${days[days.length-1]} ${monthLabel}` : `${days[0]} ${monthLabel}`;

  document.getElementById('modalTitle').textContent = `Week Summary — ${rangeLabel}`;
  document.getElementById('modalSub').textContent = `${week.count} trade${week.count===1?'':'s'} · ${fmtMoney(week.pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(week.trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showCategoryTrades(field, key){
  const trades = FILTERED.filter(t => (t[field] || 'Unspecified').toString().toLowerCase() === key.toLowerCase());
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);

  document.getElementById('modalTitle').textContent = key;
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

function showDisciplineTrades(kind){
  const trades = kind === 'followed'
    ? FILTERED.filter(t => t.unfollowed_rules.trim().toLowerCase() === 'rules followed')
    : FILTERED.filter(t => t.unfollowed_rules.trim() !== '' && t.unfollowed_rules.trim().toLowerCase() !== 'rules followed');
  const pnl = trades.reduce((s,t)=>s+t.profit_loss,0);

  document.getElementById('modalTitle').textContent = kind === 'followed' ? '✅ Rules followed' : '⚠️ Rules broken';
  document.getElementById('modalSub').textContent = `${trades.length} trade${trades.length===1?'':'s'} · ${fmtMoney(pnl)}`;
  document.getElementById('modalBody').innerHTML = renderTradeCards(trades);
  document.getElementById('tradeModal').classList.add('open');
}

/* ---------------- Breakdown ---------------- */
const BREAKDOWN_FIELDS = [
  {key:'symbol', label:'Symbol'},
  {key:'trade_setup', label:'Setup'},
  {key:'pattern_type', label:'Pattern'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of week'},
];

function renderBreakdownTabs(){
  document.getElementById('breakdownTabs').innerHTML = BREAKDOWN_FIELDS.map(f =>
    `<div class="tab ${f.key===activeTab?'active':''}" onclick="setTab('${f.key}')">${f.label}</div>`
  ).join('') + `<div class="tab ${activeTab==='discipline'?'active':''}" onclick="setTab('discipline')">Discipline</div>`;
}

function setTab(key){
  activeTab = key;
  renderBreakdownTabs();
  renderBreakdown();
}

function renderBreakdown(){
  const body = document.getElementById('breakdownBody');

  if(activeTab === 'discipline'){
    const followed = FILTERED.filter(t => t.unfollowed_rules.trim().toLowerCase() === 'rules followed');
    const broken = FILTERED.filter(t => t.unfollowed_rules.trim() !== '' && t.unfollowed_rules.trim().toLowerCase() !== 'rules followed');
    const brokenPnl = broken.reduce((s,x)=>s+x.profit_loss,0);
    const followedPnl = followed.reduce((s,x)=>s+x.profit_loss,0);

    // tally common broken-rule phrases (excludes the "Rules Followed" marker itself)
    const tally = {};
    broken.forEach(t => {
      t.unfollowed_rules.split(/[,;]/).map(s=>s.trim()).filter(Boolean)
        .filter(r => r.toLowerCase() !== 'rules followed')
        .forEach(rule => { tally[rule] = (tally[rule]||0) + 1; });
    });
    const topRules = Object.entries(tally).sort((a,b)=>b[1]-a[1]).slice(0,6);

    renderBarChart(
      ['Rules followed','Rules broken'],
      [followedPnl, brokenPnl],
      [cssVar('--win'), cssVar('--loss')],
      (idx) => showDisciplineTrades(idx === 0 ? 'followed' : 'broken')
    );

    body.innerHTML = `
      <table class="breakdown">
        <tr><th></th><th>Trades</th><th>Total PnL</th><th>Win rate</th></tr>
        <tr onclick="showDisciplineTrades('followed')">
          <td style="font-family:'Inter',sans-serif;">✅ Rules followed</td>
          <td>${followed.length}</td>
          <td class="${followedPnl>=0?'pos':'neg'}">${fmtMoney(followedPnl)}</td>
          <td>${followed.length ? fmtNum(followed.filter(t=>t.win_loss.toLowerCase()==='win').length/followed.length*100,1)+'%' : '—'}</td>
        </tr>
        <tr onclick="showDisciplineTrades('broken')">
          <td style="font-family:'Inter',sans-serif;">⚠️ Rules broken</td>
          <td>${broken.length}</td>
          <td class="${brokenPnl>=0?'pos':'neg'}">${fmtMoney(brokenPnl)}</td>
          <td>${broken.length ? fmtNum(broken.filter(t=>t.win_loss.toLowerCase()==='win').length/broken.length*100,1)+'%' : '—'}</td>
        </tr>
      </table>
      ${topRules.length ? `<div style="margin-top:16px;font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Most common breaks</div>
      <table class="breakdown">${topRules.map(([rule,count])=>`<tr style="cursor:default;"><td style="font-family:'Inter',sans-serif;">${rule}</td><td>${count}×</td></tr>`).join('')}</table>` : ''}
    `;
    return;
  }

  const groups = {};
  FILTERED.forEach(t => {
    const key = t[activeTab] || 'Unspecified';
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const rows = Object.entries(groups).map(([key, trades]) => {
    const pnl = trades.reduce((s,x)=>s+x.profit_loss,0);
    const wins = trades.filter(t=>t.win_loss.toLowerCase()==='win').length;
    const winRate = trades.length ? (wins/trades.length*100) : 0;
    const rrVals = trades.map(t=>t.rr).filter(v=>v!==null && !isNaN(v));
    const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
    return {key, count: trades.length, pnl, winRate, avgRR};
  }).sort((a,b) => b.pnl - a.pnl);

  if(rows.length === 0){
    body.innerHTML = `<div class="empty-state">No data for this breakdown yet.</div>`;
    if(breakdownChartRef) breakdownChartRef.destroy();
    return;
  }

  const topRows = rows.slice(0, 10);
  renderBarChart(
    topRows.map(r => r.key),
    topRows.map(r => r.pnl),
    topRows.map(r => r.pnl >= 0 ? cssVar('--win') : cssVar('--loss')),
    (idx) => showCategoryTrades(activeTab, topRows[idx].key)
  );

  body.innerHTML = `
    <table class="breakdown">
      <tr><th>${BREAKDOWN_FIELDS.find(f=>f.key===activeTab)?.label||''}</th><th>Trades</th><th>Win rate</th><th>Avg RR</th><th>Total PnL</th></tr>
      ${rows.map(r => `
        <tr onclick="showCategoryTrades('${activeTab}', ${JSON.stringify(r.key)})">
          <td style="font-family:'Inter',sans-serif;">${r.key}</td>
          <td>${r.count}</td>
          <td>${fmtNum(r.winRate,1)}%</td>
          <td>${r.avgRR===null?'—':fmtNum(r.avgRR,2)}</td>
          <td class="${r.pnl>=0?'pos':'neg'}">${fmtMoney(r.pnl)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderBarChart(labels, values, colors, onClick){
  const canvas = document.getElementById('breakdownChart');
  const ctx = canvas.getContext('2d');
  if(breakdownChartRef) breakdownChartRef.destroy();

  breakdownChartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderRadius: 4,
        maxBarThickness: 34
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      onClick: (evt, elements) => {
        if(elements.length && onClick) onClick(elements[0].index);
      },
      onHover: (evt, elements) => {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: { legend: { display:false } },
      scales: {
        x: { ticks:{color:cssVar('--muted'), font:{size:10}, callback:v=>'$'+v}, grid:{color:cssVar('--rule')} },
        y: { ticks:{color:cssVar('--ink'), font:{size:11}}, grid:{display:false} }
      }
    }
  });
}

/* ---------------- Journal table ---------------- */
const FIELD_OPTIONS = {
  win_loss: ['Loss','Win','Breakeven','Liquidated'],
  trade_type: ['Short','Long'],
  trade_setup: ['Bounce Play','Rejection Play','Invalidation Play'],
  pattern_type: ['5 mins HL','5 mins LH','15 mins HL','15 mins LH','1 hour HL','1 hour LH','30 mins Invalidation Play','4 Hour HL','4 Hour LH'],
  execution_tf: ['1 min','3 min','5 min','15 min','30 min','1 hr'],
  aof_phase: ['IC','EM','LM','Extended Movement','Invalidation','5 mins Scalping'],
  rules_followed: ['Yes','No'],
  account_type: ['Demo','Evaluation','Funded'],
  exit_type: ['Manual Early TP - Valid','Manual Early TP - Invalid','Stop Profit','TP Hit','SL Hit','Cut Loss'],
  post_be_result: ['TP After BE','SL After BE','N/A'],
  account: ['10k','25k','50k','100k','200k','Demo'],
  session: ['Asia','London','London + NY Overlap','New York','Low Liquidity'],
  day_of_week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
};

const UNFOLLOWED_RULES_OPTIONS = [
  'Rules Followed','Early TP','Entered Early','Overleveraged','No Confirmation','Moved Stop Loss',
  'Revenge Trade','Ignored Trend','FOMO Entry','No BE at Prev High/Low','Ignored No-Trade Decision',
  'Non-BnB Setup','No Scalping Trade','Moved Take Profit','Lack of Confluence','BTC Only'
];

const OPTIONS_FIELD_META = [
  {key:'win_loss', label:'Win/Loss'},
  {key:'trade_type', label:'Trade Type'},
  {key:'trade_setup', label:'Trade Setup'},
  {key:'pattern_type', label:'Pattern Type'},
  {key:'execution_tf', label:'Execution TF'},
  {key:'aof_phase', label:'AOF Phase'},
  {key:'rules_followed', label:'Rules Followed?'},
  {key:'account_type', label:'Account Type'},
  {key:'exit_type', label:'Exit Type'},
  {key:'post_be_result', label:'Post-BE Result'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of Week'},
  {key:'unfollowed_rules', label:'Unfollowed Rules (checklist)'}
];

function getOptionsArray(key){
  return key === 'unfollowed_rules' ? UNFOLLOWED_RULES_OPTIONS : FIELD_OPTIONS[key];
}

function saveOptionsConfig(){
  try{
    localStorage.setItem('ledger-field-options', JSON.stringify(FIELD_OPTIONS));
    localStorage.setItem('ledger-unfollowed-rules-options', JSON.stringify(UNFOLLOWED_RULES_OPTIONS));
  }catch(e){}
}

function loadOptionsConfig(){
  try{
    const savedFieldOpts = JSON.parse(localStorage.getItem('ledger-field-options') || 'null');
    if(savedFieldOpts){
      Object.keys(savedFieldOpts).forEach(k => {
        if(FIELD_OPTIONS[k]){
          FIELD_OPTIONS[k].length = 0;
          FIELD_OPTIONS[k].push(...savedFieldOpts[k]);
        }
      });
    }
    const savedUnfollowed = JSON.parse(localStorage.getItem('ledger-unfollowed-rules-options') || 'null');
    if(savedUnfollowed){
      UNFOLLOWED_RULES_OPTIONS.length = 0;
      UNFOLLOWED_RULES_OPTIONS.push(...savedUnfollowed);
    }
  }catch(e){}
}

function renderOptionsEditor(){
  const picker = document.getElementById('optionsFieldPicker');
  if(!picker) return;
  if(!picker.dataset.filled){
    picker.innerHTML = OPTIONS_FIELD_META.map(f => `<option value="${f.key}">${f.label}</option>`).join('');
    picker.dataset.filled = '1';
  }
  renderOptionsListFor(picker.value);
}

function renderOptionsListFor(key){
  const arr = getOptionsArray(key) || [];
  const list = document.getElementById('optionsList');
  if(!list) return;
  list.innerHTML = arr.map((opt, i) => `
    <div class="config-option-row">
      <span>${opt}</span>
      <button onclick="removeOption('${key}', ${i})" title="Remove">✕</button>
    </div>
  `).join('') || `<div class="empty-state" style="padding:12px 0;">No options yet.</div>`;
}

function addOption(){
  const picker = document.getElementById('optionsFieldPicker');
  const input = document.getElementById('newOptionInput');
  const key = picker.value;
  const val = input.value.trim();
  if(!val) return;
  const arr = getOptionsArray(key);
  if(!arr || arr.includes(val)){ input.value = ''; return; }
  arr.push(val); // mutated in place so DRAWER_FIELDS' captured references stay in sync
  input.value = '';
  saveOptionsConfig();
  renderOptionsListFor(key);
}

function removeOption(key, index){
  const arr = getOptionsArray(key);
  if(!arr) return;
  arr.splice(index, 1);
  saveOptionsConfig();
  renderOptionsListFor(key);
}

// widget: 'text' | 'number' | 'date' | 'select' | 'checklist' | 'textarea'
// editable: true = this field gets its widget in VIEW mode too (an "Easy Edit" field).
//           In CREATE mode, every field renders its widget regardless of `editable`.
const ALL_DRAWER_FIELDS = [
  {key:'symbol', label:'Symbol', widget:'text', editable:false},
  {key:'open_date', label:'Open Date', widget:'date', editable:false},
  {key:'close_date', label:'Close Date', widget:'date', editable:false},
  {key:'duration', label:'Duration', widget:'text', editable:false},
  {key:'objective', label:'Objective', widget:'text', editable:false},
  {key:'profit_loss', label:'Profit/Loss', widget:'number', editable:true},
  {key:'pnl_percent', label:'PNL Percent', widget:'number', editable:true},
  {key:'fee', label:'Fee', widget:'number', editable:false},
  {key:'rr', label:'RR', widget:'number', editable:false},
  {key:'win_loss', label:'Win/Loss', widget:'select', editable:true, options:FIELD_OPTIONS.win_loss},
  {key:'trade_type', label:'Trade Type', widget:'select', editable:true, options:FIELD_OPTIONS.trade_type},
  {key:'trade_setup', label:'Trade Setup', widget:'select', editable:true, options:FIELD_OPTIONS.trade_setup},
  {key:'pattern_type', label:'Pattern Type', widget:'select', editable:true, options:FIELD_OPTIONS.pattern_type},
  {key:'execution_tf', label:'Execution TF', widget:'select', editable:true, options:FIELD_OPTIONS.execution_tf},
  {key:'aof_phase', label:'AOF Phase', widget:'select', editable:true, options:FIELD_OPTIONS.aof_phase},
  {key:'rules_followed', label:'Rules Followed?', widget:'select', editable:true, options:FIELD_OPTIONS.rules_followed},
  {key:'unfollowed_rules', label:'Unfollowed Rules', widget:'checklist', editable:true, options:UNFOLLOWED_RULES_OPTIONS},
  {key:'exit_type', label:'Exit Type', widget:'select', editable:true, options:FIELD_OPTIONS.exit_type},
  {key:'post_be_result', label:'Post-BE Result', widget:'select', editable:true, options:FIELD_OPTIONS.post_be_result},
  {key:'account_type', label:'Account Type', widget:'select', editable:true, options:FIELD_OPTIONS.account_type},
  {key:'account', label:'Account', widget:'select', editable:true, options:FIELD_OPTIONS.account},
  {key:'session', label:'Session', widget:'select', editable:true, options:FIELD_OPTIONS.session},
  {key:'day_of_week', label:'Day of Week', widget:'select', editable:true, options:FIELD_OPTIONS.day_of_week},
  {key:'notes', label:'Notes', widget:'textarea', editable:true},
  {key:'trade_summary', label:'Trade Summary', widget:'textarea', editable:false}
];

let FORM_FIELD_CONFIG = []; // [{key, visible}], in display order
let DRAWER_FIELDS = []; // derived: visible ALL_DRAWER_FIELDS entries, in order

function loadFormFieldConfig(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('ledger-form-field-config') || 'null'); }catch(e){}

  if(saved && Array.isArray(saved) && saved.length){
    const savedKeys = new Set(saved.map(c => c.key));
    const extra = ALL_DRAWER_FIELDS.filter(c => !savedKeys.has(c.key)).map(c => ({key:c.key, visible:true}));
    FORM_FIELD_CONFIG = [...saved.filter(c => ALL_DRAWER_FIELDS.some(m => m.key === c.key)), ...extra];
  }else{
    FORM_FIELD_CONFIG = ALL_DRAWER_FIELDS.map(c => ({key:c.key, visible:true}));
  }
  rebuildDrawerFields();
}

function rebuildDrawerFields(){
  DRAWER_FIELDS = FORM_FIELD_CONFIG
    .filter(c => c.visible)
    .map(c => ALL_DRAWER_FIELDS.find(m => m.key === c.key))
    .filter(Boolean);
}

function saveFormFieldConfig(){
  try{ localStorage.setItem('ledger-form-field-config', JSON.stringify(FORM_FIELD_CONFIG)); }catch(e){}
  rebuildDrawerFields();
}

function toggleFormFieldVisible(key, visible){
  const c = FORM_FIELD_CONFIG.find(c => c.key === key);
  if(c) c.visible = visible;
  saveFormFieldConfig();
}

function resetFormFieldConfig(){
  if(!confirm('Reset form fields to default?')) return;
  try{ localStorage.removeItem('ledger-form-field-config'); }catch(e){}
  loadFormFieldConfig();
  renderFormFieldConfigUI();
}

function renderFormFieldConfigUI(){
  const container = document.getElementById('formFieldConfigList');
  if(!container) return;
  container.innerHTML = FORM_FIELD_CONFIG.map((c) => {
    const meta = ALL_DRAWER_FIELDS.find(m => m.key === c.key);
    return `
      <div class="config-col-row" draggable="true" data-key="${c.key}">
        <span class="config-drag-handle">⠿</span>
        <label class="config-col-check">
          <input type="checkbox" ${c.visible?'checked':''} onchange="toggleFormFieldVisible('${c.key}', this.checked)">
          ${meta ? meta.label : c.key}
        </label>
      </div>
    `;
  }).join('');
  _attachDragReorder(container, FORM_FIELD_CONFIG, () => { saveFormFieldConfig(); renderFormFieldConfigUI(); });
}

const ALL_JOURNAL_COLUMNS = [
  {key:'no', label:'No.'},
  {key:'symbol', label:'Symbol'},
  {key:'win_loss', label:'Win/Loss'},
  {key:'trade_type', label:'Trade Type'},
  {key:'trade_setup', label:'Trade Setup'},
  {key:'pattern_type', label:'Pattern Type'},
  {key:'execution_tf', label:'Execution TF'},
  {key:'aof_phase', label:'AOF Phase'},
  {key:'profit_loss', label:'Profit/Loss'},
  {key:'pnl_percent', label:'PNL Percent'},
  {key:'rr', label:'RR'},
  {key:'rules_followed', label:'Rules Followed?'},
  {key:'unfollowed_rules', label:'Unfollowed Rules'},
  {key:'exit_type', label:'Exit Type'},
  {key:'post_be_result', label:'Post-BE Result'},
  {key:'account_type', label:'Account Type'},
  {key:'account', label:'Account'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of Week'},
  {key:'open_date', label:'Open Date'},
  {key:'close_date', label:'Close Date'},
  {key:'duration', label:'Duration'},
  {key:'objective', label:'Objective'},
  {key:'fee', label:'Fee'},
  {key:'notes', label:'Notes'},
  {key:'trade_summary', label:'Trade Summary'}
];

const DEFAULT_JOURNAL_COLUMN_ORDER = [
  'rules_followed','symbol','win_loss','profit_loss','exit_type','objective',
  'trade_type','pattern_type','aof_phase','execution_tf','account','account_type',
  'session','day_of_week','duration','unfollowed_rules'
];

let COLUMN_CONFIG = []; // [{key, visible}] for every ALL_JOURNAL_COLUMNS entry, in display order
let JOURNAL_COLUMNS = []; // derived: 'link' + visible columns from COLUMN_CONFIG, in order

function loadColumnConfig(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem('ledger-column-config') || 'null'); }catch(e){}

  if(saved && Array.isArray(saved) && saved.length){
    const savedKeys = new Set(saved.map(c => c.key));
    const extra = ALL_JOURNAL_COLUMNS.filter(c => !savedKeys.has(c.key)).map(c => ({key:c.key, visible:false}));
    COLUMN_CONFIG = [...saved.filter(c => ALL_JOURNAL_COLUMNS.some(m => m.key === c.key)), ...extra];
  }else{
    COLUMN_CONFIG = ALL_JOURNAL_COLUMNS
      .map(c => ({key:c.key, visible: DEFAULT_JOURNAL_COLUMN_ORDER.includes(c.key)}))
      .sort((a,b) => {
        const ai = DEFAULT_JOURNAL_COLUMN_ORDER.indexOf(a.key);
        const bi = DEFAULT_JOURNAL_COLUMN_ORDER.indexOf(b.key);
        if(ai===-1 && bi===-1) return 0;
        if(ai===-1) return 1;
        if(bi===-1) return -1;
        return ai-bi;
      });
  }
  rebuildJournalColumns();
}

function rebuildJournalColumns(){
  JOURNAL_COLUMNS = [{key:'link', label:''}, ...COLUMN_CONFIG
    .filter(c => c.visible)
    .map(c => ALL_JOURNAL_COLUMNS.find(m => m.key === c.key))
    .filter(Boolean)];
}

function saveColumnConfig(){
  try{ localStorage.setItem('ledger-column-config', JSON.stringify(COLUMN_CONFIG)); }catch(e){}
  rebuildJournalColumns();
  renderJournalTable();
}

function toggleColumnVisible(key, visible){
  const c = COLUMN_CONFIG.find(c => c.key === key);
  if(c) c.visible = visible;
  saveColumnConfig();
}

function resetColumnConfig(){
  if(!confirm('Reset columns to default?')) return;
  try{ localStorage.removeItem('ledger-column-config'); }catch(e){}
  loadColumnConfig();
  renderColumnConfigUI();
  renderJournalTable();
}

function renderColumnConfigUI(){
  const container = document.getElementById('columnConfigList');
  if(!container) return;
  container.innerHTML = COLUMN_CONFIG.map((c) => {
    const meta = ALL_JOURNAL_COLUMNS.find(m => m.key === c.key);
    return `
      <div class="config-col-row" draggable="true" data-key="${c.key}">
        <span class="config-drag-handle">⠿</span>
        <label class="config-col-check">
          <input type="checkbox" ${c.visible?'checked':''} onchange="toggleColumnVisible('${c.key}', this.checked)">
          ${meta ? meta.label : c.key}
        </label>
      </div>
    `;
  }).join('');
  _attachDragReorder(container, COLUMN_CONFIG, () => { saveColumnConfig(); renderColumnConfigUI(); });
}

/* ---------------- Shared drag-to-reorder for config lists ---------------- */
let _dragReorderKey = null;

function _attachDragReorder(container, configArr, onReorder){
  container.querySelectorAll('.config-col-row').forEach(row => {
    row.addEventListener('dragstart', () => {
      _dragReorderKey = row.dataset.key;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });
    row.addEventListener('dragover', (e) => { e.preventDefault(); });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetKey = row.dataset.key;
      if(!_dragReorderKey || _dragReorderKey === targetKey) return;
      const fromIdx = configArr.findIndex(c => c.key === _dragReorderKey);
      const toIdx = configArr.findIndex(c => c.key === targetKey);
      if(fromIdx === -1 || toIdx === -1) return;
      const [moved] = configArr.splice(fromIdx, 1);
      configArr.splice(toIdx, 0, moved);
      _dragReorderKey = null;
      onReorder();
    });
  });
}

/* ---------------- Configuration sub-tabs ---------------- */
let activeConfigTab = 'columns';

function switchConfigTab(tab){
  activeConfigTab = tab;
  document.querySelectorAll('#view-config .subnav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('#view-config .subnav-panel').forEach(el => el.classList.toggle('active', el.id === 'configPanel-' + tab));
}

const JOURNAL_FILTER_FIELDS = [
  {key:'win_loss', selectId:'filterWinLoss', prefix:'Win/Loss'},
  {key:'trade_setup', selectId:'filterSetup', prefix:'Setup'},
  {key:'session', selectId:'filterSession', prefix:'Session'},
  {key:'account', selectId:'filterAccount', prefix:'Account'},
  {key:'day_of_week', selectId:'filterDay', prefix:'Day'}
];

function populateJournalFilters(){
  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    if(!sel) return;
    const current = sel.value;
    const values = [...new Set(RAW_TRADES.map(r => r[f.key]).filter(Boolean))].sort();
    sel.innerHTML = `<option value="all">${f.prefix}: All</option>` +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
    if(values.includes(current)) sel.value = current;
  });
}

function clearJournalFilters(){
  document.getElementById('journalSearch').value = '';
  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    if(sel) sel.value = 'all';
  });
  renderJournalTable();
}

function _journalCellValue(row, key){
  if(key === 'objective') return computeObjective(row) || '—';
  if(key === 'duration') return computeDuration(row) || '—';
  if(key === 'trade_summary'){
    const plain = computeTradeSummary(row).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 120 ? plain.slice(0, 120) + '…' : plain;
  }
  if(key === 'session') return row.session || computeSession(row) || '—';
  if(key === 'day_of_week') return row.day_of_week || computeDayOfWeek(row) || '—';

  let v = row[key];
  if(v === null || v === undefined || v === '') return '—';

  if(['profit_loss','fee','pnl_percent','rr'].includes(key)){
    const num = parseFloat(v);
    if(isNaN(num)) return v;
    if(key === 'pnl_percent') return num.toFixed(2) + '%';
    return num.toFixed(2);
  }
  if(['open_date','close_date','created_at','updated_at'].includes(key)){
    const d = new Date(v);
    if(isNaN(d.getTime())) return v;
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  return String(v);
}

function _box(boxClass, text){
  return `<span class="box-badge ${boxClass}">${text}</span>`;
}

function _winLossBoxClass(winLossRaw){
  const v = (winLossRaw || '').toString().trim().toLowerCase();
  if(v === 'win') return 'box-win';
  if(v === 'loss') return 'box-loss';
  if(v === 'breakeven' || v === 'be') return 'box-be';
  return null;
}

function _journalColoredCell(key, row, plainVal){
  const raw = row[key];
  if(raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim();
  const lower = v.toLowerCase();

  if(key === 'rules_followed'){
    if(lower === 'yes') return _box('box-solid-win', v);
    if(lower === 'no') return _box('box-solid-loss', v);
  }
  if(key === 'win_loss'){
    const c = _winLossBoxClass(raw);
    if(c) return _box(c, v);
  }
  if(key === 'profit_loss' || key === 'pnl_percent'){
    const c = _winLossBoxClass(row.win_loss);
    if(c) return _box(c, plainVal);
  }
  if(key === 'exit_type'){
    if(lower === 'stop profit') return _box('box-be', v);
    if(lower === 'sl hit') return _box('box-loss', v);
    if(lower === 'tp hit') return _box('box-win', v);
    if(lower === 'cut loss') return _box('box-orange', v);
    if(lower === 'manual early tp - valid') return _box('box-win', v);
    if(lower === 'manual early tp - invalid') return _box('box-loss', v);
  }
  return null;
}

function renderJournalTable(){
  const table = document.getElementById('journalTable');
  if(!table) return;

  const query = (document.getElementById('journalSearch')?.value || '').trim().toLowerCase();

  let rows = RAW_TRADES;
  if(query){
    rows = rows.filter(r => {
      return ['symbol','position_id','trade_setup','pattern_type','session','account']
        .some(k => (r[k] || '').toString().toLowerCase().includes(query));
    });
  }

  JOURNAL_FILTER_FIELDS.forEach(f => {
    const sel = document.getElementById(f.selectId);
    const val = sel ? sel.value : 'all';
    if(val && val !== 'all'){
      rows = rows.filter(r => r[f.key] === val);
    }
  });

  // sort by No. (ascending); rows without a number fall to the end
  rows = [...rows].sort((a,b) => {
    const an = parseFloat(a.no), bn = parseFloat(b.no);
    const aValid = !isNaN(an), bValid = !isNaN(bn);
    if(aValid && bValid) return an - bn;
    if(aValid) return -1;
    if(bValid) return 1;
    return 0;
  });

  document.getElementById('journalCountLabel').textContent = `${rows.length} trade${rows.length===1?'':'s'}`;

  if(rows.length === 0){
    table.innerHTML = `<tr><td style="padding:24px;color:var(--muted);">No trades found.</td></tr>`;
    return;
  }

  const thead = `<thead><tr>${JOURNAL_COLUMNS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r => `
    <tr onclick='openDrawer("view", ${JSON.stringify(r.position_id)})' style="cursor:pointer;">
      ${JOURNAL_COLUMNS.map(c => {
        if(c.key === 'link'){
          return r.link
            ? `<td onclick="event.stopPropagation();"><a class="link-btn" href="${r.link}" target="_blank">🔗</a></td>`
            : `<td><span class="link-btn disabled">—</span></td>`;
        }
        const val = _journalCellValue(r, c.key);
        const colored = _journalColoredCell(c.key, r, val);
        if(colored){
          return `<td title="${String(r[c.key]||'').replace(/"/g,'&quot;')}">${colored}</td>`;
        }
        if(c.key === 'profit_loss'){
          const num = parseFloat(r.profit_loss);
          const cls = !isNaN(num) ? (num>=0?'pos':'neg') : '';
          return `<td class="${cls}">${val}</td>`;
        }
        return `<td title="${String(r[c.key]||'').replace(/"/g,'&quot;')}">${val}</td>`;
      }).join('')}
    </tr>
  `).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
}

/* ---------------- Drawer (view / edit / create trade) ---------------- */
let drawerMode = 'view'; // 'view' | 'create'
let drawerPositionId = null;
let drawerRowData = {};
let drawerEditing = false;

function _toISODateInput(val){
  if(!val) return '';
  const d = new Date(val);
  if(isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------- Easy Add (paste-to-prefill) ---------------- */
const EASY_ADD_FIELD_SPECS = [
  {label:'open date', valueLines:2, key:'open_date'},
  {label:'close date', valueLines:2, key:'close_date'},
  {label:'symbol', valueLines:1, key:'symbol'},
  {label:'realized p&l', valueLines:1, key:'profit_loss'},
  {label:'fee', valueLines:1, key:'fee'}
];

const EASY_ADD_TEMPLATE = `Open Date


Close Date


Symbol

Realized P&L

Fee
`;

function openEasyAddModal(){
  const input = document.getElementById('easyAddInput');
  input.value = EASY_ADD_TEMPLATE;
  document.getElementById('easyAddError').textContent = '';
  document.getElementById('easyAddModal').classList.add('open');

  // put the cursor right on the blank line under "Open Date"
  const pos = EASY_ADD_TEMPLATE.indexOf('Open Date') + 'Open Date'.length + 1;
  input.focus();
  input.setSelectionRange(pos, pos);
}

function closeEasyAddModal(){
  document.getElementById('easyAddModal').classList.remove('open');
}

function _parseExchangeDateTime(dateStr, timeStr){
  const dm = (dateStr||'').match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if(!dm) return null;
  const dd = dm[1].padStart(2,'0');
  const mm = dm[2].padStart(2,'0');
  const year = dm[3].length === 2 ? '20'+dm[3] : dm[3];
  const tm = (timeStr||'').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const hh = tm ? tm[1].padStart(2,'0') : '00';
  const min = tm ? tm[2] : '00';
  const ss = tm && tm[3] ? tm[3] : '00';
  return `${year}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

function parseEasyAddText(){
  const raw = document.getElementById('easyAddInput').value;
  const errEl = document.getElementById('easyAddError');
  errEl.textContent = '';

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = {};
  let foundAny = false;

  EASY_ADD_FIELD_SPECS.forEach(spec => {
    const idx = lines.findIndex(l => l.toLowerCase() === spec.label);
    if(idx === -1) return;
    const values = lines.slice(idx+1, idx+1+spec.valueLines);
    if(values.length < spec.valueLines) return;

    if(spec.key === 'open_date' || spec.key === 'close_date'){
      const iso = _parseExchangeDateTime(values[0], values[1]);
      if(iso){ parsed[spec.key] = iso; foundAny = true; }
    }else if(spec.key === 'symbol'){
      let sym = values[0].toUpperCase();
      if(!sym.includes('/')) sym += '/USD';
      parsed.symbol = sym;
      foundAny = true;
    }else{
      const num = parseFloat(values[0].replace(/,/g,''));
      if(!isNaN(num)){ parsed[spec.key] = num; foundAny = true; }
    }
  });

  if(!foundAny){
    errEl.textContent = "Couldn't recognize any fields in that text. Make sure you copied the full position card.";
    return;
  }

  closeEasyAddModal();
  openDrawer('create', null, parsed);
}

function openDrawer(mode, positionId, prefill){
  drawerMode = mode;
  drawerPositionId = positionId || null;
  drawerEditing = (mode === 'create');
  drawerRowData = mode === 'view' ? (RAW_TRADES.find(r => r.position_id === positionId) || {}) : (prefill || {});

  renderDrawerFields();

  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function enterEditMode(){
  drawerEditing = true;
  renderDrawerFields();
}

function renderDrawerFields(){
  const mode = drawerMode;
  const row = drawerRowData;

  document.getElementById('drawerTitle').textContent = mode === 'create'
    ? 'Add trade'
    : (row.symbol || 'Trade') + (row.no ? ` · #${row.no}` : '');
  document.getElementById('drawerDeleteBtn').style.display = mode === 'view' ? 'inline-block' : 'none';
  document.getElementById('drawerEditBtn').style.display = (mode === 'view' && !drawerEditing) ? 'inline-block' : 'none';
  document.getElementById('drawerSaveBtn').style.display = (mode === 'create' || drawerEditing) ? 'inline-block' : 'none';
  document.getElementById('drawerSaveBtn').textContent = mode === 'create' ? 'Add trade' : 'Save changes';
  document.getElementById('drawerError').textContent = '';

  const body = document.getElementById('drawerBody');
  body.innerHTML = DRAWER_FIELDS.map(f => {
    if(f.key === 'objective' || f.key === 'duration'){
      const computed = f.key === 'objective' ? computeObjective(row) : computeDuration(row);
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${computed || '—'}</div></div>`;
    }
    if(f.key === 'trade_summary'){
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${computeTradeSummary(row)}</div></div>`;
    }

    const showWidget = mode === 'create' || f.editable || drawerEditing;
    let raw = row[f.key];
    if(!raw && f.key === 'session') raw = computeSession(row) || '';
    if(!raw && f.key === 'day_of_week') raw = computeDayOfWeek(row) || '';

    if(!showWidget){
      const display = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${display}</div></div>`;
    }

    if(f.widget === 'select'){
      const opts = f.options.map(o => `<option value="${o}" ${raw===o?'selected':''}>${o}</option>`).join('');
      const onchange = f.key === 'account' ? ` onchange="syncAccountTypeFromAccount(this.value)"` : '';
      return `<div class="field-row"><label>${f.label}</label><select data-field="${f.key}"${onchange}><option value="">—</option>${opts}</select></div>`;
    }
    if(f.widget === 'checklist'){
      const selected = (raw || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
      const boxes = f.options.map(o => `
        <label><input type="checkbox" data-checklist="${f.key}" value="${o}" ${selected.includes(o)?'checked':''}> ${o}</label>
      `).join('');
      return `<div class="field-row"><label>${f.label}</label><div class="checklist-box">${boxes}</div></div>`;
    }
    if(f.widget === 'date'){
      return `<div class="field-row"><label>${f.label}</label><input type="datetime-local" data-field="${f.key}" value="${_toISODateInput(raw)}"></div>`;
    }
    if(f.widget === 'number'){
      return `<div class="field-row"><label>${f.label}</label><input type="number" step="any" data-field="${f.key}" value="${raw!==undefined&&raw!==null?raw:''}"></div>`;
    }
    if(f.widget === 'textarea'){
      return `<div class="field-row"><label>${f.label}</label><textarea data-field="${f.key}">${raw||''}</textarea></div>`;
    }
    return `<div class="field-row"><label>${f.label}</label><input type="text" data-field="${f.key}" value="${raw!==undefined&&raw!==null?raw:''}"></div>`;
  }).join('');
}

function closeDrawer(){
  document.getElementById('drawerOverlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
}

function _collectDrawerPatch(){
  const patch = {};

  document.querySelectorAll('#drawerBody [data-field]').forEach(el => {
    const key = el.dataset.field;
    let val = el.value;
    if(val === '') val = null;
    if(el.type === 'number' && val !== null) val = parseFloat(val);
    patch[key] = val;
  });

  // checklist fields (currently just unfollowed_rules) — join checked values
  const checklistKeys = new Set();
  document.querySelectorAll('#drawerBody [data-checklist]').forEach(el => checklistKeys.add(el.dataset.checklist));
  checklistKeys.forEach(key => {
    const checked = [...document.querySelectorAll(`#drawerBody [data-checklist="${key}"]:checked`)].map(el => el.value);
    patch[key] = checked.join(', ');
  });

  return patch;
}

async function saveDrawer(){
  const errEl = document.getElementById('drawerError');
  errEl.textContent = '';
  const saveBtn = document.getElementById('drawerSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try{
    const patch = _collectDrawerPatch();

    if(drawerMode === 'create'){
      const maxNo = RAW_TRADES.reduce((m,r) => { const n = parseFloat(r.no); return !isNaN(n) && n>m ? n : m; }, 0);
      patch.no = patch.no || (maxNo + 1);
      patch.position_id = 'WEB-' + Date.now().toString(36).toUpperCase();

      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${USER_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      if(!res.ok) throw new Error(await res.text());
      const inserted = await res.json();
      RAW_TRADES.push(inserted[0] || patch);

    }else{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?position_id=eq.${encodeURIComponent(drawerPositionId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${USER_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(patch)
      });
      if(!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      const idx = RAW_TRADES.findIndex(r => r.position_id === drawerPositionId);
      if(idx > -1 && updated[0]) RAW_TRADES[idx] = updated[0];
    }

    ALL_TRADES = RAW_TRADES.map(normalizeTrade);
    populateAccountFilter();
    populateJournalFilters();
    applyFilters();
    renderJournalTable();

    const oldAccount = drawerMode === 'create' ? null : (drawerRowData.account || null);
    const oldPL = drawerMode === 'create' ? 0 : (parseFloat(drawerRowData.profit_loss) || 0);
    const newAccount = patch.account || null;
    const newPL = parseFloat(patch.profit_loss) || 0;
    if(oldAccount === newAccount){
      if(newAccount) await adjustAccountBalance(newAccount, newPL - oldPL);
    }else{
      if(oldAccount) await adjustAccountBalance(oldAccount, -oldPL);
      if(newAccount) await adjustAccountBalance(newAccount, newPL);
    }

    closeDrawer();

  }catch(e){
    errEl.textContent = "Couldn't save: " + e.message + ". Make sure your Supabase table has INSERT/UPDATE policies enabled for this key.";
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = drawerMode === 'create' ? 'Add trade' : 'Save changes';
  }
}

async function deleteDrawer(){
  if(!drawerPositionId) return;
  if(!confirm('Delete this trade permanently? This cannot be undone.')) return;

  const errEl = document.getElementById('drawerError');
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?position_id=eq.${encodeURIComponent(drawerPositionId)}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());

    const deletedAccount = drawerRowData.account || null;
    const deletedPL = parseFloat(drawerRowData.profit_loss) || 0;

    RAW_TRADES = RAW_TRADES.filter(r => r.position_id !== drawerPositionId);
    ALL_TRADES = RAW_TRADES.map(normalizeTrade);
    populateAccountFilter();
    populateJournalFilters();
    applyFilters();
    renderJournalTable();

    if(deletedAccount) await adjustAccountBalance(deletedAccount, -deletedPL);

    closeDrawer();

  }catch(e){
    errEl.textContent = "Couldn't delete: " + e.message + ". Make sure your Supabase table has a DELETE policy enabled for this key.";
  }
}

/* ---------------- AI Insights ---------------- */
async function generateInsights(){
  const btn = document.getElementById('aiBtn');
  const out = document.getElementById('aiOutput');
  btn.disabled = true;
  btn.textContent = "Thinking…";
  out.style.display = 'block';
  out.textContent = "Analyzing your trades…";

  const summary = buildSummaryForAI();

  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a trading coach reviewing a trader's journal data. Be direct, specific, and concise — no generic platitudes. Base every observation only on the numbers given. Structure your reply as:\n1. A one-line honest read of current performance.\n2. 2-3 specific patterns you notice (best/worst setup, session, emotion, discipline correlation, etc.)\n3. One or two concrete adjustments to try next, tied directly to the data.\nKeep it under 180 words. Do not use markdown headers, just plain text with line breaks.\n\nHere is the trader's data:\n${JSON.stringify(summary, null, 2)}`
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || "").join("\n").trim();
    out.textContent = text || "Couldn't generate insights from this response — try again.";
  }catch(e){
    out.textContent = "AI insights aren't available in this environment. If you've deployed this dashboard outside of Claude, you'll need to wire this button to your own Anthropic API key via a small backend proxy (the direct browser call only works inside Claude's artifact sandbox).";
  }finally{
    btn.disabled = false;
    btn.textContent = "Generate insights";
  }
}

function buildSummaryForAI(){
  const t = FILTERED;
  const wins = t.filter(x=>x.win_loss.toLowerCase()==='win');
  const losses = t.filter(x=>x.win_loss.toLowerCase()==='loss');
  const totalPnl = t.reduce((s,x)=>s+x.profit_loss,0);

  function groupSummary(field){
    const groups = {};
    t.forEach(tr => {
      const key = tr[field] || 'Unspecified';
      if(!groups[key]) groups[key] = {count:0, pnl:0, wins:0};
      groups[key].count++;
      groups[key].pnl += tr.profit_loss;
      if(tr.win_loss.toLowerCase()==='win') groups[key].wins++;
    });
    return Object.entries(groups).map(([k,v]) => ({name:k, trades:v.count, pnl: +v.pnl.toFixed(2), win_rate: +(v.wins/v.count*100).toFixed(1)}));
  }

  const broken = t.filter(x => x.unfollowed_rules.trim() !== '');

  return {
    total_trades: t.length,
    total_pnl: +totalPnl.toFixed(2),
    win_rate: t.length ? +(wins.length/t.length*100).toFixed(1) : 0,
    avg_rr: (()=>{const v=t.map(x=>x.rr).filter(x=>x!==null&&!isNaN(x)); return v.length? +(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2):null;})(),
    by_setup: groupSummary('trade_setup'),
    by_session: groupSummary('session'),
    by_emotion: groupSummary('emotion'),
    by_day_of_week: groupSummary('day_of_week'),
    trades_with_broken_rules: broken.length,
    broken_rules_pnl: +broken.reduce((s,x)=>s+x.profit_loss,0).toFixed(2)
  };
}

let toastTimer = null;
function showToast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------------- Trade Alerts (individual bot alerts, from signal_alerts) ---------------- */
let SIGNAL_ALERTS = [];

async function manualRefreshAlerts(){
  await loadSignalAlerts();
  const newCount = SIGNAL_ALERTS.filter(isNewSignal).length;
  showToast(newCount === 0 ? '✅ Data refreshed — no new alerts' : `✅ Data refreshed — ${newCount} new alert${newCount>1?'s':''}`);
}

let alertsSeenFilter = 'all';
function switchAlertsSeenFilter(f){
  alertsSeenFilter = f;
  document.querySelectorAll('#alertsSeenFilterTabs .tab').forEach(el => el.classList.toggle('active', el.dataset.f === f));
  renderAlertsTables();
}

let lastAlertsSyncAt = null;

async function loadSignalAlerts(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?select=*&order=alert_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    SIGNAL_ALERTS = await res.json();
    lastAlertsSyncAt = new Date();
  }catch(e){
    console.error("Couldn't load signal alerts:", e);
    SIGNAL_ALERTS = [];
  }
  if(isAdminUser()) await loadSignalOutcomes();
  renderAlertsTables();
}

/* ---------------- Signal outcome tracking (Bitcoin accuracy, admin-only) ---------------- */
let SIGNAL_OUTCOMES = [];

async function loadSignalOutcomes(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_outcomes?select=*&order=noted_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    SIGNAL_OUTCOMES = await res.json();
  }catch(e){
    console.error("Couldn't load signal outcomes:", e);
    SIGNAL_OUTCOMES = [];
  }
}

function signalAccuracyFor(symbol){
  const rows = SIGNAL_OUTCOMES.filter(o => o.symbol === symbol);
  const played = rows.filter(o => o.outcome === 'played_out').length;
  return { total: rows.length, played, pct: rows.length ? Math.round((played / rows.length) * 100) : null };
}

function outcomeFor(symbol, setup){
  return SIGNAL_OUTCOMES.find(o => o.symbol === symbol && o.setup === (setup || ''));
}

async function recordSignalOutcome(symbol, setup, outcome){
  if(!isAdminUser()) return;
  try{
    // Upserts on (symbol, setup) — re-clicking for the same setup updates the
    // existing row instead of adding a duplicate, so re-tallying is safe and
    // the button state is editable (you can change your mind).
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_outcomes?on_conflict=symbol,setup`, {
      method: 'POST',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
      },
      body: JSON.stringify([{ symbol, setup: setup || '', outcome, noted_at: new Date().toISOString() }])
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't record signal outcome:", e);
    const hint = /relation .* does not exist/i.test(e.message) ? "\n\nLooks like the signal_outcomes table doesn't exist yet — run supabase_signal_outcomes.sql in your Supabase SQL editor."
      : /no unique or exclusion constraint/i.test(e.message) ? "\n\nYour signal_outcomes table is missing the UNIQUE(symbol, setup) constraint — re-run the latest supabase_signal_outcomes.sql in your Supabase SQL editor."
      : "";
    alert("Couldn't save that — please try again." + hint);
    return;
  }
  await loadSignalOutcomes();
  renderAlertsTables();
  if(currentAlertDetailId !== null) openAlertDetail(currentAlertDetailId);
}

function fmtSignalVolume(vol){
  const n = parseFloat(vol);
  if(vol === null || vol === undefined || isNaN(n)) return '—';
  if(n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if(n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if(n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

function fmtSignalTime(ts){
  if(!ts) return '—';
  const d = new Date(ts);
  if(isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

function isNewSignal(s){
  return !s.seen;
}

async function markAlertSeen(id){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ seen: true })
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't mark alert as seen:", e);
  }
}

async function deleteAlert(id){
  if(!confirm('Delete this alert? This cannot be undone.')) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't delete alert:", e);
    showToast("Couldn't delete that alert — please try again.");
    return;
  }
  SIGNAL_ALERTS = SIGNAL_ALERTS.filter(s => s.id !== id);
  renderAlertsTables();
}

function activeAlertsTab(){
  const el = document.querySelector('#view-alerts .subnav-item.active');
  return el ? el.dataset.tab : 'bitcoin';
}

async function markAllAlertsSeen(){
  const category = activeAlertsTab();
  const unseenIds = SIGNAL_ALERTS.filter(s => s.category === category && !s.seen).map(s => s.id);
  if(!unseenIds.length){ showToast('No new alerts to mark as read.'); return; }
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=in.(${unseenIds.join(',')})`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ seen: true })
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't mark alerts as read:", e);
    showToast("Couldn't mark alerts as read — please try again.");
    return;
  }
  SIGNAL_ALERTS.forEach(s => { if(unseenIds.includes(s.id)) s.seen = true; });
  renderAlertsTables();
  showToast(`✅ Marked ${unseenIds.length} alert${unseenIds.length>1?'s':''} as read`);
}

async function deleteOldAlerts(){
  const category = activeAlertsTab();
  const seenIds = SIGNAL_ALERTS.filter(s => s.category === category && s.seen).map(s => s.id);
  if(!seenIds.length){ showToast('No seen alerts to delete.'); return; }
  if(!confirm(`Delete ${seenIds.length} seen alert${seenIds.length>1?'s':''}? This cannot be undone.`)) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/signal_alerts?id=in.(${seenIds.join(',')})`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(e){
    console.error("Couldn't delete old alerts:", e);
    showToast("Couldn't delete old alerts — please try again.");
    return;
  }
  SIGNAL_ALERTS = SIGNAL_ALERTS.filter(s => !seenIds.includes(s.id));
  renderAlertsTables();
  showToast(`🗑 Deleted ${seenIds.length} seen alert${seenIds.length>1?'s':''}`);
}

function renderAlertsTables(){
  renderAlertsTableFor('bitcoin');
  renderAlertsTableFor('altcoin');
  const label = document.getElementById('alertsCountLabel');
  if(label){
    if(!SIGNAL_ALERTS.length){
      label.textContent = 'No alerts yet — check your bot scripts are running.';
    }else{
      const newCount = SIGNAL_ALERTS.filter(isNewSignal).length;
      label.textContent = `${SIGNAL_ALERTS.length} alert${SIGNAL_ALERTS.length===1?'':'s'}`
        + (newCount ? ` · 🆕 ${newCount} new` : '');
    }
  }
  const syncLabel = document.getElementById('alertsLastSync');
  if(syncLabel){
    syncLabel.textContent = lastAlertsSyncAt
      ? `Last synced: ${lastAlertsSyncAt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`
      : '';
  }
}

function renderAlertsTableFor(category){
  const table = document.getElementById('alertsTable-' + category);
  if(!table) return;
  let rows = SIGNAL_ALERTS.filter(s => s.category === category);
  if(alertsSeenFilter === 'new') rows = rows.filter(isNewSignal);
  else if(alertsSeenFilter === 'seen') rows = rows.filter(s => !isNewSignal(s));

  if(rows.length === 0){
    table.innerHTML = `<tr><td style="padding:24px;color:var(--muted);">No alerts ${alertsSeenFilter === 'all' ? 'yet' : `in "${alertsSeenFilter}"`}.</td></tr>`;
    return;
  }

  const thead = `<thead><tr><th>Symbol</th><th>Setup</th><th>Volume</th><th>Received</th><th style="text-align:right;"></th></tr></thead>`;
  const tbody = `<tbody>${rows.map(r => {
    let outcomeIcon = '';
    if(r.category === 'bitcoin' && isAdminUser()){
      const o = outcomeFor(r.symbol, r.setup || '');
      if(o) outcomeIcon = o.outcome === 'played_out' ? ' ✅' : ' ❌';
    }
    const isNew = isNewSignal(r);
    return `
    <tr onclick='openAlertDetail(${r.id})' style="cursor:pointer;">
      <td>${r.symbol}</td>
      <td>${escapeHtml(r.setup) || '—'}${outcomeIcon}</td>
      <td>${fmtSignalVolume(r.volume)}</td>
      <td>${fmtSignalTime(r.alert_at)}</td>
      <td onclick="event.stopPropagation();" style="text-align:right;">
        <div style="display:inline-flex;align-items:center;gap:8px;">
          ${r.tradingview_url ? `<a class="link-btn" href="${r.tradingview_url}" target="_blank">🔗</a>` : `<span class="link-btn disabled">—</span>`}
          ${isNew ? '<span class="pill pill-blue">NEW</span>' : '<span class="pill pill-muted">Seen</span>'}
          ${!isNew ? `<button class="drawer-danger-btn" style="padding:4px 10px;font-size:11px;" onclick='deleteAlert(${r.id})'>🗑</button>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('')}</tbody>`;
  table.innerHTML = thead + tbody;
}

function switchAlertsTab(tab){
  document.querySelectorAll('#view-alerts .subnav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('#view-alerts .subnav-panel').forEach(el => el.classList.toggle('active', el.id === 'alertsPanel-' + tab));
}

let currentAlertDetailId = null;

function openAlertDetail(id){
  const s = SIGNAL_ALERTS.find(x => x.id === id);
  if(!s) return;
  currentAlertDetailId = id;

  const alertTime = s.alert_at
    ? new Date(s.alert_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : '—';

  let outcomeBlock = '';
  if(s.category === 'bitcoin' && isAdminUser()){
    const acc = signalAccuracyFor(s.symbol);
    const accLine = acc.total
      ? `${acc.played}/${acc.total} played out so far (${acc.pct}%)`
      : `No history logged yet — start tracking below.`;
    const setupKey = s.setup || '';
    const setupArg = JSON.stringify(setupKey);
    const existing = outcomeFor(s.symbol, setupKey);
    const playedCls = existing?.outcome === 'played_out' ? ' active-played' : '';
    const notCls = existing?.outcome === 'not_played_out' ? ' active-not' : '';
    outcomeBlock = `
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--rule);">
        <div style="margin-bottom:10px;font-size:12.5px;color:var(--muted);">📊 <strong style="color:var(--ink);">Your accuracy:</strong> ${accLine}</div>
        <div style="display:flex;gap:10px;">
          <button class="outcome-btn${playedCls}" style="flex:1;" onclick='recordSignalOutcome(${JSON.stringify(s.symbol)}, ${setupArg}, "played_out")'>✅ Played Out</button>
          <button class="outcome-btn${notCls}" style="flex:1;" onclick='recordSignalOutcome(${JSON.stringify(s.symbol)}, ${setupArg}, "not_played_out")'>❌ Invalidated</button>
        </div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted);">Tracking setup: "${setupKey || '—'}" — click again to change your answer.</div>
      </div>
    `;
  }

  document.getElementById('modalTitle').textContent = `${s.symbol} — ${s.setup || 'Alert'}`;
  document.getElementById('modalSub').textContent = `Time: ${alertTime}`;
  document.getElementById('modalBody').innerHTML = `
    <div style="margin-bottom:14px;white-space:pre-line;">${escapeHtml(s.message) || '—'}</div>
    <div style="margin-bottom:14px;"><strong>Volume:</strong> ${fmtSignalVolume(s.volume)}</div>
    ${s.tradingview_url ? `<div style="margin-top:16px;"><a href="${s.tradingview_url}" target="_blank" style="color:var(--accent);">View on TradingView →</a></div>` : ''}
    ${outcomeBlock}
  `;
  document.getElementById('tradeModal').classList.add('open');

  if(!s.seen){
    s.seen = true;
    markAlertSeen(s.id);
    renderAlertsTables();
  }
}

/* ---------------- Achievements (private per-user gallery) ---------------- */
let ACHIEVEMENTS = [];
let activeAchievementTab = 'all';
const ACH_CATEGORIES = ['Tournament', 'Withdrawal'];

async function loadAchievements(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?select=*&order=created_at.desc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    ACHIEVEMENTS = await Promise.all(rows.map(async r => {
      const { data, error } = await sb.storage.from('achievements').createSignedUrl(r.image_path, 3600);
      return { ...r, imageUrl: error ? null : data.signedUrl };
    }));
  }catch(e){
    console.error("Couldn't load achievements:", e);
    ACHIEVEMENTS = [];
  }
  renderAchievementTabs();
  renderAchievementGrid();
}

function renderAchievementTabs(){
  const wrap = document.getElementById('achievementTabs');
  if(!wrap) return;
  const tabs = ['all', ...ACH_CATEGORIES];
  wrap.innerHTML = tabs.map(t =>
    `<div class="tab ${activeAchievementTab===t?'active':''}" onclick="switchAchievementTab('${t}')">${t==='all'?'All':t}</div>`
  ).join('');
}

function switchAchievementTab(tab){
  activeAchievementTab = tab;
  renderAchievementTabs();
  renderAchievementGrid();
}

function renderAchievementGrid(){
  const grid = document.getElementById('achievementGrid');
  if(!grid) return;
  const label = document.getElementById('achievementsCountLabel');
  if(label) label.textContent = `${ACHIEVEMENTS.length} achievement${ACHIEVEMENTS.length===1?'':'s'} uploaded`;

  const rows = activeAchievementTab === 'all' ? ACHIEVEMENTS : ACHIEVEMENTS.filter(a => a.category === activeAchievementTab);

  if(rows.length === 0){
    grid.innerHTML = `<div class="empty-state">No achievements in this category yet.</div>`;
    return;
  }

  grid.innerHTML = rows.map(a => `
    <div class="ach-card" onclick='openAchievementDetail(${a.id})'>
      ${a.imageUrl
        ? `<img src="${a.imageUrl}">`
        : `<div style="height:150px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px;">Image unavailable</div>`}
      <div class="ach-card-body">
        <div class="subject">${escapeHtml(a.subject)}</div>
        ${a.body ? `<div class="body-text">${escapeHtml(a.body)}</div>` : ''}
        <div class="meta-row">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <span class="pill ${a.category==='Tournament'?'pill-blue':'pill-green'}">${a.category}</span>
            ${a.category === 'Withdrawal' && a.amount != null ? `<span class="pill pill-orange">$${Number(a.amount).toFixed(2)}</span>` : ''}
          </div>
          <span class="date">${new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
        </div>
      </div>
    </div>
  `).join('');
}

let editingAchievementId = null;

function toggleAchAmountField(){
  const isWithdrawal = document.getElementById('achCategory').value === 'Withdrawal';
  document.getElementById('achAmountRow').style.display = isWithdrawal ? 'block' : 'none';
}

function openAchievementModal(id){
  editingAchievementId = id || null;
  const a = id ? ACHIEVEMENTS.find(x => x.id === id) : null;

  document.getElementById('achModalTitle').textContent = a ? 'Edit Achievement' : '+ Add Achievement';
  document.getElementById('achCategory').value = a ? a.category : 'Tournament';
  document.getElementById('achAmount').value = a && a.amount != null ? a.amount : '';
  document.getElementById('achSubject').value = a ? a.subject : '';
  document.getElementById('achBody').value = a ? (a.body || '') : '';
  document.getElementById('achImage').value = '';
  document.getElementById('achImageHint').textContent = a ? 'Leave empty to keep the current image.' : '';
  document.getElementById('achUploadError').textContent = '';
  document.getElementById('achUploadBtn').textContent = a ? 'Save changes' : 'Upload';
  toggleAchAmountField();
  document.getElementById('achievementModal').classList.add('open');
}
function closeAchievementModal(){
  document.getElementById('achievementModal').classList.remove('open');
}

async function saveAchievement(){
  const category = document.getElementById('achCategory').value;
  const amount = category === 'Withdrawal' && document.getElementById('achAmount').value !== ''
    ? parseFloat(document.getElementById('achAmount').value)
    : null;
  const subject = document.getElementById('achSubject').value.trim();
  const body = document.getElementById('achBody').value.trim();
  const fileInput = document.getElementById('achImage');
  const file = fileInput.files[0];
  const errEl = document.getElementById('achUploadError');
  const btn = document.getElementById('achUploadBtn');
  errEl.textContent = '';

  if(!subject){ errEl.textContent = 'Subject is required.'; return; }
  if(!editingAchievementId && !file){ errEl.textContent = 'Please choose an image.'; return; }

  btn.disabled = true;
  btn.textContent = editingAchievementId ? 'Saving…' : 'Uploading…';

  try{
    const { data: { user } } = await sb.auth.getUser();
    const existing = editingAchievementId ? ACHIEVEMENTS.find(a => a.id === editingAchievementId) : null;
    let imagePath = existing ? existing.image_path : null;

    if(file){
      const newPath = `${user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const { error: uploadErr } = await sb.storage.from('achievements').upload(newPath, file);
      if(uploadErr) throw uploadErr;
      if(existing) await sb.storage.from('achievements').remove([existing.image_path]);
      imagePath = newPath;
    }

    const res = editingAchievementId
      ? await fetch(`${SUPABASE_URL}/rest/v1/achievements?id=eq.${editingAchievementId}`, {
          method: 'PATCH',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({ category, subject, body, amount, image_path: imagePath })
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/achievements`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify([{ category, subject, body, amount, image_path: imagePath }])
        });
    if(!res.ok) throw new Error(await res.text());

    closeAchievementModal();
    closeAchievementDetail();
    await loadAchievements();
  }catch(e){
    console.error("Couldn't save achievement:", e);
    const msg = e?.message || e?.error_description || String(e);
    let hint = '';
    if(/bucket not found/i.test(msg)) hint = ' The "achievements" storage bucket doesn\'t exist yet — create it in Supabase Storage (Storage > New bucket, name it exactly "achievements", Public OFF).';
    else if(/row-level security/i.test(msg)) hint = ' Missing storage permissions — re-run the storage policy section of supabase_achievements.sql in the SQL editor.';
    else if(/relation .* does not exist/i.test(msg)) hint = ' The achievements table doesn\'t exist yet — run supabase_achievements.sql in the SQL editor.';
    errEl.textContent = "Couldn't save: " + msg + hint;
  }finally{
    btn.disabled = false;
    btn.textContent = editingAchievementId ? 'Save changes' : 'Upload';
  }
}

async function deleteAchievement(id, imagePath){
  if(!confirm('Delete this achievement?')) return;
  try{
    await sb.storage.from('achievements').remove([imagePath]);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    closeAchievementDetail();
    await loadAchievements();
  }catch(e){
    console.error("Couldn't delete achievement:", e);
    alert("Couldn't delete — please try again.");
  }
}

function openAchievementDetail(id){
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if(!a) return;
  document.getElementById('achDetailImg').src = a.imageUrl || '';
  document.getElementById('achDetailSubject').textContent = a.subject;
  document.getElementById('achDetailCategory').textContent = a.category;
  document.getElementById('achDetailCategory').className = 'pill ' + (a.category === 'Tournament' ? 'pill-blue' : 'pill-green');
  const amountEl = document.getElementById('achDetailAmount');
  if(a.category === 'Withdrawal' && a.amount != null){
    amountEl.textContent = `$${Number(a.amount).toFixed(2)}`;
    amountEl.style.display = 'inline-flex';
  }else{
    amountEl.style.display = 'none';
  }
  document.getElementById('achDetailDate').textContent = new Date(a.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('achDetailBody').textContent = a.body || '—';
  document.getElementById('achDetailEditBtn').onclick = () => { closeAchievementDetail(); openAchievementModal(id); };
  document.getElementById('achDetailDeleteBtn').onclick = () => deleteAchievement(id, a.image_path);
  document.getElementById('achievementDetailModal').classList.add('open');
}
function closeAchievementDetail(){
  document.getElementById('achievementDetailModal').classList.remove('open');
}

function openLightbox(url){
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightboxModal').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightboxModal').classList.remove('open');
}

/* ---------------- Market News (TradingView economic calendar embed) ---------------- */
let newsWidgetLoaded = false;
function loadMarketNewsWidget(){
  if(newsWidgetLoaded) return;
  newsWidgetLoaded = true;
  const container = document.getElementById('newsWidgetContainer');
  if(!container) return;
  container.innerHTML = `<div class="tradingview-widget-container" style="height:100%;width:100%;"><div class="tradingview-widget-container__widget"></div></div>`;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
  script.async = true;
  script.text = JSON.stringify({
    colorTheme: isLight ? 'light' : 'dark',
    isTransparent: false,
    width: "100%",
    height: "100%",
    locale: "en",
    importanceFilter: "-1,0,1",
    countryFilter: "us,eu,gb,jp,cn,au,ca,nz,ch"
  });
  container.querySelector('.tradingview-widget-container').appendChild(script);
}

/* ---------------- Challenges ---------------- */

const CHALLENGE_ICONS = {
  shield: '<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  scale: '<path d="M12 3v18M9 3h6M5 8l-3 6a4 4 0 0 0 8 0l-3-6M19 8l-3 6a4 4 0 0 0 8 0l-3-6M5 8h14"/>',
  'shield-check': '<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>',
  flame: '<path d="M12 2c-2 4-6 6-6 11a6 6 0 0 0 12 0c0-2-1-3-2-4 0 2-1 3-2 3-1.5 0-2-1.5-1-3 1-2 0-5-1-7z"/>',
  'trending-up': '<polyline points="3 17 9 11 13 15 21 6"/><polyline points="14 6 21 6 21 13"/>',
  'trending-down': '<polyline points="3 7 9 13 13 9 21 18"/><polyline points="14 18 21 18 21 11"/>',
  octagon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'bar-chart': '<line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trophy: '<circle cx="12" cy="8" r="6"/><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  ban: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5 7 21l5-2.5 5 2.5-2-7.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
};
function challengeIconSVG(name){
  return `<svg viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${CHALLENGE_ICONS[name] || CHALLENGE_ICONS.star}</svg>`;
}

// Thresholds are spaced across the full point pool from all 26 challenges
// (~1980 points max) so "Legendary" still means having done nearly
// everything, instead of capping out with lots of unused headroom.
const CHALLENGE_RANKS = [
  {min:0, label:'Novice Trader'},
  {min:250, label:'Apprentice Trader'},
  {min:500, label:'Skilled Trader'},
  {min:800, label:'Expert Trader'},
  {min:1150, label:'Master Trader'},
  {min:1500, label:'Elite Trader'},
  {min:1850, label:'Legendary Trader'}
];
function rankForPoints(points){
  let current = CHALLENGE_RANKS[0], next = null;
  for(const r of CHALLENGE_RANKS){
    if(points >= r.min) current = r; else { next = r; break; }
  }
  return { current, next };
}

let COMPUTED_CHALLENGES = [];
let challengeFilter = 'all';

function getWeekKey(d){
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

async function loadAchievementSummaryForChallenges(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/achievements?select=category,created_at,amount`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    return await res.json();
  }catch(e){
    console.error("Couldn't load achievement summary:", e);
    return [];
  }
}

function computeChallenges(trades, achRows){
  const closed = trades.filter(t => t.close_date).sort((a,b) => a.close_date - b.close_date);
  const recentFirst = [...closed].reverse();

  // 1. No Overtrading — max 3 trades/day, longest streak of qualifying days
  const byDay = {};
  closed.forEach(t => {
    const key = t.close_date.toISOString().slice(0,10);
    byDay[key] = (byDay[key] || 0) + 1;
  });
  const days = Object.keys(byDay).sort();
  let dayStreak = 0, maxDayStreak = 0;
  days.forEach(d => {
    if(byDay[d] <= 3){ dayStreak++; maxDayStreak = Math.max(maxDayStreak, dayStreak); }
    else dayStreak = 0;
  });
  const c1 = {
    icon:'shield', title:'No Overtrading', points:60,
    desc:'Max 3 trades per day, for consecutive days.',
    howTo:'We look at your closed trades grouped by day. Any day with 3 or fewer trades counts toward the streak; a day with 4+ trades resets it to zero. Levels: 3, 7, 14, 21, 30 days in a row.',
    current: maxDayStreak, tiers: [3, 7, 14, 21, 30], target: 30, done: maxDayStreak >= 30
  };

  // 2. Risk:Reward Discipline — streak of RR >= 2 (most recent first)
  let rrStreak = 0;
  for(const t of recentFirst){
    if(t.rr !== null && !isNaN(t.rr) && t.rr >= 2) rrStreak++;
    else break;
  }
  const c2 = {
    icon:'scale', title:'Risk:Reward Discipline', points:80,
    desc:'Consecutive trades with an RR of at least 1:2.',
    howTo:'Counted from your most recent trade backwards, using the RR value you log per trade. As soon as one trade has RR below 2, the streak resets. Levels: 2, 5, 10, 15, 20 in a row.',
    current: rrStreak, tiers: [2, 5, 10, 15, 20], target: 20, done: rrStreak >= 20
  };

  // 3. Iron Discipline — streak of rules_followed = Yes
  let rulesStreak = 0;
  for(const t of recentFirst){
    if((t.rules_followed || '').toLowerCase() === 'yes') rulesStreak++;
    else break;
  }
  const c3 = {
    icon:'shield-check', title:'Iron Discipline', points:100,
    desc:'Consecutive trades where you followed your rules 100%.',
    howTo:'Based on the "Rules Followed" field you set on each trade. Mark it "Yes" on consecutive trades (most recent first) to build this streak — one "No" resets it to zero. Levels: 2, 5, 10, 15, 20 in a row.',
    current: rulesStreak, tiers: [2, 5, 10, 15, 20], target: 20, done: rulesStreak >= 20
  };

  // 4. Hot Streak — consecutive winning weeks (grouped Mon-Sun)
  const byWeek = {};
  closed.forEach(t => {
    const key = getWeekKey(t.close_date);
    byWeek[key] = (byWeek[key] || 0) + (t.profit_loss || 0);
  });
  const weekKeys = Object.keys(byWeek).sort();
  let weekStreak = 0, maxWeekStreak = 0;
  weekKeys.forEach(w => {
    if(byWeek[w] > 0){ weekStreak++; maxWeekStreak = Math.max(maxWeekStreak, weekStreak); }
    else weekStreak = 0;
  });
  const c4 = {
    icon:'flame', title:'Hot Streak', points:90,
    desc:'Consecutive winning weeks (positive total P/L per week).',
    howTo:'Your closed trades are grouped into Monday–Sunday weeks and summed by total P/L. Every week with a positive total extends the streak; a negative week resets it. Levels: 1, 2, 3, 4, 5 winning weeks in a row.',
    current: maxWeekStreak, tiers: [1, 2, 3, 4, 5], target: 5, done: maxWeekStreak >= 5
  };

  // 5. Efficient Edge — profit factor over the last 100 trades, leveled up
  const last100 = recentFirst.slice(0, 100);
  const gw = last100.filter(t => t.profit_loss > 0).reduce((s,t) => s + t.profit_loss, 0);
  const gl = Math.abs(last100.filter(t => t.profit_loss < 0).reduce((s,t) => s + t.profit_loss, 0));
  const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
  const pfDisplay = last100.length >= 100 ? Math.min(pf === Infinity ? 2 : pf, 2) : 0;
  const c5 = {
    icon:'trending-up', title:'Efficient Edge', points:100,
    desc:'Profit factor over your last 100 trades.',
    howTo:'Profit factor = total gross wins ÷ total gross losses, over your most recent 100 closed trades (needs at least 100 logged). Levels: 1.0, 1.2, 1.5, 1.8, 2.0 profit factor.',
    current: pfDisplay, tiers: [1, 1.2, 1.5, 1.8, 2], target: 2, done: last100.length >= 100 && pf >= 2,
    statOverride: last100.length >= 100 ? `Profit factor: ${pf===Infinity?'∞':pf.toFixed(2)}` : `${last100.length}/100 trades so far`
  };

  // 6. Shrinking Losses — % your avg loss size improved vs the previous 20 trades
  const last20 = recentFirst.slice(0, 20);
  const prev20 = recentFirst.slice(20, 40);
  const avgLoss = arr => {
    const losses = arr.filter(t => t.profit_loss < 0);
    return losses.length ? losses.reduce((s,t) => s + t.profit_loss, 0) / losses.length : 0;
  };
  const recentAvgLoss = avgLoss(last20), prevAvgLoss = avgLoss(prev20);
  const improvementPct = prev20.length > 0 && prevAvgLoss !== 0
    ? Math.max(0, ((Math.abs(prevAvgLoss) - Math.abs(recentAvgLoss)) / Math.abs(prevAvgLoss)) * 100)
    : 0;
  const c6 = {
    icon:'trending-down', title:'Shrinking Losses', points:70,
    desc:'Your average loss size, shrinking vs your previous 20 trades.',
    howTo:'We compare the average losing trade size in your most recent 20 trades against the 20 before that. Levels: 5%, 10%, 20%, 35%, 50% smaller average loss.',
    current: improvementPct, tiers: [5, 10, 20, 35, 50], target: 50, done: prev20.length > 0 && improvementPct >= 50,
    statOverride: prev20.length > 0 ? `Now: $${Math.abs(recentAvgLoss).toFixed(2)} · Before: $${Math.abs(prevAvgLoss).toFixed(2)}` : 'Needs more trades to compare.'
  };

  // 7. Drawdown Guard — tighter max-drawdown control over time
  let peak = 0, maxDD = 0, cum = 0;
  closed.forEach(t => {
    cum += t.profit_loss || 0;
    peak = Math.max(peak, cum);
    const dd = peak > 0 ? (peak - cum) / peak * 100 : 0;
    maxDD = Math.max(maxDD, dd);
  });
  const ddSafety = peak > 0 ? Math.max(0, 100 - maxDD) : 0;
  const c7 = {
    icon:'octagon', title:'Drawdown Guard', points:90,
    desc:'Keep your max drawdown tight against peak equity.',
    howTo:'Built from your cumulative equity curve — the biggest drop from any peak to the lowest point after it, as a percentage of that peak. Levels: staying under 50%, 40%, 30%, 20%, 10% max drawdown.',
    current: ddSafety, tiers: [50, 60, 70, 80, 90], target: 90, done: peak > 0 && maxDD < 10,
    statOverride: peak > 0 ? `Max drawdown: ${maxDD.toFixed(1)}%` : 'Not enough data yet.'
  };

  // 8. Consistent Volume — trades logged this month
  const now = new Date();
  const thisMonthTrades = closed.filter(t => t.close_date.getFullYear() === now.getFullYear() && t.close_date.getMonth() === now.getMonth());
  const c8 = {
    icon:'bar-chart', title:'Consistent Volume', points:60,
    desc:'Trades logged this month — showing up consistently, not a quota.',
    howTo:'A simple count of your closed trades where the close date falls in the current calendar month. Levels: 5, 10, 20, 40, 60 trades — resets each month. This tracks consistency, not a target; never force a trade just to move this number.',
    current: thisMonthTrades.length, tiers: [5, 10, 20, 40, 60], target: 60, done: thisMonthTrades.length >= 60
  };

  // 9. Explorer — different setups used this month
  const setupsThisMonth = new Set(thisMonthTrades.map(t => t.trade_setup).filter(Boolean));
  const c9 = {
    icon:'compass', title:'Explorer', points:50,
    desc:'Different setups used this month.',
    howTo:'Counts the number of distinct values in your "Trade Setup" field across this month\'s closed trades. Levels: 1, 2, 3, 5, 8 different setups. Only count setups you\'d genuinely take — don\'t force an unfamiliar one just to add to this.',
    current: setupsThisMonth.size, tiers: [1, 2, 3, 5, 8], target: 8, done: setupsThisMonth.size >= 8
  };

  // 10. Clean Week — most recent week had zero losses
  const lastWeekKey = weekKeys[weekKeys.length - 1];
  const lastWeekTrades = closed.filter(t => getWeekKey(t.close_date) === lastWeekKey);
  const lastWeekLossCount = lastWeekTrades.filter(t => (t.win_loss || '').toLowerCase() === 'loss').length;
  let cleanWeekStreak = 0, maxCleanWeekStreak = 0;
  weekKeys.forEach(w => {
    const weekTrades = closed.filter(t => getWeekKey(t.close_date) === w);
    const hasLoss = weekTrades.some(t => (t.win_loss || '').toLowerCase() === 'loss');
    if(weekTrades.length > 0 && !hasLoss){ cleanWeekStreak++; maxCleanWeekStreak = Math.max(maxCleanWeekStreak, cleanWeekStreak); }
    else cleanWeekStreak = 0;
  });
  const c10 = {
    icon:'star', title:'Clean Week', points:40,
    desc:'Consecutive weeks with zero losses.',
    howTo:'Looks at each Monday–Sunday week and checks whether any closed trade in it is marked "Loss." A week with wins, breakevens, or no trades still counts as clean; one loss resets the streak. Levels: 1, 2, 3, 4, 5 clean weeks in a row.',
    current: maxCleanWeekStreak, tiers: [1, 2, 3, 4, 5], target: 5, done: maxCleanWeekStreak >= 5,
    statOverride: lastWeekTrades.length ? `This week so far: ${lastWeekTrades.length} trades, ${lastWeekLossCount} loss${lastWeekLossCount===1?'':'es'}` : 'No trades yet this week.'
  };

  // 11. Comeback Kid — how many times a losing week was followed by a winning week
  let comebackCount = 0;
  for(let i = 1; i < weekKeys.length; i++){
    if(byWeek[weekKeys[i-1]] < 0 && byWeek[weekKeys[i]] > 0) comebackCount++;
  }
  const c11 = {
    icon:'refresh', title:'Comeback Kid', points:70,
    desc:'Bounced back from a losing week into a winning week.',
    howTo:'Scans your weekly P/L history for every losing week (negative total) immediately followed by a winning week (positive total). Levels: 1, 2, 3, 4, 5 comebacks, lifetime.',
    current: comebackCount, tiers: [1, 2, 3, 4, 5], target: 5, done: comebackCount >= 5
  };

  // 12/13. Achievements-based
  const withdrawals = achRows.filter(a => a.category === 'Withdrawal');
  const tournaments = achRows.filter(a => a.category === 'Tournament');
  const c12 = {
    icon:'dollar', title:'Funded & Withdrawing', points:150,
    desc:'Successful withdrawals logged in Achievements.',
    howTo:'Counts your Achievements entries where Category = "Withdrawal." Upload a new achievement each time you get a successful payout. Levels: 1, 2, 3, 4, 5 withdrawals.',
    current: withdrawals.length, tiers: [1, 2, 3, 4, 5], target: 5, done: withdrawals.length >= 5
  };

  // 27. Cash Out — total amount withdrawn, lifetime (uses the Amount field on Withdrawal achievements)
  const totalWithdrawn = withdrawals.reduce((s,a) => s + (parseFloat(a.amount) || 0), 0);
  const c27 = {
    icon:'dollar', title:'Cash Out', points:120,
    desc:'Total amount withdrawn, lifetime.',
    howTo:'Sums the "Amount" field on your Achievements entries where Category = "Withdrawal." Fill in the amount when you upload a withdrawal achievement. Levels: $100, $500, $1,000, $5,000, $10,000 total withdrawn.',
    current: totalWithdrawn, tiers: [100, 500, 1000, 5000, 10000], target: 10000, done: totalWithdrawn >= 10000,
    statOverride: `$${totalWithdrawn.toFixed(2)} withdrawn so far`
  };
  const c13 = {
    icon:'trophy', title:'Tournament Grinder', points:130,
    desc:'Tournaments logged in Achievements.',
    howTo:'Counts your Achievements entries where Category = "Tournament." Upload a new achievement each time you join or place in a tournament. Levels: 1, 3, 5, 7, 10 tournaments.',
    current: tournaments.length, tiers: [1, 3, 5, 7, 10], target: 10, done: tournaments.length >= 10
  };

  // 14. Global Trader — different sessions traded this month
  const sessionsThisMonth = new Set(thisMonthTrades.map(t => t.session).filter(s => s && s !== 'Unspecified'));
  const c14 = {
    icon:'globe', title:'Global Trader', points:60,
    desc:'Different sessions traded this month.',
    howTo:'Counts the distinct values in your "Session" field (Asia, London, London + NY Overlap, New York, Low Liquidity) across this month\'s closed trades. Levels: 1, 2, 3, 4, 5 different sessions. Only trade a session when there\'s a real setup — don\'t trade a session just to check it off.',
    current: sessionsThisMonth.size, tiers: [1, 2, 3, 4, 5], target: 5, done: sessionsThisMonth.size >= 5
  };

  // 15. Setup Specialist — win rate on your best setup, 10+ trades using it
  const setupStats = {};
  closed.forEach(t => {
    const key = t.trade_setup;
    if(!key || key === 'Unspecified') return;
    if(!setupStats[key]) setupStats[key] = { wins: 0, total: 0 };
    setupStats[key].total++;
    if((t.win_loss || '').toLowerCase() === 'win') setupStats[key].wins++;
  });
  let bestSetup = null, bestSetupRate = 0;
  Object.entries(setupStats).forEach(([name, s]) => {
    if(s.total >= 10 && s.wins / s.total > bestSetupRate){ bestSetupRate = s.wins / s.total; bestSetup = name; }
  });
  const c15 = {
    icon:'target', title:'Setup Specialist', points:110,
    desc:'Win rate on your best setup, across at least 10 trades using it.',
    howTo:'Groups your closed trades by "Trade Setup" and checks each one with at least 10 trades for its win rate. Levels: 40%, 50%, 60%, 70%, 80% win rate on any single setup. This is an observation, not a target — don\'t skip a valid setup just to protect the percentage.',
    current: bestSetup ? Math.round(bestSetupRate * 100) : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: !!bestSetup && bestSetupRate >= 0.8,
    statOverride: bestSetup ? `Best: "${bestSetup}" at ${Math.round(bestSetupRate*100)}%` : 'No setup with 10+ trades yet'
  };

  // (Retired: a "trade both directions" challenge used to live here — removed
  // because rewarding a minimum Long/Short count could tempt forcing a trade
  // in whichever direction you're short on, just to hit the number. That's
  // the opposite of what this page should encourage.)

  // 17. Century Club — trades logged, all-time
  const c17 = {
    icon:'hash', title:'Century Club', points:100,
    desc:'Trades logged, all-time.',
    howTo:'A simple lifetime count of every closed trade you\'ve logged. Levels: 20, 50, 100, 250, 500 trades — no time limit.',
    current: closed.length, tiers: [20, 50, 100, 250, 500], target: 500, done: closed.length >= 500
  };

  // 18. Green Month — fully completed calendar months with positive total P/L
  const monthTotals = {};
  closed.forEach(t => {
    const key = `${t.close_date.getFullYear()}-${t.close_date.getMonth()}`;
    monthTotals[key] = (monthTotals[key] || 0) + (t.profit_loss || 0);
  });
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const greenMonthCount = Object.keys(monthTotals).filter(k => k !== thisMonthKey && monthTotals[k] > 0).length;
  const c18 = {
    icon:'calendar', title:'Green Month', points:90,
    desc:'Fully completed calendar months with positive total P/L.',
    howTo:'Groups your closed trades by calendar month (excluding the current, still-in-progress month) and sums P/L for each. Levels: 1, 2, 3, 4, 6 green months, lifetime.',
    current: greenMonthCount, tiers: [1, 2, 3, 4, 6], target: 6, done: greenMonthCount >= 6
  };

  // 19. Journal Keeper — 10 consecutive trades with notes filled in
  let notesStreak = 0;
  for(const t of recentFirst){
    if((t.notes || '').trim()) notesStreak++;
    else break;
  }
  const c19 = {
    icon:'book', title:'Journal Keeper', points:60,
    desc:'Consecutive trades with notes filled in.',
    howTo:'Checks your most recent trades (newest first) for a filled-in "Notes" field. One trade without notes resets the streak. Levels: 5, 10, 20, 50, 100 in a row.',
    current: notesStreak, tiers: [5, 10, 20, 50, 100], target: 100, done: notesStreak >= 100
  };

  // 20. Rule Setter — personal trading rules saved in Profile
  const ruleCount = (PROFILE_DATA?.trading_rules || []).length;
  const c20 = {
    icon:'list', title:'Rule Setter', points:40,
    desc:'Personal trading rules saved in your Profile.',
    howTo:'Counts the rules you\'ve added under "My Trading Rules" on your Profile page. Levels: 1, 2, 3, 5, 10 rules.',
    current: ruleCount, tiers: [1, 2, 3, 5, 10], target: 10, done: ruleCount >= 10
  };

  // 21. Vision Board Set — uploaded an inspiration image on Profile
  const hasVisionBoard = !!PROFILE_DATA?.inspiration_image_path;
  const c21 = {
    icon:'image', title:'Vision Board Set', points:30,
    desc:'Uploaded an inspiration image on your Profile.',
    howTo:'Checks whether you\'ve uploaded an image under "My Vision Board" on your Profile page. Upload one from Edit mode to complete this.',
    current: hasVisionBoard ? 1 : 0, target: 1, done: hasVisionBoard
  };

  // 22. Breakeven Saver — trades where you secured profit after moving SL to breakeven
  const beSaves = closed.filter(t => t.post_be_result === 'TP After BE').length;
  const c22 = {
    icon:'check-circle', title:'Breakeven Saver', points:70,
    desc:'Trades where you secured profit after moving SL to breakeven.',
    howTo:'Counts trades where your "Post-BE Result" is "TP After BE" — meaning you moved your stop to breakeven and still walked away with profit instead of just avoiding a loss. Levels: 2, 5, 10, 20, 30 trades.',
    current: beSaves, tiers: [2, 5, 10, 20, 30], target: 30, done: beSaves >= 30
  };

  // 23. Weekday Ace — win rate on your best day of the week, 10+ trades on it
  const dayStats = {};
  closed.forEach(t => {
    const key = t.day_of_week;
    if(!key || key === 'Unspecified') return;
    if(!dayStats[key]) dayStats[key] = { wins: 0, total: 0 };
    dayStats[key].total++;
    if((t.win_loss || '').toLowerCase() === 'win') dayStats[key].wins++;
  });
  let bestDay = null, bestDayRate = 0;
  Object.entries(dayStats).forEach(([name, s]) => {
    if(s.total >= 10 && s.wins / s.total > bestDayRate){ bestDayRate = s.wins / s.total; bestDay = name; }
  });
  const c23 = {
    icon:'medal', title:'Weekday Ace', points:90,
    desc:'Win rate on your best day of the week, across at least 10 trades.',
    howTo:'Groups your closed trades by day of the week and checks each day with at least 10 trades for its win rate. Levels: 40%, 50%, 60%, 70%, 80% win rate on any single day. Don\'t avoid trading a good setup on a given day just to protect this number.',
    current: bestDay ? Math.round(bestDayRate * 100) : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: !!bestDay && bestDayRate >= 0.8,
    statOverride: bestDay ? `Best: ${bestDay} at ${Math.round(bestDayRate*100)}%` : 'No day with 10+ trades yet'
  };

  // 24. Fee Control — fees this month kept low relative to gross win (resets monthly)
  const monthGrossWin = thisMonthTrades.filter(t => t.profit_loss > 0).reduce((s,t) => s + t.profit_loss, 0);
  const monthFees = thisMonthTrades.reduce((s,t) => s + (t.fee || 0), 0);
  const monthFeePct = monthGrossWin > 0 ? (monthFees / monthGrossWin) * 100 : 0;
  const feeSafety = monthGrossWin > 0 ? Math.max(0, 100 - monthFeePct) : 0;
  const c24 = {
    icon:'percent', title:'Fee Control', points:60,
    desc:'Fees this month, kept low relative to your gross win.',
    howTo:'Fees this month ÷ gross win this month, as a percentage — lower is better. Levels: staying under 50%, 40%, 30%, 20%, 10% of gross win. Resets every month, so there\'s always a fresh shot at it.',
    current: feeSafety, tiers: [50, 60, 70, 80, 90], target: 90, done: monthGrossWin > 0 && monthFeePct <= 10
  };

  // 25. Monthly Win Rate — win rate for this month's trades (resets monthly)
  const monthWins = thisMonthTrades.filter(t => (t.win_loss || '').toLowerCase() === 'win').length;
  const monthWinRate = thisMonthTrades.length > 0 ? (monthWins / thisMonthTrades.length) * 100 : 0;
  const c25 = {
    icon:'zap', title:'Monthly Win Rate', points:70,
    desc:'Win rate for this month\'s trades.',
    howTo:'Wins ÷ total closed trades this month. Levels: 40%, 50%, 60%, 70%, 80% win rate. Resets every month — a fresh scoreboard each time. Never sit out a valid trade near month-end just to protect this number.',
    current: thisMonthTrades.length > 0 ? monthWinRate : 0, tiers: [40, 50, 60, 70, 80], target: 80,
    done: thisMonthTrades.length > 0 && monthWinRate >= 80
  };

  // 26. Weeks Won — winning weeks within this month (resets monthly)
  const weeksThisMonthKeys = [...new Set(thisMonthTrades.map(t => getWeekKey(t.close_date)))];
  const weeksWonThisMonth = weeksThisMonthKeys.filter(w => (byWeek[w] || 0) > 0).length;
  const c26 = {
    icon:'calendar', title:'Weeks Won', points:60,
    desc:'Winning weeks within this month.',
    howTo:'Counts how many Monday–Sunday weeks touching this month had a positive total P/L. Levels: 1, 2, 3, 4, 5 winning weeks. Resets every month. Keep trading your plan as usual — don\'t go quiet just because a week is already green.',
    current: weeksWonThisMonth, tiers: [1, 2, 3, 4, 5], target: 5, done: weeksWonThisMonth >= 5
  };

  // 28-30. Account compliance guards — pass/fail checks against your real prop
  // firm account rules (My Accounts), not performance targets to chase. These
  // only appear once you've added at least one Prop Firm account.
  const propAccounts = TRADING_ACCOUNTS.filter(a => a.account_type !== 'Exchange' && a.account_size && a.status !== 'Failed');
  const accStatsCache = propAccounts.map(a => ({ acc: a, stats: computeAccountStats(a) }));

  let c28 = null;
  const accountsWithDailyLimit = accStatsCache.filter(x => x.stats.dailyLossLimit > 0);
  if(accountsWithDailyLimit.length){
    const breached = accountsWithDailyLimit.some(x => x.stats.dailyLossUsed >= x.stats.dailyLossLimit);
    c28 = {
      icon:'shield', title:'Daily Loss Guard', points:40,
      desc:"Stay within today's Max Daily Loss on every account.",
      howTo:"Checks each Prop Firm account's trades closed today against its Max Daily Loss % rule. This is a same-day pass/fail check, not a target — a day with no trades on that account stays passed by default. Never keep trading past a breach just to \"fix\" this.",
      current: breached ? 0 : 1, target: 1, done: !breached
    };
  }

  let c29 = null;
  const accountsWithDrawdownFloor = accStatsCache.filter(x => x.stats.drawdownFloor > 0);
  if(accountsWithDrawdownFloor.length){
    const breached = accountsWithDrawdownFloor.some(x => x.stats.currentBalance < x.stats.drawdownFloor);
    c29 = {
      icon:'shield-check', title:'Drawdown Guard', points:40,
      desc:'Keep every account above its Max Total Drawdown floor.',
      howTo:"Compares each Prop Firm account's current balance to its Max Total Drawdown % rule. Pass/fail, not a target to push toward — the further above the floor, the safer, but there's no reason to trade more just to widen the gap.",
      current: breached ? 0 : 1, target: 1, done: !breached
    };
  }

  let c30 = null;
  const accountsWithDayTarget = accStatsCache.filter(x => x.stats.profitableDaysTarget);
  if(accountsWithDayTarget.length){
    let best = null;
    accountsWithDayTarget.forEach(x => {
      const frac = x.stats.profitableDaysCount / x.stats.profitableDaysTarget;
      if(!best || frac > best.frac) best = { frac, current: x.stats.profitableDaysCount, target: x.stats.profitableDaysTarget };
    });
    c30 = {
      icon:'medal', title:'Profitable Days Met', points:50,
      desc:'Hit the minimum profitable trading days required by your account.',
      howTo:"Counts distinct days where an account's trades netted positive, against its Minimum Trading Days rule. There's no reason to force a trade on a slow day just to add to this count — an unprofitable or no-trade day simply doesn't count, without penalty.",
      current: best.current, target: best.target, done: best.current >= best.target
    };
  }

  return [c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c17,c18,c19,c20,c21,c22,c23,c24,c25,c26,c27,c28,c29,c30].filter(Boolean);
}

const LOCKED_CHALLENGES = [
  {icon:'percent', title:'1% Risk Master', desc:'Risking ≤1% per trade, 30 trades in a row.', needs:'Needs an entry price, stop-loss price, or account balance field to calculate the % risked per trade.'},
  {icon:'target', title:'SL Discipline', desc:'Always setting a Stop Loss before entering.', needs:'Needs a new checkbox field ("SL set before entry?") on the trade form.'},
  {icon:'ban', title:'No Revenge Trading', desc:'Skipping the next signal after a loss.', needs:'Needs a log of skipped signals — not tracked yet.'},
  {icon:'search', title:'Confluence Purist', desc:'Only entering when every confluence condition is "Met."', needs:'Needs a history/snapshot log of Trade Alerts (currently only the latest state is stored).'},
  {icon:'clock', title:'Same-Day Journaling', desc:'Logging every trade within 24 hours.', needs:'Needs a "created_at" column on trading_journal that records when you actually logged the trade.'},
  {icon:'calendar', title:'Daily Check-in Streak', desc:'Visiting the dashboard every day.', needs:'Needs new tracking of login/visit dates — not derived from trades.'},
  {icon:'medal', title:'Tournament Placement', desc:'Placing Top 10 or winning a tournament.', needs:'Needs a structured "placement" field on Achievements (currently just free text in subject/body).'}
];

function tierBarHTML(current, tiers){
  return `
    <div class="tier-bar">
      ${tiers.map((t, i) => {
        const prev = i === 0 ? 0 : tiers[i-1];
        const reached = current >= t;
        const pct = reached ? 100 : Math.max(0, Math.min(100, ((current - prev) / (t - prev)) * 100));
        return `
          <div class="tier-segment">
            <div class="tier-track"><div class="tier-fill ${reached ? 'reached' : ''}" style="width:${pct}%;"></div></div>
            <div class="tier-mark ${reached ? 'reached' : ''}">${t}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function activeCardHTML(c, status){
  const badgeCls = status === 'done' ? 'badge-done' : status === 'next' ? 'badge-next' : '';
  const tagText = status === 'done' ? 'Achieved' : status === 'next' ? 'Next up' : 'In Progress';
  const progressHTML = c.tiers
    ? tierBarHTML(c.current, c.tiers)
    : `<div class="challenge-progress-bar"><div class="challenge-progress-fill" style="width:${c.target ? Math.min(100, (c.current / c.target) * 100) : 0}%;"></div></div>`;
  const statText = c.statOverride || `${c.current} / ${c.target}`;
  return `
    <div class="challenge-card ${status}" onclick='openChallengeDetail(${JSON.stringify(c.title)})'>
      <div class="challenge-hover-tip">${c.howTo || c.desc}</div>
      <div class="challenge-badge ${badgeCls}">
        ${challengeIconSVG(c.icon)}
        ${status === 'done' ? `<span class="challenge-badge-mark check">✓</span>` : ''}
      </div>
      <div class="challenge-info">
        <div class="card-tag">${tagText}</div>
        <div class="challenge-title">${c.title}</div>
        <div class="challenge-desc">${c.desc}</div>
        ${progressHTML}
        <div class="challenge-stat">${statText}</div>
      </div>
      <div class="challenge-points">+${c.points}</div>
    </div>
  `;
}

function lockedCardHTML(c){
  return `
    <div class="challenge-card locked">
      <div class="challenge-badge">
        ${challengeIconSVG(c.icon)}
        <span class="challenge-badge-mark lock">${challengeIconSVG('lock')}</span>
      </div>
      <div class="challenge-info">
        <div class="challenge-title">${c.title}</div>
        <div class="challenge-desc">${c.desc}</div>
        <div class="challenge-lock-note">${c.needs}</div>
      </div>
    </div>
  `;
}

function switchChallengeFilter(f){
  challengeFilter = f;
  document.querySelectorAll('#challengeFilterTabs .tab').forEach(el => el.classList.toggle('active', el.dataset.f === f));
  renderChallengeGrid();
}

function renderRankLadder(totalPoints){
  const wrap = document.getElementById('rankLadder');
  if(!wrap) return;
  const { current } = rankForPoints(totalPoints);
  const n = CHALLENGE_RANKS.length;
  const maxMin = CHALLENGE_RANKS[n - 1].min;
  const overallPct = Math.min(100, (totalPoints / maxMin) * 100);
  const rankIcons = ['star', 'flame', 'shield-check', 'trending-up', 'medal', 'octagon', 'trophy'];

  const medals = CHALLENGE_RANKS.map((r, i) => {
    const reached = totalPoints >= r.min;
    const isCurrent = r.label === current.label;
    return `
      <div class="rank-medal ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}" onclick='openRankDetail(${JSON.stringify(r.label)}, ${totalPoints})'>
        ${isCurrent ? `<div class="rank-medal-you">You are here</div>` : ''}
        ${challengeIconSVG(rankIcons[i] || 'star')}
        <div class="rank-medal-label">${r.label.replace(' Trader','')}</div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="rank-track">
      <div class="rank-track-bar"><div class="rank-track-fill" style="width:${overallPct}%;"></div></div>
      <div class="rank-medals">${medals}</div>
    </div>
  `;
}

const RANK_DESCRIPTIONS = {
  'Novice Trader': "Everyone starts here. Log your trades and work through the challenges to start building points.",
  'Apprentice Trader': "You're forming real habits — the small, consistent decisions are starting to add up.",
  'Skilled Trader': "Your discipline is becoming routine rather than effort. Keep stacking consistent decisions.",
  'Expert Trader': "You've shown consistency across several different areas of your trading, not just one.",
  'Master Trader': "A high, well-rounded level of discipline — this takes sustained, deliberate practice to reach.",
  'Elite Trader': "You're clearing the hardest levels on most challenges, not just the easy first steps.",
  'Legendary Trader': "You've worked through nearly every challenge here. This reflects a long track record, not luck."
};

function openRankDetail(label, totalPoints){
  const idx = CHALLENGE_RANKS.findIndex(r => r.label === label);
  if(idx === -1) return;
  const rank = CHALLENGE_RANKS[idx];
  const nextRank = CHALLENGE_RANKS[idx + 1];
  const rangeText = nextRank ? `${rank.min} – ${nextRank.min - 1} points` : `${rank.min}+ points`;
  const reached = totalPoints >= rank.min;

  let statusText;
  if(!reached){
    statusText = `Not reached yet — ${rank.min - totalPoints} more point${rank.min - totalPoints === 1 ? '' : 's'} gets you here. No rush, this updates automatically as you log trades.`;
  }else if(nextRank && totalPoints < nextRank.min){
    statusText = `This is where you are right now — ${nextRank.min - totalPoints} point${nextRank.min - totalPoints === 1 ? '' : 's'} away from ${nextRank.label}.`;
  }else if(!nextRank){
    statusText = `You're at the top of the ladder — every rank below this one is behind you.`;
  }else{
    statusText = `You passed through this rank already on your way to where you are now.`;
  }

  // Only show the full points breakdown when this is the rank you're
  // currently at — it's the same underlying list for every rank otherwise,
  // since points are cumulative, so showing it everywhere was redundant.
  const { current } = rankForPoints(totalPoints);
  const isCurrent = label === current.label;
  let breakdownSection = '';
  if(isCurrent){
    const achievedList = COMPUTED_CHALLENGES.filter(c => c.done).sort((a,b) => b.points - a.points);
    const breakdownHTML = achievedList.length
      ? achievedList.map(c => `
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--rule);">
            <span>${escapeHtml(c.title)}</span>
            <span style="color:var(--win);font-weight:600;flex-shrink:0;">+${c.points}</span>
          </div>
        `).join('')
      : `<div class="empty-state" style="padding:10px 0;">No challenges achieved yet — every one you complete adds points here.</div>`;
    breakdownSection = `
      <div style="font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">How your points were earned</div>
      ${breakdownHTML}
    `;
  }

  document.getElementById('modalTitle').textContent = label;
  document.getElementById('modalSub').textContent = rangeText;
  document.getElementById('modalBody').innerHTML = `
    <div style="font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:10px;">${RANK_DESCRIPTIONS[label] || ''}</div>
    <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:18px;">${statusText}</div>
    ${breakdownSection}
  `;
  document.getElementById('tradeModal').classList.add('open');
}

function renderChallengeGrid(){
  const grid = document.getElementById('challengesGrid');
  const lockedGrid = document.getElementById('challengesLockedGrid');
  if(!grid) return;

  const doneCount = COMPUTED_CHALLENGES.filter(c => c.done).length;
  const totalPoints = COMPUTED_CHALLENGES.filter(c => c.done).reduce((s,c) => s + c.points, 0);
  const maxPoints = COMPUTED_CHALLENGES.reduce((s,c) => s + c.points, 0);

  const label = document.getElementById('challengesCountLabel');
  if(label) label.textContent = `${doneCount} / ${COMPUTED_CHALLENGES.length} achieved`;

  const { current, next } = rankForPoints(totalPoints);
  document.getElementById('challengeRankLabel').textContent = current.label;
  document.getElementById('challengePointsTotal').textContent = totalPoints;
  document.getElementById('challengePointsAway').textContent = next
    ? `${next.min - totalPoints} points to ${next.label}`
    : `Max rank reached — ${maxPoints} points available`;
  renderRankLadder(totalPoints);

  // Achieved challenges come first, then whatever's still open — ordered by
  // how close each one is to finishing, so the nearest-to-done is always up top.
  const progressFraction = c => {
    const finalTarget = c.tiers ? c.tiers[c.tiers.length - 1] : c.target;
    return finalTarget > 0 ? Math.min(1, c.current / finalTarget) : 0;
  };
  const done = [...COMPUTED_CHALLENGES].filter(c => c.done).sort((a,b) => a.points - b.points);
  const notDone = [...COMPUTED_CHALLENGES].filter(c => !c.done).sort((a,b) => progressFraction(b) - progressFraction(a));
  const withStatus = [
    ...done.map(c => ({ c, status: 'done' })),
    ...notDone.map((c, i) => ({ c, status: i === 0 ? 'next' : 'upcoming' }))
  ];

  const rows = challengeFilter === 'achieved' ? withStatus.filter(x => x.status === 'done')
    : challengeFilter === 'unachieved' ? withStatus.filter(x => x.status !== 'done')
    : withStatus;

  grid.innerHTML = rows.length ? rows.map(x => activeCardHTML(x.c, x.status)).join('') : `<div class="empty-state">No challenges in this filter.</div>`;
  if(lockedGrid) lockedGrid.innerHTML = LOCKED_CHALLENGES.map(lockedCardHTML).join('');
}

async function renderChallenges(){
  const grid = document.getElementById('challengesGrid');
  if(!grid) return;
  grid.innerHTML = `<div class="empty-state">Loading…</div>`;

  const achRows = await loadAchievementSummaryForChallenges();
  COMPUTED_CHALLENGES = computeChallenges(ALL_TRADES, achRows);
  renderChallengeGrid();
}

function openChallengeDetail(title){
  const c = COMPUTED_CHALLENGES.find(x => x.title === title);
  if(!c) return;
  const statText = c.statOverride || `${c.current} / ${c.target}`;
  const badge = document.getElementById('challengeDetailBadge');
  badge.className = 'challenge-badge' + (c.done ? ' badge-done' : '');
  badge.innerHTML = challengeIconSVG(c.icon) + (c.done ? '<span class="challenge-badge-mark check">✓</span>' : '');
  document.getElementById('challengeDetailTitle').textContent = c.title;
  document.getElementById('challengeDetailPoints').textContent = `+${c.points} points${c.done ? ' · Achieved' : ''}`;
  document.getElementById('challengeDetailHowTo').textContent = c.howTo || c.desc;
  document.getElementById('challengeDetailProgressWrap').innerHTML = c.tiers
    ? tierBarHTML(c.current, c.tiers)
    : `<div class="challenge-progress-bar" style="height:8px;"><div class="challenge-progress-fill" style="width:${c.target ? Math.min(100, (c.current / c.target) * 100) : 0}%;"></div></div>`;
  document.getElementById('challengeDetailStat').textContent = statText;
  document.getElementById('challengeDetailModal').classList.add('open');
}
function closeChallengeDetail(){
  document.getElementById('challengeDetailModal').classList.remove('open');
}

/* ---------------- Profile (trader identity, rules, inspiration board) ---------------- */
let PROFILE_DATA = null;
let profileRulesArr = [];
let profileEditing = false;

const PROFILE_STYLE_OPTIONS = ['Scalper', 'Day Trader', 'Swing Trader', 'Position Trader'];
const PROFILE_MARKET_OPTIONS = ['Crypto', 'Forex', 'Stocks', 'Multiple'];

async function loadProfile(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?select=*`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    const rows = await res.json();
    PROFILE_DATA = rows[0] || null;
  }catch(e){
    console.error("Couldn't load profile:", e);
    PROFILE_DATA = null;
  }
  await renderProfile();
}

function enterProfileEditMode(){
  profileEditing = true;
  renderProfile();
}

function cancelProfileEdit(){
  profileEditing = false;
  renderProfile();
}

async function renderProfile(){
  const p = PROFILE_DATA || {};

  document.getElementById('profileEditBtn').style.display = profileEditing ? 'none' : 'inline-block';
  document.getElementById('profileCancelBtn').style.display = profileEditing ? 'inline-block' : 'none';
  document.getElementById('profileSaveBtn').style.display = profileEditing ? 'inline-block' : 'none';
  document.getElementById('profileEditPanel').style.display = profileEditing ? 'block' : 'none';

  // Header card — always shows the saved values, whether editing or not.
  const initial = (p.display_name || '').trim().charAt(0).toUpperCase() || '?';
  document.getElementById('profileAvatar').textContent = initial;
  document.getElementById('profileHeaderName').textContent = p.display_name || 'Set your name';
  document.getElementById('profileHeaderBadges').innerHTML = `
    <span class="pill pill-blue">${escapeHtml(p.trading_style || 'Trading style')}</span>
    <span class="pill pill-orange">${escapeHtml(p.primary_market || 'Market')}</span>
    ${p.risk_per_trade != null ? `<span class="pill pill-green">Risk ${p.risk_per_trade}%</span>` : ''}
  `;
  document.getElementById('profileHeaderWhy').textContent = p.my_why ? `"${p.my_why}"` : '';

  // Rank badge — mirrors your current rank from the Challenges page.
  try{
    const rankIcons = ['star', 'flame', 'shield-check', 'trending-up', 'medal', 'octagon', 'trophy'];
    const achRowsForRank = await loadAchievementSummaryForChallenges();
    const challengesForRank = computeChallenges(ALL_TRADES, achRowsForRank);
    const totalPointsForRank = challengesForRank.filter(c => c.done).reduce((s,c) => s + c.points, 0);
    const { current: currentRank } = rankForPoints(totalPointsForRank);
    const rankIdx = CHALLENGE_RANKS.findIndex(r => r.label === currentRank.label);
    document.getElementById('profileRankIcon').innerHTML = challengeIconSVG(rankIcons[rankIdx] || 'star');
    document.getElementById('profileRankTitle').textContent = currentRank.label;
  }catch(e){
    console.error("Couldn't compute rank for profile badge:", e);
  }

  const fields = document.getElementById('profileFieldsPanel');
  if(profileEditing){
    fields.innerHTML = `
      <div class="field-row"><label>Display Name</label><input id="profileName" placeholder="Your name" value="${escapeHtml(p.display_name || '')}"></div>
      <div class="field-row"><label>Trading Style</label>
        <select id="profileStyle">${PROFILE_STYLE_OPTIONS.map(s => `<option value="${s}" ${p.trading_style===s?'selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field-row"><label>Primary Market</label>
        <select id="profileMarket">${PROFILE_MARKET_OPTIONS.map(m => `<option value="${m}" ${p.primary_market===m?'selected':''}>${m}</option>`).join('')}</select>
      </div>
      <div class="field-row"><label>Risk Per Trade (%)</label><input id="profileRisk" type="number" step="0.1" placeholder="e.g. 0.3" value="${p.risk_per_trade ?? ''}"></div>
      <div class="field-row"><label>My Why</label><textarea id="profileWhy" placeholder="Why are you doing this?">${escapeHtml(p.my_why || '')}</textarea></div>
    `;
  }else{
    fields.innerHTML = '';
  }

  renderProfileRules(p.trading_rules || []);

  const img = document.getElementById('profileInspoImg');
  const placeholder = document.getElementById('profileInspoPlaceholder');
  const uploadBtn = document.getElementById('profileInspoUploadBtn');
  const editHint = document.getElementById('profileInspoEditHint');
  if(uploadBtn) uploadBtn.textContent = p.inspiration_image_path ? 'Change image' : 'Upload image';
  img.onclick = profileEditing ? null : () => openLightbox(img.src);
  img.style.cursor = profileEditing ? 'default' : 'zoom-in';

  if(p.inspiration_image_path){
    try{
      const { data, error } = await sb.storage.from('profile-images').createSignedUrl(p.inspiration_image_path, 3600);
      if(error) throw error;
      img.src = data.signedUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
      editHint.style.display = profileEditing ? 'flex' : 'none';
    }catch(e){
      console.error("Couldn't load inspiration image:", e);
      img.style.display = 'none';
      editHint.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.innerHTML = `<div>Couldn't load your inspiration image (${escapeHtml(e?.message || String(e))}). Try uploading it again from Edit mode.</div>`;
    }
  }else{
    img.style.display = 'none';
    editHint.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.innerHTML = `<div>No inspiration image yet — add one from Edit mode.</div>`;
  }
}

function renderProfileRules(rules){
  profileRulesArr = [...rules];
  const wrap = document.getElementById('profileRulesList');
  const addRow = document.getElementById('profileRulesAddRow');
  if(addRow) addRow.style.display = profileEditing ? 'flex' : 'none';

  if(!profileRulesArr.length){
    wrap.innerHTML = `<div class="empty-state" style="padding:10px 0;">${profileEditing ? 'No rules yet — add your first one below.' : 'No rules added yet.'}</div>`;
    return;
  }

  wrap.innerHTML = profileRulesArr.map((rule, i) => profileEditing
    ? `<div class="config-option-row"><span>${escapeHtml(rule)}</span><button onclick="removeProfileRule(${i})">✕</button></div>`
    : `<div class="profile-rule-static">${escapeHtml(rule)}</div>`
  ).join('');
}

function addProfileRule(){
  const input = document.getElementById('newRuleInput');
  const val = input.value.trim();
  if(!val) return;
  profileRulesArr.push(val);
  input.value = '';
  renderProfileRules(profileRulesArr);
}

function removeProfileRule(i){
  profileRulesArr.splice(i, 1);
  renderProfileRules(profileRulesArr);
}

async function uploadInspirationImage(file){
  if(!file) return;
  try{
    const { data: { user } } = await sb.auth.getUser();
    const path = `${user.id}/inspiration_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;

    const { error: uploadErr } = await sb.storage.from('profile-images').upload(path, file);
    if(uploadErr) throw uploadErr;

    const oldPath = PROFILE_DATA?.inspiration_image_path;
    await persistProfile({ inspiration_image_path: path });
    if(oldPath) await sb.storage.from('profile-images').remove([oldPath]);

    await loadProfile();
    showToast('✅ Inspiration image updated');
  }catch(e){
    console.error("Couldn't upload inspiration image:", e);
    const msg = e?.message || String(e);
    const hint = /bucket not found/i.test(msg) ? ' The "profile-images" storage bucket doesn\'t exist yet — create it in Supabase Storage.' : '';
    alert("Couldn't upload image: " + msg + hint);
  }
}

async function persistProfile(partial){
  const { data: { user } } = await sb.auth.getUser();
  const nameEl = document.getElementById('profileName');
  const body = {
    user_id: user.id,
    display_name: nameEl ? nameEl.value.trim() : (PROFILE_DATA?.display_name || ''),
    trading_style: document.getElementById('profileStyle')?.value || PROFILE_DATA?.trading_style || 'Scalper',
    primary_market: document.getElementById('profileMarket')?.value || PROFILE_DATA?.primary_market || 'Crypto',
    risk_per_trade: document.getElementById('profileRisk')
      ? (parseFloat(document.getElementById('profileRisk').value) || null)
      : (PROFILE_DATA?.risk_per_trade ?? null),
    trading_rules: profileRulesArr,
    my_why: document.getElementById('profileWhy') ? document.getElementById('profileWhy').value.trim() : (PROFILE_DATA?.my_why || ''),
    updated_at: new Date().toISOString(),
    ...partial
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profile?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal,resolution=merge-duplicates"
    },
    body: JSON.stringify([body])
  });
  if(!res.ok) throw new Error(await res.text());
  PROFILE_DATA = { ...(PROFILE_DATA || {}), ...body };
}

async function saveProfile(){
  const btn = document.getElementById('profileSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try{
    await persistProfile({ inspiration_image_path: PROFILE_DATA?.inspiration_image_path || null });
    profileEditing = false;
    await renderProfile();
    showToast('✅ Profile saved');
  }catch(e){
    console.error("Couldn't save profile:", e);
    alert("Couldn't save — please try again.");
  }finally{
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

/* ---------------- My Accounts (prop firm accounts + their rules) ---------------- */
let TRADING_ACCOUNTS = [];
let editingAccountId = null;

async function loadAccounts(){
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?select=*&order=created_at.asc`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`
      }
    });
    if(!res.ok) throw new Error(await res.text());
    TRADING_ACCOUNTS = await res.json();
  }catch(e){
    console.error("Couldn't load trading accounts:", e);
    TRADING_ACCOUNTS = [];
  }
  syncAccountFieldOptions();
  renderAccountsList();
}

// Keeps the Journal's "Account" dropdown in sync with the real accounts from
// My Accounts, instead of a manually-maintained list — mutated in place so
// ALL_DRAWER_FIELDS' captured reference to FIELD_OPTIONS.account stays in sync.
// Falls back to whatever's already there if no accounts exist yet.
function syncAccountFieldOptions(){
  if(!TRADING_ACCOUNTS.length) return;
  FIELD_OPTIONS.account.length = 0;
  FIELD_OPTIONS.account.push(...TRADING_ACCOUNTS.map(a => a.account_name));
}

// Applies a +/- delta to an account's current_balance whenever a trade tagged
// to that account is added, edited, or deleted — so balance/progress stays
// live without retyping it after every trade. Silently no-ops if the trade's
// "Account" text doesn't match a real account (legacy/free-text values).
async function adjustAccountBalance(accountName, delta){
  if(!accountName || !delta) return;
  const acc = TRADING_ACCOUNTS.find(a => a.account_name === accountName);
  if(!acc) return;
  const newBalance = (parseFloat(acc.current_balance) || 0) + delta;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${acc.id}`, {
      method: 'PATCH',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ current_balance: newBalance })
    });
    if(!res.ok) throw new Error(await res.text());
    acc.current_balance = newBalance;
    if(currentView === 'accounts') renderAccountsList();
  }catch(e){
    console.error("Couldn't auto-update account balance:", e);
  }
}

// Auto-fills the Journal's "Account Type" (Demo/Evaluation/Funded) from the
// selected account's Phase, so it doesn't need to be typed twice.
function syncAccountTypeFromAccount(accountName){
  const acc = TRADING_ACCOUNTS.find(a => a.account_name === accountName);
  if(!acc) return;
  let mapped = null;
  if(acc.phase === 'Funded') mapped = 'Funded';
  else if(acc.phase && acc.phase.startsWith('Evaluation')) mapped = 'Evaluation';
  else if(acc.account_type === 'Exchange') mapped = 'Demo';
  if(!mapped) return;
  const sel = document.querySelector('#drawerBody [data-field="account_type"]');
  if(sel) sel.value = mapped;
}

// Derives all the compliance/progress numbers for one account from the real
// trades tagged to it (ALL_TRADES where account === account_name) — no extra
// table needed, since account_size/rules are fixed and current_balance is
// already kept live by adjustAccountBalance().
function computeAccountStats(acc){
  const trades = ALL_TRADES.filter(t => t.account === acc.account_name && t.close_date);
  const accountSize = Number(acc.account_size) || 0;
  const currentBalance = acc.current_balance != null ? Number(acc.current_balance) : accountSize;

  const today = new Date(); today.setHours(0,0,0,0);
  const todaysPL = trades
    .filter(t => { const d = new Date(t.close_date); d.setHours(0,0,0,0); return d.getTime() === today.getTime(); })
    .reduce((s,t) => s + (t.profit_loss || 0), 0);
  const dailyLossUsed = todaysPL < 0 ? Math.abs(todaysPL) : 0;
  const dailyLossLimit = accountSize * (Number(acc.max_daily_loss_pct) || 0) / 100;
  const dayStartBalance = currentBalance - todaysPL;
  const dailyStopBalance = dayStartBalance - dailyLossLimit;

  const drawdownFloor = accountSize - accountSize * (Number(acc.max_total_drawdown_pct) || 0) / 100;
  const profitGoal = accountSize + accountSize * (Number(acc.profit_target_pct) || 0) / 100;
  const balanceRangeFraction = (profitGoal > drawdownFloor)
    ? Math.max(0, Math.min(1, (currentBalance - drawdownFloor) / (profitGoal - drawdownFloor)))
    : 0;

  // Trades since the current phase began — Total Earn and Profitable Days
  // reset here so profit made during a previous phase doesn't carry over
  // into this phase's target (set "Phase Start Date"/"Balance at Phase
  // Start" on the account whenever you move to a new phase).
  const phaseStart = acc.phase_start_date ? new Date(acc.phase_start_date + 'T00:00:00') : null;
  const phaseTrades = phaseStart ? trades.filter(t => t.close_date >= phaseStart) : trades;

  const dayPL = {};
  phaseTrades.forEach(t => {
    const key = new Date(t.close_date).toDateString();
    dayPL[key] = (dayPL[key] || 0) + (t.profit_loss || 0);
  });
  const profitableDaysCount = Object.values(dayPL).filter(v => v > 0).length;
  const profitableDaysTarget = Number(acc.min_trading_days) || null;

  const sortedTrades = [...phaseTrades].sort((a,b) => a.close_date - b.close_date);
  let cum = 0;
  const series = sortedTrades.map(t => { cum += (t.profit_loss || 0); return { date: t.close_date, cum }; });
  const totalEarn = acc.phase_start_balance != null ? (currentBalance - Number(acc.phase_start_balance)) : cum;
  const targetEarn = accountSize * (Number(acc.profit_target_pct) || 0) / 100;

  return {
    accountSize, currentBalance, todaysPL, dailyLossUsed, dailyLossLimit, dayStartBalance, dailyStopBalance,
    drawdownFloor, profitGoal, balanceRangeFraction, profitableDaysCount, profitableDaysTarget,
    series, totalEarn, targetEarn
  };
}

let accountDetailChartRef = null;

function openAccountDetail(id){
  const a = TRADING_ACCOUNTS.find(x => x.id === id);
  if(!a) return;
  const s = computeAccountStats(a);

  document.getElementById('accDetailName').textContent = a.account_name;
  const startLabel = a.start_date ? `· start ${new Date(a.start_date + 'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : '';
  const statusLabel = a.status && a.status !== 'Ongoing' ? ` · ${a.status}` : '';
  document.getElementById('accDetailSub').textContent = `${a.prop_firm || ''} ${startLabel}${statusLabel}`.trim();

  const stages = ['Evaluation Phase 1','Evaluation Phase 2','Funded'];
  const stageIdx = stages.indexOf(a.phase);
  document.getElementById('accDetailStepper').innerHTML = stages.map((label,i) => {
    const cls = stageIdx < 0 ? '' : (i < stageIdx ? 'done' : (i === stageIdx ? 'current' : ''));
    return `<div class="acc-step ${cls}"><div class="acc-step-line"></div><div class="acc-step-circle">${i < stageIdx ? '✓' : i+1}</div><div class="acc-step-label">${label.replace('Evaluation ','')}</div></div>`;
  }).join('');

  if(s.dailyLossLimit > 0){
    document.getElementById('accDetailDailyLoss').textContent = `$${s.dailyLossUsed.toLocaleString(undefined,{maximumFractionDigits:2})} / $${s.dailyLossLimit.toLocaleString(undefined,{maximumFractionDigits:2})}`;
    document.getElementById('accDetailDailyRange').innerHTML = `<span>start ${s.dayStartBalance.toLocaleString(undefined,{maximumFractionDigits:2})}</span><span>stop ${s.dailyStopBalance.toLocaleString(undefined,{maximumFractionDigits:2})}</span>`;
  }else{
    document.getElementById('accDetailDailyLoss').textContent = '—';
    document.getElementById('accDetailDailyRange').innerHTML = '';
  }

  document.getElementById('accDetailProfitDays').textContent = s.profitableDaysTarget
    ? `${s.profitableDaysCount} of ${s.profitableDaysTarget}`
    : `${s.profitableDaysCount} days`;

  document.getElementById('accDetailBalance').textContent = `$${s.currentBalance.toLocaleString(undefined,{maximumFractionDigits:2})}`;
  document.getElementById('accDetailBalanceFill').style.width = `${(s.balanceRangeFraction*100).toFixed(1)}%`;
  document.getElementById('accDetailBalanceRange').innerHTML = s.profitGoal
    ? `<span>stop ${s.drawdownFloor.toLocaleString(undefined,{maximumFractionDigits:0})}</span><span>goal ${s.profitGoal.toLocaleString(undefined,{maximumFractionDigits:0})}</span>`
    : '';

  document.getElementById('accDetailEarn').textContent = `$${s.totalEarn.toLocaleString(undefined,{maximumFractionDigits:2})}`;

  renderAccountEarnChart(s);
  document.getElementById('accountDetailModal').classList.add('open');
}

function closeAccountDetail(){
  document.getElementById('accountDetailModal').classList.remove('open');
}

function renderAccountEarnChart(s){
  const canvas = document.getElementById('accDetailChart');
  const ctx = canvas.getContext('2d');
  if(accountDetailChartRef){ accountDetailChartRef.destroy(); accountDetailChartRef = null; }
  if(!s.series.length) return;

  const labels = s.series.map(p => p.date.toLocaleDateString('en-US',{month:'short', day:'numeric'}));
  const values = s.series.map(p => p.cum);
  const finalVal = values[values.length - 1];
  const lineColor = finalVal >= 0 ? cssVar('--win') : cssVar('--loss');

  accountDetailChartRef = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      data: values, borderColor: lineColor, backgroundColor: lineColor + '22',
      fill: 'origin', tension: 0.25, pointRadius: 0, borderWidth: 2
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => 'Cumulative: ' + fmtMoney(c.parsed.y) } }
      },
      scales: { x: { display: true, grid: { display: false } }, y: { display: true } }
    }
  });
}

function renderAccountsList(){
  const wrap = document.getElementById('accountsList');
  if(!wrap) return;
  if(!TRADING_ACCOUNTS.length){
    wrap.innerHTML = `<div class="empty-state">No accounts yet — add your prop firm account and its rules.</div>`;
    return;
  }
  wrap.innerHTML = TRADING_ACCOUNTS.map(a => {
    const isExchange = a.account_type === 'Exchange';

    const rules = [];
    if(isExchange){
      rules.push(`<span class="pill pill-muted">Manual entry — API sync not connected yet</span>`);
    } else {
      if(a.max_daily_loss_pct != null) rules.push(`<span class="pill pill-red">Daily Loss ${a.max_daily_loss_pct}%</span>`);
      if(a.max_total_drawdown_pct != null) rules.push(`<span class="pill pill-red">Max DD ${a.max_total_drawdown_pct}%</span>`);
      if(a.profit_target_pct != null) rules.push(`<span class="pill pill-green">Target ${a.profit_target_pct}%</span>`);
      if(a.min_trading_days != null) rules.push(`<span class="pill pill-blue">Min ${a.min_trading_days} days</span>`);
      if(a.consistency_rule_pct != null) rules.push(`<span class="pill pill-orange">Consistency ${a.consistency_rule_pct}%</span>`);
    }

    let balanceHTML = '';
    if(a.current_balance != null && a.account_size){
      const pl = a.current_balance - a.account_size;
      const plPct = (pl / a.account_size) * 100;
      const plClass = pl >= 0 ? 'account-pl-pos' : 'account-pl-neg';
      const sign = pl >= 0 ? '+' : '';
      balanceHTML += `<div class="account-card-balance">$${Number(a.current_balance).toLocaleString()} <span class="${plClass}">(${sign}$${Math.abs(pl).toLocaleString()} · ${sign}${plPct.toFixed(1)}%)</span></div>`;

      if(a.profit_target_pct){
        const progressFraction = Math.max(0, Math.min(1, plPct / a.profit_target_pct));
        balanceHTML += `
          <div class="account-progress-bar"><div class="account-progress-fill" style="width:${(progressFraction*100).toFixed(1)}%;"></div></div>
          <div class="account-progress-label">${Math.max(0, plPct).toFixed(1)}% of ${a.profit_target_pct}% target</div>
        `;
      }
    } else if(a.current_balance != null){
      balanceHTML += `<div class="account-card-balance">$${Number(a.current_balance).toLocaleString()}</div>`;
    }

    const startLabel = a.start_date ? `· start ${new Date(a.start_date + 'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short'})}` : '';
    const metaLabel = isExchange
      ? `${escapeHtml(a.exchange_name || 'Exchange')} ${startLabel}`
      : `${escapeHtml(a.prop_firm || '—')} ${a.account_size ? `· $${Number(a.account_size).toLocaleString()}` : ''} ${a.phase ? `· ${escapeHtml(a.phase)}` : ''} ${startLabel}`;

    const status = a.status || 'Ongoing';
    const statusBoxClass = status === 'Passed' ? 'box-solid-win' : (status === 'Failed' ? 'box-solid-loss' : 'box-solid-info');
    const statusBadge = !isExchange ? `<div class="account-card-status box-badge ${statusBoxClass}">${status}</div>` : '';

    const riskBase = a.current_balance != null ? Number(a.current_balance) : (a.account_size ? Number(a.account_size) : null);
    const tradeCount = ALL_TRADES.filter(t => t.account === a.account_name).length;
    const riskHTML = (riskBase != null || tradeCount > 0)
      ? `<div class="account-card-risk">
          <div>Total Trades: <span>${tradeCount}</span></div>
          ${riskBase != null ? `<div>Risk Per Trade: <span>$${(riskBase * 0.003).toLocaleString(undefined,{maximumFractionDigits:2})}</span> <span class="account-risk-pct">(0.3%)</span></div>` : ''}
        </div>`
      : '';

    const cardClick = isExchange ? `openAccountModal(${a.id})` : `openAccountDetail(${a.id})`;

    return `
      <div class="account-card" onclick='${cardClick}'>
        ${statusBadge}
        <div class="account-card-name">${escapeHtml(a.account_name)}</div>
        <div class="account-card-meta">${metaLabel}</div>
        ${balanceHTML}
        <div class="account-card-rules">${rules.join('') || '<span class="pill pill-muted">No rules set</span>'}</div>
        ${riskHTML}
        <button class="account-edit-btn-corner" onclick='event.stopPropagation(); openAccountModal(${a.id})' title="Edit account">${accountEditIconSVG()}</button>
      </div>
    `;
  }).join('');
}

function accountEditIconSVG(){
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
}

function openAccountModal(id){
  editingAccountId = id || null;
  const a = id ? TRADING_ACCOUNTS.find(x => x.id === id) : null;

  document.getElementById('accountModalTitle').textContent = a ? 'Edit Account' : '+ Add Account';
  document.getElementById('accType').value = a ? (a.account_type || 'Prop Firm') : 'Prop Firm';
  document.getElementById('accName').value = a ? a.account_name : '';
  document.getElementById('accPropFirm').value = a ? (a.prop_firm || '') : '';
  document.getElementById('accExchangeName').value = a ? (a.exchange_name || 'Binance') : 'Binance';
  document.getElementById('accSize').value = a && a.account_size != null ? a.account_size : '';
  document.getElementById('accBalance').value = a && a.current_balance != null ? a.current_balance : '';
  document.getElementById('accPhase').value = a ? (a.phase || 'Evaluation Phase 1') : 'Evaluation Phase 1';
  document.getElementById('accStatus').value = a ? (a.status || 'Ongoing') : 'Ongoing';
  document.getElementById('accStartDate').value = a && a.start_date ? a.start_date : '';
  document.getElementById('accPhaseStartDate').value = a && a.phase_start_date ? a.phase_start_date : '';
  document.getElementById('accPhaseStartBalance').value = a && a.phase_start_balance != null ? a.phase_start_balance : '';
  document.getElementById('accMaxDailyLoss').value = a && a.max_daily_loss_pct != null ? a.max_daily_loss_pct : '';
  document.getElementById('accMaxDrawdown').value = a && a.max_total_drawdown_pct != null ? a.max_total_drawdown_pct : '';
  document.getElementById('accProfitTarget').value = a && a.profit_target_pct != null ? a.profit_target_pct : '';
  document.getElementById('accMinDays').value = a && a.min_trading_days != null ? a.min_trading_days : '';
  document.getElementById('accConsistency').value = a && a.consistency_rule_pct != null ? a.consistency_rule_pct : '';
  document.getElementById('accountError').textContent = '';
  document.getElementById('accountSaveBtn').textContent = a ? 'Save changes' : 'Save Account';
  document.getElementById('accountDeleteBtn').style.display = a ? 'inline-block' : 'none';
  toggleAccountTypeFields();
  document.getElementById('accountModal').classList.add('open');
}
function closeAccountModal(){
  document.getElementById('accountModal').classList.remove('open');
}

function toggleAccountTypeFields(){
  const isExchange = document.getElementById('accType').value === 'Exchange';
  document.getElementById('accPropFirmFields').style.display = isExchange ? 'none' : 'block';
  document.getElementById('accExchangeFields').style.display = isExchange ? 'block' : 'none';
}

function _numOrNull(id){
  const v = document.getElementById(id).value;
  return v === '' ? null : parseFloat(v);
}

async function saveAccount(){
  const errEl = document.getElementById('accountError');
  const btn = document.getElementById('accountSaveBtn');
  errEl.textContent = '';

  const accountName = document.getElementById('accName').value.trim();
  if(!accountName){ errEl.textContent = 'Account name is required.'; return; }

  btn.disabled = true;
  btn.textContent = 'Saving…';

  const accountType = document.getElementById('accType').value;
  const isExchange = accountType === 'Exchange';

  const payload = {
    account_type: accountType,
    account_name: accountName,
    account_size: isExchange ? null : _numOrNull('accSize'),
    current_balance: _numOrNull('accBalance'),
    start_date: document.getElementById('accStartDate').value || null,
    prop_firm: isExchange ? null : (document.getElementById('accPropFirm').value.trim() || null),
    status: isExchange ? 'Ongoing' : document.getElementById('accStatus').value,
    phase: isExchange ? null : document.getElementById('accPhase').value,
    phase_start_date: isExchange ? null : (document.getElementById('accPhaseStartDate').value || null),
    phase_start_balance: isExchange ? null : _numOrNull('accPhaseStartBalance'),
    max_daily_loss_pct: isExchange ? null : _numOrNull('accMaxDailyLoss'),
    max_total_drawdown_pct: isExchange ? null : _numOrNull('accMaxDrawdown'),
    profit_target_pct: isExchange ? null : _numOrNull('accProfitTarget'),
    min_trading_days: isExchange ? null : (document.getElementById('accMinDays').value === '' ? null : parseInt(document.getElementById('accMinDays').value, 10)),
    consistency_rule_pct: isExchange ? null : _numOrNull('accConsistency'),
    exchange_name: isExchange ? document.getElementById('accExchangeName').value : null
  };

  try{
    const res = editingAccountId
      ? await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${editingAccountId}`, {
          method: 'PATCH',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(payload)
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts`, {
          method: 'POST',
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify([payload])
        });
    if(!res.ok) throw new Error(await res.text());

    closeAccountModal();
    await loadAccounts();
    showToast(editingAccountId ? '✅ Account updated' : '✅ Account added');
  }catch(e){
    console.error("Couldn't save account:", e);
    errEl.textContent = "Couldn't save — please try again.";
  }finally{
    btn.disabled = false;
    btn.textContent = editingAccountId ? 'Save changes' : 'Save Account';
  }
}

async function deleteAccount(){
  if(!editingAccountId) return;
  if(!confirm('Delete this account? This cannot be undone.')) return;
  try{
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trading_accounts?id=eq.${editingAccountId}`, {
      method: 'DELETE',
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${USER_ACCESS_TOKEN}`,
        "Prefer": "return=minimal"
      }
    });
    if(!res.ok) throw new Error(await res.text());
    closeAccountModal();
    await loadAccounts();
    showToast('🗑 Account deleted');
  }catch(e){
    console.error("Couldn't delete account:", e);
    alert("Couldn't delete — please try again.");
  }
}
