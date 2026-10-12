const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
    // Run the REAL recommendation engine on a journal built so the right answer is
// known in advance, and check it does not recommend anything it cannot support.
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

// EXPLICIT scope, not `with` + a catch-all Proxy. That combination makes the
// with-object claim every free name, which shadows a function's own parameters
// — it made empty fields group under a key called "undefined" here, in the
// harness, while the real code rejects them correctly. Named parameters cannot
// do that, so what this file tests is what the browser runs.
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
  _brokenRuleTags: v => String(v||'').split(/[,;]/).map(s=>s.trim())
    .filter(s => s && !["rules followed","would have be'd out"].includes(s.toLowerCase())),
  _confluenceScoreFor: () => null,
  CONFLUENCE_SETUPS: {},
};

// The popup reads ALL_TRADES and narrows with its own REC_PERIOD, rather than
// inheriting the dashboard's month filter.
function run(trades, tab){
  Object.keys(OUT).forEach(k => delete OUT[k]);
  new Function(...Object.keys(scope), 'ALL_TRADES', 'REC_TAB', 'REC_PERIOD', `
    ${line('const REC_MIN_TRADES')}
    ${line('const REC_TOP_N')}
    ${(() => { const i = js.indexOf('const REC_GROUPS'); let d=0;
      for(let j=js.indexOf('[', i); j<js.length; j++){ if(js[j]==='[')d++; else if(js[j]===']'){d--; if(!d) return js.slice(i, j+1)+';'; } } })()}
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
  `)(...Object.values(scope), trades, tab, 'all');
  return OUT.recBody || '';
}

const D = new Date('2026-08-14T15:00:00');
const mk = (o, pnl, win) => ({ close_date:D, open_date:D, profit_loss:pnl, fee:0,
  win_loss: win ? 'Win' : 'Loss', unfollowed_rules:'', ...o });

// BTC on Mondays pays; ETH loses. Both clear 5 trades.
// "Gold" wins 4 of 5 but only nets +$5 a trade — a win-rate ranking would put
// it on top; expectancy should not.
const TRADES = [
  ...Array.from({length:6}, () => mk({symbol:'BTC/USD', day_of_week:'Monday', trade_setup:'Bounce Play'}, 200, true)),
  ...Array.from({length:6}, () => mk({symbol:'BTC/USD', day_of_week:'Monday', trade_setup:'Bounce Play'}, -50, false)),
  ...Array.from({length:8}, () => mk({symbol:'ETH/USD', day_of_week:'Friday', trade_setup:'Rejection Play'}, -120, false)),
  ...Array.from({length:2}, () => mk({symbol:'ETH/USD', day_of_week:'Friday', trade_setup:'Rejection Play'}, 60, true)),
  ...Array.from({length:4}, () => mk({symbol:'XAU/USD', day_of_week:'Tuesday', trade_setup:'Bounce Play'}, 20, true)),
  ...Array.from({length:1}, () => mk({symbol:'XAU/USD', day_of_week:'Tuesday', trade_setup:'Bounce Play'}, -55, false)),
  // Only 3 trades — under the bar, must never be recommended however good.
  ...Array.from({length:3}, () => mk({symbol:'SOL/USD', day_of_week:'Sunday', trade_setup:'Invalidation Play'}, 900, true)),
];

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};
// Parse the grouped structure back out: sections -> dimensions -> ranked lines.
function parse(h){
  const out = [];
  [...h.matchAll(/<div class="rec-section"><div class="rec-section-title">([^<]*)<\/div>([\s\S]*?)(?=<div class="rec-section">|<div class="rec-foot">|$)/g)]
    .forEach(sm => {
      const dims = [...sm[2].matchAll(/<div class="rec-dim-head">([^<]*)<span class="rec-pool">([^<]*)<\/span><\/div>([\s\S]*?)(?=<div class="rec-dim-block">|$)/g)]
        .map(dm => ({
          dim: dm[1], pool: dm[2],
          picks: [...dm[3].matchAll(/rec-name">([^<]*)<\/div>\s*<div class="rec-avg[^>]*>([^<]*)</g)]
            .map(pm => [pm[1], pm[2]])
        }));
      out.push({ section: sm[1], dims });
    });
  return out;
}
const flat = h => parse(h).flatMap(s => s.dims.map(d => [d.dim, d.picks[0] && d.picks[0][0]]));
const rowsOf = h => flat(h).map(([d,n]) => [d,n]);

