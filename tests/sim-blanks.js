const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Which columns can be blank without the journal saying anything? Audit the
// required list against every journal column, then check the two conditional
// rules and the per-column summary.
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
function arrBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}

const ALL_COLS = new Function(arrBlock('ALL_JOURNAL_COLUMNS') + ' return ALL_JOURNAL_COLUMNS;')();
const REQ = new Function(arrBlock('JOURNAL_REQUIRED_KEYS') + ' return JOURNAL_REQUIRED_KEYS;')();

// Every key is treated as visible, so this measures the rule itself rather
// than one particular column configuration.
const DRAWER = ALL_COLS.map(c => ({ key:c.key, label:c.label }))
  .concat([{key:'post_be_result', label:'Post-BE Result'}, {key:'unfollowed_rules', label:'Unfollowed Rules'}]);

const API = new Function('DRAWER_FIELDS','ALL_DRAWER_FIELDS', `
  ${arrBlock('JOURNAL_REQUIRED_KEYS')}
  ${grab('const _postBEApplies')}
  ${grab('const _isBlankish')};
  ${grab('function _journalMissingFields(')}
  ${grab('function _journalBlankSummary(')}
  return { _journalMissingFields, _journalBlankSummary };
`)(DRAWER, DRAWER);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

console.log('Aling column ang binabantayan, at alin ang hindi:\n');
// Columns that are legitimately blank on a normal trade — flagging these would
// make the warning constant and therefore ignored.
const OK_BLANK = new Set(['no','pnl_percent','rr','entry_price','close_price','tp_price','sl_price',
  'position_size','fee','duration','objective','notes','trade_summary','link',
  'trade_quality',   // kinukuwenta mula sa Rules Followed? × Win/Loss
  'screenshot_before','screenshot_after','confluence_score','day_of_week','account_type',
  /* Ang leverage ay pwedeng blangko at hindi ito babala: ang bawat trade bago
     idagdag ang column ay wala nito, at ang spot ay walang leverage kahit
     kailan. Ang pagbabantay dito ay magbibigay ng babala sa bawat lumang trade
     mo — at ang babalang laging naroon ay hindi na babala. */
  'leverage',
  // Review: opsyonal, blangko sa bawat lumang trade.
  'mistakes','entry_emotion','exit_emotion','trade_management','entry_area','tp_area','sl_area']);
// Watched, but only under a condition, so they are not in the flat required
// list and are not "legitimately blank" either.
const CONDITIONAL = new Set(['unfollowed_rules','post_be_result','post_cutloss_result','post_stop_profit_result']);
ALL_COLS.forEach(c => {
  const watched = REQ.includes(c.key);
  const cond = CONDITIONAL.has(c.key);
  const expected = watched || cond || OK_BLANK.has(c.key);
  if(!expected) fail++;
  console.log('   ' + (watched ? '[bantay] ' : cond ? '[kung  ] ' : (OK_BLANK.has(c.key) ? '[pwede ] ' : 'GAP     ')) + c.label);
});
console.log('\n   binabantayan: ' + REQ.length + ' · may kondisyon: ' + CONDITIONAL.size +
  ' · pwedeng blangko: ' + OK_BLANK.size);

const base = {};
REQ.forEach(k => base[k] = 'x');
base.win_loss = 'Win';

console.log('\nBawat required na column, kapag blangko:');
REQ.forEach(k => {
  const miss = API._journalMissingFields({ ...base, [k]: '' });
  const hit = miss.length > 0;
  if(!hit) fail++;
  console.log('   ' + (hit ? 'ok   ' : 'FAIL ') + k.padEnd(16) + '-> ' + (miss.join(', ') || '(walang babala)'));
});

console.log('\nAng tatlong kondisyonal:');
check('Rules=No, walang unfollowed -> babala',
  API._journalMissingFields({ ...base, rules_followed:'No', unfollowed_rules:'' }).includes('Trade Tags'), true);
check('Rules=Yes, walang unfollowed -> walang babala',
  API._journalMissingFields({ ...base, rules_followed:'Yes', unfollowed_rules:'' }).includes('Trade Tags'), false);

console.log('');
check('Cut Loss, walang Post-Cutloss -> babala (BAGO)',
  API._journalMissingFields({ ...base, exit_type:'Cut Loss', post_cutloss_result:'' })
    .includes('Post-Cutloss Result'), true);
check('TP Hit, walang Post-Cutloss -> walang babala',
  API._journalMissingFields({ ...base, exit_type:'TP Hit', post_cutloss_result:'' })
    .includes('Post-Cutloss Result'), false);
check('Cut Loss na sinagot -> walang babala',
  API._journalMissingFields({ ...base, exit_type:'Cut Loss', post_cutloss_result:'TP After Cutloss' })
    .includes('Post-Cutloss Result'), false);

console.log('');
check('Breakeven, walang Post-BE -> babala (BAGO)',
  API._journalMissingFields({ ...base, win_loss:'Breakeven', post_be_result:'', exit_type:'Cut Loss' }).includes('Post-BE Result'), true);
check('Win, walang Post-BE -> walang babala',
  API._journalMissingFields({ ...base, win_loss:'Win', post_be_result:'' }).includes('Post-BE Result'), false);
// DATI: "walang babala, nahuhulaan" — nagfa-fill ng 'SL After BE' ang
// _impliedPostBE mula sa BE Hit. Mali 'yon: hindi sinasabi ng BE Hit kung ano
// ang ginawa ng presyo pagkaalis mo, kaya kinakatha nito ang mismong sagot na
// tinatanong. Ngayon ito ang PINAKA-kailangang tanungin.
check('Breakeven + BE Hit -> babala na (dating kinakatha)',
  API._journalMissingFields({ ...base, win_loss:'Breakeven', post_be_result:'', exit_type:'BE Hit' }).includes('Post-BE Result'), true);
check('BE Hit lang, hindi Breakeven -> babala din',
  API._journalMissingFields({ ...base, win_loss:'Loss', post_be_result:'', exit_type:'BE Hit' }).includes('Post-BE Result'), true);

console.log('\nAng buod kada column:');
const rows = [
  { ...base, exit_type:'' },
  { ...base, exit_type:'' },
  { ...base, exit_type:'', aof_phase:'' },
  { ...base, win_loss:'Breakeven', post_be_result:'', exit_type:'Cut Loss' },
  { ...base },
];
const summary = API._journalBlankSummary(rows);
summary.forEach(([label,n]) => console.log('   ' + label.padEnd(20) + n));
check('Exit Type ang pinakamarami', summary[0][0], 'Exit Type');
check('tatlo', summary[0][1], 3);
check('kasama ang AOF Phase', summary.some(([l]) => l === 'AOF Phase'), true);
check('kasama ang Post-BE Result', summary.some(([l]) => l === 'Post-BE Result'), true);
check('naka-sort pababa', summary.every((s,i) => i===0 || summary[i-1][1] >= s[1]), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'walang column na nakakalusot'));
process.exit(fail ? 1 : 0);
