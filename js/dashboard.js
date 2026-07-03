let USER_ACCESS_TOKEN = null;

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
let currentView = "dashboard";

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

function toggleTheme(){
  const root = document.documentElement;
  const isLight = root.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try{ localStorage.setItem('ledger-theme', next); }catch(e){}

  document.getElementById('themeToggleBtn').innerHTML = next === 'light'
    ? '☀️ <span class="nav-label">Light mode</span>'
    : '🌙 <span class="nav-label">Dark mode</span>';

  // re-render charts so their colors match the new theme
  if(FILTERED.length || ALL_TRADES.length){
    renderKPIs();
    renderEquityCurve();
    renderWinLossChart();
    renderDisciplineRadar();
    renderDayOfWeekChart();
    renderBreakdown();
  }
}

(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem('ledger-theme'); }catch(e){}
  if(saved === 'light'){
    document.documentElement.setAttribute('data-theme','light');
    const btn = document.getElementById('themeToggleBtn');
    if(btn) btn.innerHTML = '☀️ <span class="nav-label">Light mode</span>';
  }
})();

function switchView(view){
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));

  if(view === 'journal') renderJournalTable();
}

async function initApp(){
  const session = await requireSession(); // redirects to login.html if not logged in
  if(!session) return;
  USER_ACCESS_TOKEN = session.access_token;

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
    session: r.session || "Unspecified",
    day_of_week: r.day_of_week || (r.close_date ? new Date(r.close_date).toLocaleDateString('en-US',{weekday:'long'}) : "Unspecified"),
    emotion: r.emotion || "Unspecified",
    rules_followed: r.rules_followed || "",
    unfollowed_rules: r.unfollowed_rules || "",
    account: r.account || "Unspecified",
    account_type: r.account_type || "",
    trade_summary: r.trade_summary || r.notes || ""
  };
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

  const winRateColor = winRate >= 50 ? cssVar('--win') : cssVar('--loss');
  const pfDisplay = profitFactor===Infinity ? 100 : Math.min(profitFactor/3*100, 100);
  const pfColor = profitFactor >= 1 ? cssVar('--win') : cssVar('--loss');
  const rrDisplay = avgRR === null ? 0 : Math.min(Math.max(avgRR,0)/3*100, 100);
  const rrColor = (avgRR !== null && avgRR >= 1) ? cssVar('--win') : cssVar('--loss');
  const winBarPct = (Math.abs(avgWin)+Math.abs(avgLoss)) > 0 ? Math.abs(avgWin)/(Math.abs(avgWin)+Math.abs(avgLoss))*100 : 50;

  const kpis = [
    {label:"Total PnL", value: fmtMoney(totalPnl), cls: totalPnl>=0?'pos':'neg'},
    {label:"Win rate", value: fmtNum(winRate,1)+"%", cls:'',
      bar: `<div class="kpi-gauge-wrap"><canvas id="winRateGauge"></canvas></div>`},
    {label:"Profit factor", value: profitFactor===Infinity?"∞":fmtNum(profitFactor,2), cls:'',
      bar: `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${pfDisplay}%;background:${pfColor};"></div></div>`},
    {label:"Avg RR", value: avgRR===null?"—":fmtNum(avgRR,2), cls:'',
      bar: `<div class="kpi-bar"><div class="kpi-bar-fill" style="width:${rrDisplay}%;background:${rrColor};"></div></div>`},
    {label:"Total trades", value: t.length, cls:''},
    {label:"Avg win / loss", value: fmtMoney(avgWin).replace('+','')+" / "+fmtMoney(avgLoss), cls:'',
      bar: `<div class="kpi-dual-bar"><div style="width:${winBarPct}%;background:${cssVar('--win')};"></div><div style="width:${100-winBarPct}%;background:${cssVar('--loss')};"></div></div>`},
    {label:"Current streak", value: streakType ? `${streak} ${streakType}${streak>1?'s':''}` : "—", cls: streakType==='win'?'pos':(streakType==='loss'?'neg':'')},
    {label:"Fees paid", value: "$"+fmtNum(t.reduce((s,x)=>s+(x.fee||0),0),2), cls:''}
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k =>
    `<div class="kpi"><div class="label">${k.label}</div><div class="value ${k.cls}">${k.value}</div>${k.bar||''}</div>`
  ).join('');

  renderWinRateGauge(winRate, winRateColor);
}

