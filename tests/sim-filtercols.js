const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Which journal columns the +Filter menu offers, and which are still held back.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  if (!m) throw new Error('missing ' + name);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function setBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*new Set\\(\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ']);'.slice(1); }
  }
}
function grab(marker){
  const i = js.indexOf(marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

// Trades covering every column, so nothing is dropped for being empty.
const RAW_TRADES = [
  { symbol:'BTC/USD', win_loss:'Win', trade_type:'Long', trade_setup:'Bounce Play',
    pattern_type:'15 mins HL', execution_tf:'5 min', aof_phase:'IC', objective:'Scalping',
    rules_followed:'Yes', unfollowed_rules:'Rules Followed', exit_type:'TP Hit',
    post_be_result:'N/A', account:'Upscale Trade 5K', account_type:'Evaluation',
    session:'London', day_of_week:'Wednesday', chart_pattern:'Double Bottom',
    emotion:'Calm' },
  { symbol:'ETH/USD', win_loss:'Loss', trade_type:'Short', trade_setup:'Rejection Play',
    pattern_type:'1 hour LH', execution_tf:'15 min', aof_phase:'LM', objective:'Intraday',
    rules_followed:'No', unfollowed_rules:'FOMO Entry', exit_type:'SL Hit',
    post_be_result:'N/A', account:'Upscale Trade 10K', account_type:'Funded',
    session:'New York', day_of_week:'Friday', chart_pattern:'H&S', emotion:'Rushed' },
];

// ALL_DRAWER_FIELDS reads these when it builds its select widgets — supplied
// as empty lists because only the KEYS matter here, not the options.
const scope = {
  RAW_TRADES, JOURNAL_BLANK_FILTER: '(blangko)',
  FIELD_OPTIONS: new Proxy({}, { get: () => [] }),
  UNFOLLOWED_RULES_OPTIONS: [],
  // Ang paper-only na field ay nasa iisang listahan ng drawer field, kaya
  // kailangan ding ibigay ang mga pagpipilian nito para tumakbo ang block.
  NO_TRADE_REASONS: [],
  NO_TRADE_REASON_GROUPS: [],
  PAPER_OUTCOMES: [],
  PAPER_OUTCOME_GROUPS: [],
};
const src = [
  /* Ang mga listahan ng Trade Journals ay dumadaan na sa _realRawTrades() —
     tunay lamang, dahil ang paper trade ay may sariling pahina. */
  'const _rowVal = (r, k) => r[k];',
  grab('function _realRawTrades('),
  arrBlock('ALL_DRAWER_FIELDS'),
  setBlock('JOURNAL_FILTER_EXCLUDE'),
  arrBlock('JOURNAL_FILTER_EXTRA'),
  'const JOURNAL_MULTI_KEYS = new Set([\'unfollowed_rules\']);',
  grab('function _journalFilterValues('),
  grab('function _journalFilterableColumns('),
].join('\n');

let cols;
try {
  cols = new Function(...Object.keys(scope), src + ' return _journalFilterableColumns();')
    (...Object.values(scope));
} catch (e) {
  console.log('COMPILE FAIL: ' + e.message);
  process.exit(1);
}

console.log('Mga column sa +Filter: ' + cols.length + '\n');
cols.forEach(c => console.log('  ' + c.label.padEnd(20) + c.values.length + ' halaga   ' +
  c.values.slice(0,3).join(', ')));

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(40) + got + (ok ? '' : '   <-- ' + want));
};
const has = k => cols.some(c => c.key === k);

console.log('\nAng tatlong hinanap mo:');
check('Objective nandoon na', has('objective'), true);
check('Chart Pattern nandoon na', has('chart_pattern'), true);
check('Emotion nandoon na', has('emotion'), true);

console.log('\nDapat pa ring wala (masyadong marami ang halaga):');
['duration','confluence_score','profit_loss','entry_price','notes','open_date'].forEach(k =>
  check(k + ' hindi kasama', has(k), false));

/* Ang Journal ledger ay nagpapakita lamang ng TUNAY na trade, at ang tunay na
   trade ay walang dahilan kung bakit hindi kinuha — dahil kinuha ito. Kaya
   hindi dapat lumitaw ang column na iyon sa +Filter dito. Hindi ito ipinagbawal
   nang tahasan: nawawala ito dahil walang laman. Iyon mismo ang sinusuri —
   kung may makapagdagdag ng dahilan sa isang tunay na trade, dito ito lilitaw. */
console.log('\nPaper-only, kaya wala sa Journal:');
check('no_trade_reason hindi kasama', has('no_trade_reason'), false);

console.log('\nWalang dobble:');
const keys = cols.map(c => c.key);
check('walang inulit', keys.filter((k,i) => keys.indexOf(k) !== i).length, 0);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
