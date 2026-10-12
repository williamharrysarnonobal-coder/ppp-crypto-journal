const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
    // "Is that really only two patterns to avoid?" — the label has to answer that
// without him having to ask. Two different facts were being collapsed into one
// phrase: how many groups fall on this side, and whether the list is capped.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function line(p){ const i = js.indexOf(p); return js.slice(i, js.indexOf('\n', i)); }
function arrBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}

const OUT = {};
const scope = {
  document: {
    getElementById: id => ({ set innerHTML(v){ OUT[id] = v; }, set textContent(v){ OUT[id+'_txt'] = v; },
                             classList:{ add(){}, remove(){}, toggle(){} } }),
    querySelectorAll: () => [],
  },
  escapeHtml: s => String(s ?? ''),
  fmtMoney: n => (n<0?'−':'+') + '$' + Math.abs(n).toFixed(2),
  fmtNum: (n,d) => Number(n).toFixed(d),
  netPnl: t => (t.profit_loss||0) - (t.fee||0),
  _winRateOf: ts => { let w=0,d=0; ts.forEach(t=>{const v=String(t.win_loss||'').toLowerCase();
    if(v==='win'){w++;d++} else if(v==='loss'||v==='liquidated'){d++}}); return d ? w/d*100 : null; },
  _brokenRuleTags: () => [],
  _confluenceScoreFor: () => null,
  _confluenceAnswerAt: () => null,
  CONFLUENCE_SETUPS: {},
};
function run(trades, tab){
  Object.keys(OUT).forEach(k => delete OUT[k]);
  new Function(...Object.keys(scope), 'ALL_TRADES', 'REC_TAB', 'REC_PERIOD', `
    ${line('const REC_MIN_TRADES')}
    ${line('const REC_TOP_N')}
    ${arrBlock('REC_GROUPS')}
    /* Kinuha nang buo mula sa dashboard.js, hindi ginaya. Sa Node ay walang
       localStorage, kaya ang try/catch sa loob ng _realMoneyOnly ay nahuhuli ang
       ReferenceError at nagbabalik ng false — "naka-off ang Real money", na
       siyang estadong sinusuri ng sim na ito. Kung magbabago ang kahulugan ng
       pagsala doon, dito rin ito magbabago sa halip na tahimik na maiwan. */
    ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
    ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
    ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
    ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
    ${grab('function _recStats(')}
    ${grab('function _recGroupBy(')}
    ${grab('function _recGroupByMulti(')}
    ${grab('function _recDimensions(')}
    ${grab('function _recPeriodOptions(')}
    ${grab('function _recTrades(')}
    ${grab('function renderRecommendations(')}
    renderRecommendations();
  `)(...Object.values(scope), trades, tab, 'all');
  return OUT.recBody || '';
}

const D = new Date('2026-08-14T15:00:00');
const mk = (pattern, pnl, win) => ({ pattern_type:pattern, symbol:'BTC/USD',
  profit_loss:pnl, fee:0, win_loss: win ? 'Win' : 'Loss',
  close_date:D, open_date:D, unfollowed_rules:'' });
const many = (n, f) => Array.from({length:n}, f);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(48) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};
const poolOf = (h, dim) => {
  const m = new RegExp('rec-dim-head">' + dim + '<span class="rec-pool">([^<]*)<').exec(h);
  return m ? m[1] : '(wala)';
};
const picksOf = (h, dim) => {
  const b = new RegExp('rec-dim-head">' + dim + '[\\s\\S]*?(?=<div class="rec-dim-block">|<div class="rec-section">|<div class="rec-foot">)').exec(h);
  return b ? [...b[0].matchAll(/rec-name">([^<]*)</g)].map(m => m[1]) : [];
};

// 5 patterns: 2 lose, 3 make money. Nothing is capped.
console.log('LIMANG PATTERN — 2 lugi, 3 kita:\n');
let T = [
  ...many(6, () => mk('5 mins HL',  -80, false)),
  ...many(6, () => mk('5 mins LH',  -40, false)),
  ...many(6, () => mk('15 mins HL',  90, true)),
  ...many(6, () => mk('15 mins LH',  50, true)),
  ...many(6, () => mk('1 hour HL',   20, true)),
];
let h = run(T, 'avoid');
console.log('   avoid: ' + poolOf(h,'Pattern') + '   ->   ' + picksOf(h,'Pattern').join(', '));
check('sinasabing 2 sa 5 ang lugi', poolOf(h,'Pattern'), '2 of 5 lose money');
check('dalawa ang ipinapakita', picksOf(h,'Pattern').length, 2);
check('walang "shown" dahil hindi capped', /shown/.test(poolOf(h,'Pattern')), false);

h = run(T, 'do');
console.log('   edge : ' + poolOf(h,'Pattern') + '   ->   ' + picksOf(h,'Pattern').join(', '));
check('sinasabing 3 sa 5 ang kumikita', poolOf(h,'Pattern'), '3 of 5 make money');

// 5 losers, only 3 fit — the cap must be visible.
console.log('\nLIMANG LUGI, TATLO LANG ANG KASYA:\n');
T = [
  ...many(6, () => mk('5 mins HL',  -80, false)),
  ...many(6, () => mk('5 mins LH',  -70, false)),
  ...many(6, () => mk('15 mins HL', -60, false)),
  ...many(6, () => mk('15 mins LH', -50, false)),
  ...many(6, () => mk('1 hour HL',  -40, false)),
];
h = run(T, 'avoid');
console.log('   avoid: ' + poolOf(h,'Pattern') + '   ->   ' + picksOf(h,'Pattern').join(', '));
check('sinasabing 5 sa 5 ang lugi', /^5 of 5 lose money/.test(poolOf(h,'Pattern')), true);
check('sinasabing tatlo lang ang kita', /worst 3 shown/.test(poolOf(h,'Pattern')), true);
check('tatlo nga', picksOf(h,'Pattern').length, 3);
check('pinakamalala muna', picksOf(h,'Pattern')[0], '5 mins HL');

console.log('\nIISA LANG ANG LUGI:');
T = [...many(6, () => mk('5 mins HL', -80, false)), ...many(6, () => mk('15 mins HL', 90, true))];
h = run(T, 'avoid');
check('malinaw na isa lang', poolOf(h,'Pattern'), '1 of 2 lose money');

console.log('\nWALANG LUGI:');
T = many(6, () => mk('15 mins HL', 90, true));
h = run(T, 'avoid');
check('walang Pattern block', poolOf(h,'Pattern'), '(wala)');
check('may paliwanag sa halip', /Nothing to avoid/.test(h), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
