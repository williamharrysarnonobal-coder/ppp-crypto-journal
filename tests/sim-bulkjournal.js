const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Three accounts, one setup. Paste three tickets, answer the shared fields
// once, and check the three rows that come out carry the right numbers.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(name) {
  const idx = js.indexOf('function ' + name + '(');
  let depth = 0;
  for (let j = js.indexOf('{', idx); j < js.length; j++) {
    if (js[j] === '{') depth++;
    else if (js[j] === '}') { depth--; if (depth === 0) return js.slice(idx, j + 1); }
  }
}
const hiddenSrc = /const BULK_HIDDEN_KEYS = new Set\(\[[\s\S]*?\]\);/.exec(js)[0];
const computedSrc = /const JOURNAL_COMPUTED_KEYS = new Set\(\[[^\]]*\]\);/.exec(js)[0];

const api = new Function(`
  ${computedSrc}
  ${hiddenSrc}
  let drawerBulkTargets = null;
  const RAW_TRADES = [{ no: 7 }, { no: 12 }];
  const SAVED_SETUPS = [
    {id:1, account_name:'Upscale 5K',  pattern_type:'15 mins HL', confluence_answers:{0:'yes'}, chart_pattern:'Double Bottom'},
    {id:2, account_name:'Upscale 10K', pattern_type:'15 mins HL', confluence_answers:{0:'yes'}, chart_pattern:'Double Bottom'},
    {id:3, account_name:'Upscale 50K', pattern_type:'15 mins HL', confluence_answers:{0:'yes'}, chart_pattern:'Double Bottom'},
  ];
  const _autoExitType = (p) => (Number(p.profit_loss) < 0 ? 'SL Hit' : 'TP Hit');
  const _applyMovedStopFlags = () => {};
  const TRADING_ACCOUNTS = [
    { account_name:'Upscale 5K',  phase:'Funded' },
    { account_name:'Upscale 10K', phase:'Evaluation Phase 1' },
    { account_name:'Upscale 50K', phase:'Funded' },
  ];
  ${grab('_accountTypeFor')}
  ${grab('_bulkJournalRows')}
  return {
    set: (t) => { drawerBulkTargets = t; },
    rows: (shared) => _bulkJournalRows(shared),
    hidden: BULK_HIDDEN_KEYS,
    groups: null
  };
`)();

// What each paste produced — same trade, different account.
const pastes = [
  { setupId: 1, parsed: { symbol:'BTC/USD', account:'Upscale 5K',  profit_loss:-20.16, fee:2.5958, entry_price:63587.2, close_price:63400, position_size:0.05, win_loss:'Loss', open_date:'2026-08-17T16:12' } },
  { setupId: 2, parsed: { symbol:'BTC/USD', account:'Upscale 10K', profit_loss:-40.32, fee:5.1916, entry_price:63587.2, close_price:63400, position_size:0.10, win_loss:'Loss', open_date:'2026-08-17T16:12' } },
  { setupId: 3, parsed: { symbol:'BTC/USD', account:'Upscale 50K', profit_loss:-201.6, fee:25.958, entry_price:63587.2, close_price:63400, position_size:0.50, win_loss:'Loss', open_date:'2026-08-17T16:12' } },
];
api.set(pastes);

// What he typed once in the drawer.
const shared = {
  objective: 'Scalping',
  session: 'London',
  trade_setup: 'Bread and Butter',
  execution_tf: '5 mins',
  aof_phase: 'Phase 2',
  rules_followed: 'Yes',
  unfollowed_rules: '',
  exit_type: null,
  post_be_result: null,
  notes: 'Same setup across all three.',
  link: null,
  trade_summary: null
};

const { rows } = api.rows(shared);

console.log('=== three rows out');
rows.forEach(r => {
  console.log('   ' + String(r.account).padEnd(14) +
    'P/L ' + String(r.profit_loss).padStart(8) +
    '   fee ' + String(r.fee).padStart(7) +
    '   qty ' + String(r.position_size).padStart(5) +
    '   no ' + r.no +
    '   setup#' + r.linked_setup_id);
});

console.log('\n=== per-account values kept distinct');
const distinct = new Set(rows.map(r => r.profit_loss)).size === 3
  && new Set(rows.map(r => r.account)).size === 3
  && new Set(rows.map(r => r.position_size)).size === 3;
