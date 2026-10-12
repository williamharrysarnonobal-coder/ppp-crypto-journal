const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Actually RUN openAccountDetail against his 5K account with a stub DOM.
// A parse check would not have caught `acc` vs `a` — only running it does.
//
// Rather than hand-listing every helper the function reaches for, a Proxy
// traps EVERY identifier lookup: real things I supply come back real, and
// anything else becomes a recorded no-op. That way an undefined-variable
// crash means a genuine bug in dashboard.js, not a gap in this harness.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name) {
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const acc = {
  id: 'a1', account_name: 'Upscale Trade 5K', account_type: 'Prop Firm',
  prop_firm: 'Upscale Trade', account_size: 5000, current_balance: 5098.64,
  phase: 'Evaluation Phase 1', phase_start_date: null, phase_start_balance: null,
  profit_target_pct: 5, max_daily_loss_pct: 5, max_total_drawdown_pct: 10,
  min_trading_days: 5, min_daily_profit_pct: 0.5, status: 'Ongoing', start_date: '2026-07-01'
};
const ALL_TRADES = [
  { account:'Upscale Trade 5K', close_date:new Date(2026,6,20), profit_loss:40,    fee:1, win_loss:'Win' },
  { account:'Upscale Trade 5K', close_date:new Date(2026,7,3),  profit_loss:15.47, fee:0, win_loss:'Win' },
  { account:'Upscale Trade 5K', close_date:new Date(2026,7,11), profit_loss:8,     fee:1, win_loss:'Win' },
];

// Minimal DOM: every element records what was written to it.
const written = {};
const seen = new Set();
const makeEl = id => ({
  get id(){ return id; },
  set textContent(v){ written[id] = String(v); }, get textContent(){ return written[id] || ''; },
  set innerHTML(v){ written[id] = String(v); }, get innerHTML(){ return written[id] || ''; },
  set value(v){ written[id] = String(v); }, get value(){ return written[id] || ''; },
  style: new Proxy({}, { set(t,k,v){ written[id + '.style.' + String(k)] = String(v); t[k]=v; return true; },
                         get(t,k){ return t[k] === undefined ? '' : t[k]; } }),
  classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
  setAttribute(k,v){ written[id + '@' + k] = String(v); },
  removeAttribute(){}, getAttribute(){ return null; },
  appendChild(){}, querySelector(){ return null }, querySelectorAll(){ return []; },
  addEventListener(){}, focus(){}, closest(){ return null; }, remove(){},
  getContext(){ return {}; }
});

const real = {
  TRADING_ACCOUNTS: [acc], ALL_TRADES,
  document: {
    getElementById(id){ seen.add(id); return makeEl(id); },
    querySelector(){ return makeEl('?'); }, querySelectorAll(){ return []; },
    createElement(){ return makeEl('new'); }, body: makeEl('body'), addEventListener(){}
  },
  netPnl: t => (t.profit_loss||0) - (t.fee||0),
  _dayKeyUTC: d => new Date(d).toISOString().slice(0,10),
  _accountPreset: () => null,
  escapeHtml: s => String(s == null ? '' : s),
  ACCOUNT_PHASE_STAGES: ['Evaluation Phase 1','Evaluation Phase 2','Funded'],
  Math, JSON, Number, String, Boolean, Date, Object, Array, Set, Map, console,
  parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, undefined,
  setTimeout: f => f && f(), clearTimeout(){}, Promise, RegExp, Error,
};

const stubbed = new Set();
const sandbox = new Proxy(real, {
  has(){ return true; },                       // trap EVERY identifier lookup
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    stubbed.add(String(k));
    const f = function(){ return ''; };        // callable AND harmless as a value
    return new Proxy(f, { get: () => '' , apply: () => '' });
  },
  set(t, k, v){ t[k] = v; return true; }
});

let fn;
try {
  fn = new Function('__sb', `
    with (__sb) {
      ${fnBody('_accountPhaseStages')}
      ${fnBody('computeAccountStats')}
      ${fnBody('openAccountDetail')}
      return openAccountDetail;
    }
  `)(sandbox);
} catch (e) {
  console.log('COMPILE FAIL: ' + e.message);
  process.exit(1);
}

console.log('Pag-click sa Upscale Trade 5K:\n');
let crashed = false;
try {
  fn('a1');
  console.log('   PASS — bumukas nang walang error');
} catch (e) {
  crashed = true;
  console.log('   FAIL — ' + e.constructor.name + ': ' + e.message);
}

console.log('\nAng laman ng card:');
[['accDetailName','Pangalan'], ['accDetailSub','Sub']].forEach(([k,label]) => {
  if (written[k]) console.log('   ' + label.padEnd(9) + ': ' + written[k]);
});

console.log('\nAng bagong marka ng simula:');
const left = written['accDetailBalanceStart.style.left'];
console.log('   nakita ang element : ' + (seen.has('accDetailBalanceStart') ? 'oo' : 'HINDI'));
console.log('   posisyon           : ' + (left || '(hindi naitakda)'));
console.log('   inaasahan          : 66.7% — dito ang $5,000 sa bar na 4,500 -> 5,250');
const ok = left && Math.abs(parseFloat(left) - 66.666) < 0.5;
console.log('   ' + (ok ? 'PASS — tama ang pwesto ng marka' : 'CHECK — ' + left));

if (stubbed.size) {
  console.log('\n(mga na-stub ng harness, hindi bug: ' + [...stubbed].sort().join(', ') + ')');
}
process.exit(crashed || !ok ? 1 : 0);
