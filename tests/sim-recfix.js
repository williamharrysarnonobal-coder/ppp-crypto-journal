const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
    // The "yes" that showed up as a Sequence position, plus per-tab titles and the
// period filter. Explicit scope — no `with`, which corrupted parameters before.
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

// Real checklists — Sequence sits at a different index in each.
const CS = new Function((() => { const i = js.indexOf('const CONFLUENCE_SETUPS'); let d=0;
  for(let j=js.indexOf('{', i); j<js.length; j++){ if(js[j]==='{')d++; else if(js[j]==='}'){d--; if(!d) return js.slice(i,j+1)+';'; } } })()
  + ' return CONFLUENCE_SETUPS;')();

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
  CONFLUENCE_SETUPS: CS,
};
function run(trades, tab, period){
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
    ${grab('function _confluenceAnswerAt(')}
    ${grab('function _recStats(')}
    ${grab('function _recGroupBy(')}
    ${grab('function _recGroupByMulti(')}
    ${grab('function _recDimensions(')}
    ${grab('function _recPeriodOptions(')}
    ${grab('function _recTrades(')}
    ${grab('function renderRecommendations(')}
    renderRecommendations();
  `)(...Object.values(scope), trades, tab, period || 'all');
  return OUT.recBody || '';
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// A 15 mins HL trade: Sequence is at index 3 on that checklist.
// A trade whose answers were saved under a DIFFERENT checklist has a plain
// yes/no sitting at index 3 — the exact shape that produced "yes".
function trade(pattern, answers, pnl, win, when){
  return { trade_type:'Long', pattern_type:pattern, confluence_answers:answers,
           profit_loss:pnl, fee:0, win_loss: win ? 'Win' : 'Loss',
           close_date:new Date(when), open_date:new Date(when),
           symbol:'BTC/USD', unfollowed_rules:'' };
}
const seqIdx = CS['Long|15 mins HL'].items.findIndex(it => it.select);
console.log('Sequence sa "15 mins HL" ay index ' + seqIdx + '\n');

const good = n => Array.from({length:n}, () => trade('15 mins HL', {[seqIdx]:'3rd'}, 200, true, '2026-08-10'));
const stale = n => Array.from({length:n}, () => trade('15 mins HL', {[seqIdx]:'yes'}, 150, true, '2026-08-10'));
// A losing symbol, so the "What not to trade" section has something to hold —
// without one the section is correctly omitted and the assertion below would
// be testing the fixture's gap, not the code.
const losers = n => Array.from({length:n}, () => {
  const t = trade('15 mins HL', {[seqIdx]:'1st'}, -180, false, '2026-08-12');
  t.symbol = 'ETH/USD';
  return t;
});
const TRADES = [...good(6), ...stale(14), ...losers(7),
  ...Array.from({length:6}, () => trade('15 mins HL', {[seqIdx]:'1st'}, -20, false, '2026-07-10'))];

console.log('ANG BUG — "yes" bilang sequence position:');
let h = run(TRADES, 'do');
const seqBlock = /rec-dim-head">Sequence position[\s\S]*?(?=<div class="rec-dim-block">|<div class="rec-section">|<div class="rec-foot">)/.exec(h);
const names = seqBlock ? [...seqBlock[0].matchAll(/rec-name">([^<]*)</g)].map(m => m[1]) : [];
console.log('   mga lumalabas: ' + (names.join(', ') || '(wala)'));
check('walang "yes"', names.includes('yes'), false);
check('nandoon ang 3rd', names.includes('3rd'), true);
check('ang 14 na stale ay hindi binibilang', /14 trades/.test(seqBlock ? seqBlock[0] : ''), false);

console.log('\nPAMAGAT KADA TAB:');
h = run(TRADES, 'do');
check('"What to trade" sa edge', /rec-section-title">What to trade</.test(h), true);
check('walang "What not to trade" dito', /What not to trade/.test(h), false);
h = run(TRADES, 'avoid');
check('"What not to trade" sa leaks', /rec-section-title">What not to trade</.test(h), true);
check('walang "What to trade" dito', /rec-section-title">What to trade</.test(h), false);

console.log('\nPERIOD FILTER:');
h = run(TRADES, 'do', 'all');
check('lahat ng 33', /^33 trades/.test(OUT.recSub_txt || ''), true);
check('sinasabing all data', /all your journalled trades/.test(OUT.recSub_txt || ''), true);
h = run(TRADES, 'do', '2026-08');
check('Agosto lang, 27', /^27 trades/.test(OUT.recSub_txt || ''), true);
check('pinapangalanan ang buwan', /August 2026/.test(OUT.recSub_txt || ''), true);
h = run(TRADES, 'do', '2026-07');
check('Hulyo lang, 6', /^6 trades/.test(OUT.recSub_txt || ''), true);
h = run(TRADES, 'do', '2026-01');
check('walang laman na buwan ay may paliwanag', /Only 0 trades in this period/.test(h), true);
check('sinasabing lumipat sa All data', /switch to All data/.test(h), true);

console.log('\nHINDI umaasa sa dashboard month filter:');
check('ALL_TRADES ang binabasa, hindi FILTERED', /const trades = _recTrades\(\)/.test(js), true);
/* Dating hinahanap nito ang eksaktong teksto na `ALL_TRADES.filter(t => t.close_date)`,
   at nabigo nang dagdagan ng `&& _countsAsMoney(t)` ang filter. Pero ang layunin
   ay hindi ang teksto — ang layunin ay HINDI dapat umasa sa dashboard filter.
   Iyon ang tinatanong ngayon, at mahuhuli pa rin nito ang tunay na pagbabalik
   sa FILTERED. */
check('_recTrades ay galing sa ALL_TRADES',
  /ALL_TRADES\.filter\(/.test(grab('function _recTrades(')), true);
check('at hindi sa FILTERED',
  /\bFILTERED\b/.test(grab('function _recTrades(')), false);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