console.log('   ' + (distinct ? 'PASS - P/L, fee, quantity and account all differ' : 'FAIL - values got flattened'));

console.log('\n=== the answers given once landed on all three');
// `objective` is deliberately absent: it renders as computed text, has no
// column, and is now stripped before the insert.
const sharedOk = rows.every(r =>
  r.trade_setup === 'Bread and Butter' && r.aof_phase === 'Phase 2' &&
  r.rules_followed === 'Yes' && r.session === 'London');
console.log('   ' + (sharedOk ? 'PASS' : 'FAIL'));
console.log('   objective stripped (computed, not a column) : ' +
  (rows.every(r => !('objective' in r)) ? 'yes' : 'NO <-- would reject the batch'));

console.log('\n=== blanks in the drawer did not wipe ticket values');
console.log('   unfollowed_rules (typed as empty) : ' + JSON.stringify(rows[0].unfollowed_rules));
console.log('   win_loss (from the ticket)        : ' + JSON.stringify(rows[0].win_loss));
console.log('   ' + (rows[0].win_loss === 'Loss' ? 'PASS - ticket value survived' : 'FAIL'));

console.log('\n=== exit type derived per row, not once for the batch');
console.log('   ' + rows.map(r => r.account + '=' + r.exit_type).join(', '));

console.log('\n=== ids and numbering');
console.log('   position_ids unique : ' + (new Set(rows.map(r => r.position_id)).size === 3 ? 'yes' : 'NO <-- collision'));
console.log('   no. sequence        : ' + rows.map(r => r.no).join(', ') + '  (highest existing was 12)');
console.log('   confluence carried  : ' + (rows.every(r => r.confluence_answers && r.chart_pattern) ? 'yes' : 'NO'));

console.log('\n=== Account Type (the field that came out blank)');
rows.forEach(r => console.log('   ' + String(r.account).padEnd(14) + 'account_type = ' + JSON.stringify(r.account_type)));
const typesOk = rows.every(r => r.account_type) &&
  rows.find(r => r.account === 'Upscale 10K').account_type === 'Evaluation' &&
  rows.find(r => r.account === 'Upscale 5K').account_type === 'Funded';
console.log('   ' + (typesOk ? 'PASS - derived per account, from its own phase' : 'FAIL - still blank or wrong'));

console.log('\n=== correcting the Pattern Type');
// The setups were saved as "15 mins HL"; he fixes it to "5 mins HL" here.
api.set(pastes.map(p => ({ ...p })));
const same = api.rows({ ...shared, pattern_type: '15 mins HL' });
const changed = api.rows({ ...shared, pattern_type: '5 mins HL' });
console.log('   pattern kept as the setup had it:');
console.log('      pattern on rows   : ' + same.rows[0].pattern_type);
console.log('      confluence carried: ' + (same.rows.every(r => r.confluence_answers) ? 'yes' : 'no'));
console.log('      dropped count     : ' + same.confluenceDropped);
console.log('   pattern corrected in the drawer:');
console.log('      pattern on rows   : ' + changed.rows[0].pattern_type + '   <- the correction applied to all 3');
console.log('      confluence carried: ' + (changed.rows.some(r => r.confluence_answers) ? 'YES <-- would be wrong' : 'no, dropped'));
console.log('      dropped count     : ' + changed.confluenceDropped);
console.log('   ' + (changed.rows[0].pattern_type === '5 mins HL' && changed.confluenceDropped === 3
  && !changed.rows.some(r => r.confluence_answers) ? 'PASS' : 'FAIL'));

console.log('\n=== which fields the drawer will show');
const groups = /const JOURNAL_FIELD_GROUPS = \[([\s\S]*?)\n\];/.exec(js)[1];
const notes = /const NOTES_LINKS_GROUP = \{[^}]*keys: \[([^\]]*)\]/.exec(js)[1];
const all = [...groups.matchAll(/title: '([^']+)', keys: \[([^\]]*)\]/g)]
  .map(m => [m[1], m[2].split(',').map(s => s.trim().replace(/'/g, ''))]);
all.push(['Notes & Links', notes.split(',').map(s => s.trim().replace(/'/g, ''))]);
all.forEach(([title, keys]) => {
  const shown = keys.filter(k => !api.hidden.has(k));
  console.log('   ' + title.padEnd(18) + (shown.length ? shown.join(', ') : '(buong grupo nakatago)'));
});
