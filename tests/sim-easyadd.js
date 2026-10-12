const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Run the REAL parseUpscaleEasyAddText against his exact paste.
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

const parse = new Function(`
  ${fnBody('_parseExchangeDateTime')}
  ${fnBody('parseUpscaleEasyAddText')}
  return parseUpscaleEasyAddText;
`)();

const paste = `BTC/USD
LONG x1

0.6204
BTC

39,983.4
USD

Pnl: 591.36 USD
Fee: 6.44465

Avg: $64,447.7
Close: $65,400.9

CLOSED

19.08.26
18:17:07

Close
TP

0.6204

39,983.38

Close: 65,400.9

Pnl: 591.36
Fee: 3.24598

19.08.26
18:17:07

Open position
Limit

0.6204

39,983.38

Avg: 64,447.7
Entry: 64,447.7

Pnl: 0.00
Fee: 3.19867

19.08.26
15:53:30`;

const out = parse(paste);

// Every column the journal drawer knows about, by group.
const GROUPS = [
  ['Overview',        ['symbol','open_date','close_date','duration','objective']],
  ['Result',          ['win_loss','profit_loss','pnl_percent','rr','fee','entry_price','close_price','tp_price','sl_price','position_size','risk_amount']],
  ['Account',         ['account','account_type','session','day_of_week']],
  ['Setup & Strategy',['trade_type','trade_setup','pattern_type','execution_tf','aof_phase']],
  ['Discipline',      ['rules_followed','unfollowed_rules','exit_type','post_be_result']],
  ['Notes & Links',   ['notes','link','trade_summary']],
];

let filled = 0, blank = 0;
GROUPS.forEach(([title, keys]) => {
  console.log('\n' + title);
  keys.forEach(k => {
    const has = out[k] !== undefined && out[k] !== null && out[k] !== '';
    if (has) filled++; else blank++;
    const val = has ? String(out[k]) : '—';
    console.log('   ' + (has ? '[x] ' : '[ ] ') + k.padEnd(17) + val);
  });
});

console.log('\n' + '='.repeat(46));
console.log('   napuno: ' + filled + '   blangko: ' + blank);

// Sanity-check the numbers the parser derived rather than read.
console.log('\nTseke sa mga kinuwenta (hindi binasa):');
const pct = (65400.9 - 64447.7) / 64447.7 * 100;
console.log('   pnl_percent : ' + out.pnl_percent);
console.log('   dapat       : ' + pct.toFixed(6) + '   ' +
  (Math.abs(out.pnl_percent - pct) < 1e-9 ? 'PASS' : 'FAIL'));
console.log('   fee 6.44465 vs 3.24598 + 3.19867 = ' + (3.24598 + 3.19867).toFixed(5) +
  '   ' + (Math.abs(out.fee - 6.44465) < 1e-9 ? 'PASS — kinuha ang total, hindi dinoble' : 'FAIL'));
console.log('   open  ' + out.open_date + '   (15:53:30 — Open position)');
console.log('   close ' + out.close_date + '   (18:17:07 — Close TP)');
const dur = (new Date(out.close_date) - new Date(out.open_date)) / 60000;
console.log('   agwat : ' + Math.floor(dur/60) + 'h ' + Math.round(dur%60) + 'm');

// Anything parsed that ISN'T a known journal column would silently break the insert.
const known = new Set(GROUPS.flatMap(g => g[1]));
const extra = Object.keys(out).filter(k => !known.has(k));
console.log('\n   hindi kilalang key: ' + (extra.length ? extra.join(', ') + '  <-- CHECK' : 'wala'));
