const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Run the REAL _bulkJournalRows. In a bulk run trade_type is hidden, so none
// of the drawer change events fire — this is the path that has to re-derive
// everything itself.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(marker) {
  const i = js.indexOf(marker);
  if (i < 0) throw new Error('missing: ' + marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function constBlock(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*[\\{\\[]').exec(js);
  if (!m) throw new Error('missing const: ' + name);
  const open = js[m.index + m[0].length - 1], close = open === '{' ? '}' : ']';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

// Three accounts, ONE trade, but each setup answered its Sequence differently.
const SAVED_SETUPS = [
  { id:'S1', pattern_type:'15 mins HL', confluence_answers:{3:'1st'} },
  { id:'S2', pattern_type:'15 mins HL', confluence_answers:{3:'3rd'} },
  { id:'S3', pattern_type:'15 mins HL', confluence_answers:{3:'5th'} },
];
const parsed = {
  symbol:'BTC/USD', trade_type:'Long', pattern_type:'15 mins HL',
  profit_loss:591.36, win_loss:'Win', entry_price:64447.7, close_price:65400.9
};
const drawerBulkTargets = [
  { setupId:'S1', parsed:{ ...parsed, account:'Upscale Trade 5K'  } },
  { setupId:'S2', parsed:{ ...parsed, account:'Upscale Trade 10K' } },
  { setupId:'S3', parsed:{ ...parsed, account:'Upscale Trade 50K' } },
];
const TRADING_ACCOUNTS = [
  { account_name:'Upscale Trade 5K',  phase:'Evaluation Phase 1', account_type:'Prop Firm' },
  { account_name:'Upscale Trade 10K', phase:'Evaluation Phase 2', account_type:'Prop Firm' },
  { account_name:'Upscale Trade 50K', phase:'Funded',             account_type:'Prop Firm' },
];

const real = {
  drawerBulkTargets, SAVED_SETUPS, TRADING_ACCOUNTS, RAW_TRADES: [{no:41}],
  JOURNAL_COMPUTED_KEYS: new Set(['objective','duration','risk_amount','trade_summary']),
  CONFLUENCE_SETUPS: new Function(constBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')(),
  Object, Math, Number, String, Set, Date, JSON, console, parseFloat, isNaN, Boolean, Array,
};
const stubbed = new Set();
const sandbox = new Proxy(real, {
  has: () => true,
  get(t, k){
    if (k in t) return t[k];
    if (typeof k === 'symbol') return undefined;
    stubbed.add(String(k));
    return new Proxy(function(){}, { get: () => undefined, apply: () => undefined });
  },
  set(t, k, v){ t[k] = v; return true; }
});

const build = new Function('__sb', `
  with (__sb) {
    ${constBlock('PATTERN_EXEC_TF')}
    ${constBlock('PATTERN_FIXED_AOF')}
    const _execTfFor = p => PATTERN_EXEC_TF[p] || null;
    ${constBlock('TRADE_TYPE_SETUP_MAP')}
    ${constBlock('SEQUENCE_AOF_MAP')}
    ${grab('function _aofFromSequence(')}
    ${grab('function _accountTypeFor(')}
    ${grab('function _bulkJournalRows(')}
    return _bulkJournalRows;
  }
`)(sandbox);

// The drawer answered nothing for these — exactly the case that matters.
const { rows, confluenceDropped } = build({
  trade_setup:'', pattern_type:'15 mins HL', aof_phase:'', execution_tf:'', rules_followed:'Yes'
});

console.log('BULK: isang trade, tatlong account, magkaibang Sequence\n');
const cols = ['account','account_type','trade_setup','pattern_type','execution_tf','aof_phase'];
console.log('  ' + cols.map(c => c.padEnd(15)).join(''));
console.log('  ' + '-'.repeat(cols.length * 15));
rows.forEach(r => console.log('  ' + cols.map(c => String(r[c] || '—').padEnd(15)).join('')));

const expect = [
  { account_type:'Evaluation', trade_setup:'Bounce Play', execution_tf:'5 min', aof_phase:'IC' },
  { account_type:'Evaluation', trade_setup:'Bounce Play', execution_tf:'5 min', aof_phase:'LM' },
  { account_type:'Funded',     trade_setup:'Bounce Play', execution_tf:'5 min', aof_phase:'Extended Movement' },
];
let fail = 0;
rows.forEach((r, i) => Object.entries(expect[i]).forEach(([k, v]) => {
  if (r[k] !== v) { fail++; console.log('  FAIL row ' + (i+1) + ' ' + k + ': ' + r[k] + ' != ' + v); }
}));
console.log('\n  ' + (fail ? fail + ' FAIL' : 'lahat tama — magkaibang AOF sa bawat account, iisang drawer'));
console.log('  confluenceDropped: ' + confluenceDropped);

// Invalidation Play chosen in the shared drawer. pattern_type is NOT hidden in
// a bulk run, so picking the setup fires the same cascade the single drawer
// uses and the pattern arrives already corrected — this is the reachable state.
const inval = build({ trade_setup:'Invalidation Play', pattern_type:'30 mins Invalidation Play',
                      aof_phase:'', execution_tf:'' });
console.log('\nBULK: Invalidation Play sa shared drawer');
{
  const r = inval.rows[0];
  console.log('  trade_setup  : ' + r.trade_setup);
  console.log('  pattern_type : ' + (r.pattern_type || '(blangko)'));
  console.log('  aof_phase    : ' + (r.aof_phase || '(blangko)'));
  console.log('  execution_tf : ' + (r.execution_tf || '(blangko)') + '   (tama — walang mapping ang Invalidation)');
  const ok = r.aof_phase === 'Invalidation' && !r.execution_tf;
  console.log('  ' + (ok ? 'PASS' : 'FAIL'));
  if (!ok) fail++;
  // The setups were answered for "15 mins HL". Changing the pattern makes those
  // index-keyed answers point at different questions, so they must be dropped.
  console.log('  confluenceDropped: ' + inval.confluenceDropped +
    (inval.confluenceDropped === 3 ? '   PASS — nabitawan ang hindi na tugmang sagot' : '   FAIL'));
  if (inval.confluenceDropped !== 3) fail++;
}

// Defensive branch: nothing anywhere supplies a pattern. Swap in targets whose
// prefill carries none, so the blank-fill path actually runs.
const noPattern = drawerBulkTargets.map(t => ({
  setupId: t.setupId,
  parsed: Object.fromEntries(Object.entries(t.parsed).filter(([k]) => k !== 'pattern_type'))
}));
drawerBulkTargets.length = 0;
drawerBulkTargets.push(...noPattern);
const bare = build({ trade_setup:'Invalidation Play', pattern_type:'', aof_phase:'', execution_tf:'' });
console.log('\nBULK: Invalidation Play, walang pattern kahit saan');
{
  const r = bare.rows[0];
  console.log('  pattern_type : ' + (r.pattern_type || '(blangko)'));
  console.log('  aof_phase    : ' + (r.aof_phase || '(blangko)'));
  const ok = r.pattern_type === '30 mins Invalidation Play' && r.aof_phase === 'Invalidation';
  console.log('  ' + (ok ? 'PASS — napuno ang pares' : 'FAIL'));
  if (!ok) fail++;
}

if (stubbed.size) console.log('\n(na-stub ng harness: ' + [...stubbed].sort().join(', ') + ')');
process.exit(fail ? 1 : 0);