console.log('LOOK FOR THESE\n');
let h = run(TRADES, 'do');
parse(h).forEach(s => {
  console.log('   ' + s.section.toUpperCase());
  s.dims.forEach(d => {
    console.log('      ' + d.dim.padEnd(19) + '(' + d.pool + ')');
    d.picks.forEach(([n,v],i) => console.log('        ' + (i+1) + '. ' + n.padEnd(18) + v));
  });
});
check('BTC/USD ang symbol', rowsOf(h).find(r => r[0]==='Symbol')?.[1], 'BTC/USD');
check('Monday ang araw', rowsOf(h).find(r => r[0]==='Day of week')?.[1], 'Monday');
check('Bounce Play ang setup', rowsOf(h).find(r => r[0]==='Setup')?.[1], 'Bounce Play');

console.log('\n  Expectancy, hindi win rate:');
// XAU wins 80% but averages only +$5; BTC wins 50% but averages +$75.
check('hindi XAU ang symbol kahit 80% panalo', rowsOf(h).some(r => r[1]==='XAU/USD'), false);
check('may paalala tungkol sa win rate', /a low win rate with a wide R can still top this list/.test(h), true);

console.log('\n  Ang hindi sapat ang bilang:');
check('SOL (3 trades, +$900) ay wala', /SOL\/USD/.test(h), false);
check('sinasabi ang bilang bawat linya', /\d+ trades? · /.test(h), true);

console.log('\nAng ayos ay nakapirmi, hindi nagpapalit-palit:');
const secOrder = parse(h).map(s => s.section);
console.log('   ' + secOrder.join('  ->  '));
check('nauuna ang "What to trade"', secOrder[0], 'What to trade');
check('sunod ang "When to trade"', secOrder[1], 'When to trade');
// Same data, run again — the order must be identical, not re-ranked.
check('pareho sa ulit na pagpapatakbo', parse(run(TRADES,'do')).map(s => s.section).join(','), secOrder.join(','));

console.log('\nTop 3 bawat dimensyon, hindi isa lang:');
const bySymbol = parse(h)[0].dims.find(d => d.dim === 'Symbol');
console.log('   Symbol: ' + bySymbol.picks.map(p => p[0] + ' ' + p[1]).join('  |  '));
check('dalawang kumikitang symbol', bySymbol.picks.length, 2);
check('BTC muna', bySymbol.picks[0][0], 'BTC/USD');
check('sunod ang XAU', bySymbol.picks[1][0], 'XAU/USD');
// The label now states how many fall on this side, rather than "top N of M"
// — which read as "only N of your M leaks are being shown".
check('sinasabi kung ilan ang kumikita', bySymbol.pool, '2 of 3 make money');

console.log('\nAVOID THESE\n');
h = run(TRADES, 'avoid');
parse(h).forEach(s => {
  console.log('   ' + s.section.toUpperCase());
  s.dims.forEach(d => d.picks.forEach(([n,v],i) => console.log('      ' + d.dim.padEnd(17) + n.padEnd(18) + v)));
});
check('ETH/USD ang iiwasan', rowsOf(h).find(r => r[0]==='Symbol')?.[1], 'ETH/USD');
check('Friday ang araw', rowsOf(h).find(r => r[0]==='Day of week')?.[1], 'Friday');
check('Rejection Play ang setup', rowsOf(h).find(r => r[0]==='Setup')?.[1], 'Rejection Play');
check('walang kumikitang bagay dito', /rec-avg pos/.test(h), false);

console.log('\nKapag kulang ang datos:');
h = run(TRADES.slice(0,3), 'do');
// Wording moved from "in view" to "in this period" when the popup got its own
// period selector.
check('may paliwanag, hindi blangko', /Only 3 trades in this period/.test(h), true);
check('sinasabi ang kailangan', /at least 5/.test(h), true);

console.log('\nKapag walang kumikita:');
h = run(Array.from({length:6}, () => mk({symbol:'ETH/USD'}, -50, false)), 'do');
check('sinasabing wala', /Nothing clears the bar yet/.test(h), true);

console.log('\nAng babala sa pagsasama-sama:');
h = run(TRADES, 'do');
check('sinasabing hiwalay ang sukat', /not in combination/.test(h), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