let winRateGaugeRef = null;
function renderWinRateGauge(winRate, color){
  const canvas = document.getElementById('winRateGauge');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(winRateGaugeRef) winRateGaugeRef.destroy();

  winRateGaugeRef = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [winRate, 100 - winRate],
        backgroundColor: [color, cssVar('--rule')],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: '72%',
      plugins: { legend: { display:false }, tooltip:{ enabled:false } }
    }
  });
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

  const dows = ['S','M','T','W','T','F','S'];
  let html = dows.map(d=>`<div class="cal-dow">${d}</div>`).join('') + `<div class="cal-dow" style="color:var(--accent);">Week</div>`;

  // build a flat list of cells (nulls = blank), padded so it splits evenly into rows of 7
  const cells = [];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length % 7 !== 0) cells.push(null);

  for(let i=0; i<cells.length; i+=7){
    const weekCells = cells.slice(i, i+7);

    let weekPnl = 0, weekCount = 0;
    weekCells.forEach(d => {
      if(d === null) return;
      const info = byDay[d];
      if(info){ weekPnl += info.pnl; weekCount += info.count; }
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
    html += `<div class="cal-cell week-cell ${wkCls}"><div class="d" style="color:var(--accent);">Σ</div>${wkBody}</div>`;
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

  equityChartRef = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
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
      plugins: { legend: { display:false } }
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
        ${t.trade_summary ? `<div class="tc-notes">${t.trade_summary}</div>` : ''}
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
  {key:'trade_setup', label:'Setup'},
  {key:'pattern_type', label:'Pattern'},
  {key:'session', label:'Session'},
  {key:'day_of_week', label:'Day of week'},
  {key:'emotion', label:'Emotion'},
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
  account: ['10k','25k','50k','100k','200k','Demo']
};

const UNFOLLOWED_RULES_OPTIONS = [
  'Rules Followed','Early TP','Entered Early','Overleveraged','No Confirmation','Moved Stop Loss',
  'Revenge Trade','Ignored Trend','FOMO Entry','No BE at Prev High/Low','Ignored No-Trade Decision',
  'Non-BnB Setup','No Scalping Trade','Moved Take Profit','Lack of Confluence','BTC Only'
];

// widget: 'text' | 'number' | 'date' | 'select' | 'checklist' | 'textarea'
// editable: true = this field gets its widget in VIEW mode too (an "Easy Edit" field).
//           In CREATE mode, every field renders its widget regardless of `editable`.
const DRAWER_FIELDS = [
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
  {key:'trade_summary', label:'Trade Summary', widget:'textarea', editable:false}
];

const JOURNAL_COLUMNS = [
  {key:'link', label:''},
  {key:'no', label:'No.'},
  {key:'symbol', label:'Symbol'},
  {key:'win_loss', label:'Win/Loss'},
  {key:'trade_type', label:'Trade Type'},
  {key:'trade_setup', label:'Trade Setup'},
  {key:'profit_loss', label:'Profit/Loss'},
  {key:'pnl_percent', label:'PNL Percent'},
  {key:'rr', label:'RR'},
  {key:'rules_followed', label:'Rules Followed?'},
  {key:'unfollowed_rules', label:'Unfollowed Rules'},
  {key:'exit_type', label:'Exit Type'},
  {key:'account', label:'Account'},
  {key:'session', label:'Session'},
  {key:'open_date', label:'Open Date'}
];

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

function _pill(colorClass, text){
  return `<span class="pill pill-${colorClass}">${text}</span>`;
}

function _winLossColor(winLossRaw){
  const v = (winLossRaw || '').toString().trim().toLowerCase();
  if(v === 'win') return 'green';
  if(v === 'loss') return 'red';
  if(v === 'breakeven' || v === 'be') return 'blue';
  return null;
}

function _journalColoredCell(key, row, plainVal){
  const raw = row[key];
  if(raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim();
  const lower = v.toLowerCase();

  if(key === 'rules_followed'){
    if(lower === 'yes') return _pill('green', v);
    if(lower === 'no') return _pill('red', v);
  }
  if(key === 'unfollowed_rules'){
    return lower === 'rules followed' ? _pill('green', v) : _pill('red', v);
  }
  if(key === 'trade_type'){
    if(lower === 'long' || lower === 'buy') return _pill('green', v);
    if(lower === 'short' || lower === 'sell') return _pill('red', v);
  }
  if(key === 'win_loss'){
    const c = _winLossColor(raw);
    if(c) return _pill(c, v);
  }
  if(key === 'profit_loss' || key === 'pnl_percent'){
    const c = _winLossColor(row.win_loss);
    if(c) return _pill(c, plainVal);
  }
  if(key === 'exit_type'){
    if(lower === 'stop profit') return _pill('blue', v);
    if(lower === 'sl hit') return _pill('red', v);
    if(lower === 'tp hit') return _pill('green', v);
    if(lower === 'cut loss') return _pill('orange', v);
    if(lower === 'manual early tp - valid') return _pill('green', v);
    if(lower === 'manual early tp - invalid') return _pill('red', v);
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
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function openDrawer(mode, positionId){
  drawerMode = mode;
  drawerPositionId = positionId || null;
  drawerEditing = (mode === 'create');
  drawerRowData = mode === 'view' ? (RAW_TRADES.find(r => r.position_id === positionId) || {}) : {};

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
    const showWidget = mode === 'create' || f.editable || drawerEditing;
    const raw = row[f.key];

    if(!showWidget){
      const display = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
      return `<div class="field-row"><label>${f.label}</label><div class="field-static">${display}</div></div>`;
    }

    if(f.widget === 'select'){
      const opts = f.options.map(o => `<option value="${o}" ${raw===o?'selected':''}>${o}</option>`).join('');
      return `<div class="field-row"><label>${f.label}</label><select data-field="${f.key}"><option value="">—</option>${opts}</select></div>`;
    }
    if(f.widget === 'checklist'){
      const selected = (raw || '').split(/[,;]/).map(s=>s.trim()).filter(Boolean);
      const boxes = f.options.map(o => `
        <label><input type="checkbox" data-checklist="${f.key}" value="${o}" ${selected.includes(o)?'checked':''}> ${o}</label>
      `).join('');
      return `<div class="field-row"><label>${f.label}</label><div class="checklist-box">${boxes}</div></div>`;
    }
    if(f.widget === 'date'){
      return `<div class="field-row"><label>${f.label}</label><input type="date" data-field="${f.key}" value="${_toISODateInput(raw)}"></div>`;
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

    RAW_TRADES = RAW_TRADES.filter(r => r.position_id !== drawerPositionId);
    ALL_TRADES = RAW_TRADES.map(normalizeTrade);
    populateAccountFilter();
    populateJournalFilters();
    applyFilters();
    renderJournalTable();
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
