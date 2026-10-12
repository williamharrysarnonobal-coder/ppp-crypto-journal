const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* "Paki sigurado na walang makakalimutan na column kasi mahalaga ito diba."

   Ito ang pagsusuring iyon, at hindi ito listahang isinulat ko nang kamay —
   kinukuha ko ang BAWAT column na alam ng journal mula sa mismong code, at
   inihahambing sa Manual na form. Ang listahang kamay ay mabubulok sa unang
   bagong column; ito ay hindi.

   Tatlong uri ang bawat column:
     KAILANGAN — dapat may kahon sa Manual, ikaw lang ang nakakaalam nito.
     KINUKUWENTA — hindi dapat may kahon, galing ito sa ibang column.
     SA DRAWER   — sinasagot pagkatapos, hindi mula sa card ng broker. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + ' = \\[').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '[') d++;
    else if(js[j] === ']'){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(46) + got + (ok ? '' : '   <-- ' + want));
};

const SPECS = new Function(arrBlock('EASY_ADD_FIELD_SPECS') + ' return EASY_ADD_FIELD_SPECS;')();
const GROUPS = new Function(arrBlock('JOURNAL_FIELD_GROUPS') + ' return JOURNAL_FIELD_GROUPS;')();
const NOTES = /const NOTES_LINKS_GROUP = \{[^}]*keys:\s*\[([^\]]*)\]/.exec(js);

const inForm = new Set(SPECS.map(s => s.key));
const journalKeys = [];
GROUPS.forEach(g => g.keys.forEach(k => journalKeys.push(k)));
if(NOTES) NOTES[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
  .forEach(k => journalKeys.push(k));

/* Ang klasipikasyon. Bawat isa ay may DAHILAN, dahil ang "wala ito sa form"
   ay hindi sapat na sagot — ang tanong ay kung dapat ba itong naroon. */
const COMPUTED = {
  duration:      'entry at exit na oras',
  objective:     'RR at ang resulta',
  day_of_week:   'petsa ng pagbukas',
  session:       'oras ng pagbukas',
  pnl_percent:   'P&L laban sa halaga ng posisyon',
  risk_amount:   'entry, SL at quantity',
  planned_rr:    'entry, TP at SL ng plano — paper trade lang',
  account_type:  'sinusundan ang napiling account',
  trade_number:  'pagkakasunod sa journal',
};
const DRAWER_ONLY = {
  trade_setup:    'sinasagot mo pagkatapos, wala ito sa card ng broker',
  pattern_type:   'pareho',
  execution_tf:   'pareho',
  aof_phase:      'pareho',
  rules_followed: 'hatol sa sarili, hindi datos ng broker',
  unfollowed_rules: 'pareho',
  exit_type:      'pareho',
  post_be_result: 'pareho',
  post_cutloss_result: 'pareho',
  post_stop_profit_result: 'pareho',
  mistakes: 'review sa drawer',
  entry_area: 'isinusulat mo, may mungkahi',
  tp_area: 'isinusulat mo, may mungkahi',
  sl_area: 'pareho',
  entry_emotion: 'pareho',
  exit_emotion: 'pareho',
  trade_management: 'pareho',
  notes:          'isinusulat mo sa drawer',
  link:           'pareho',
  trade_summary:  'pareho',
  no_trade_reason:'para lang sa paper trade',
  paper_outcome:  'para lang sa paper trade — ikaw ang nagmamarka pagkatapos',
};

console.log('BAWAT COLUMN NG JOURNAL, AT SAAN ITO GALING\n');
const missing = [];
[...new Set(journalKeys)].forEach(k => {
  let where, why = '';
  if(inForm.has(k)) where = 'FORM';
  else if(COMPUTED[k]){ where = 'kinukuwenta'; why = COMPUTED[k]; }
  else if(DRAWER_ONLY[k]){ where = 'drawer'; why = DRAWER_ONLY[k]; }
  else { where = 'WALA SAAN MAN'; missing.push(k); }
  console.log('  ' + k.padEnd(22) + where.padEnd(15) + why);
});
console.log('\n  (' + SPECS.length + ' na kahon sa form, ' +
            [...new Set(journalKeys)].length + ' na column sa journal)');
check('walang column na walang pinanggagalingan', missing.join(', ') || 'wala', 'wala');

console.log('\nANG MGA KAILANGAN AY NASA FORM BA?\n');
/* Ang tunay na tanong: kung nakuha mo ang isang card mula sa isang bagong prop
   firm, may kahon ba para sa bawat numerong nakikita mo doon? */
const FROM_A_BROKER_CARD = [
  'open_date','close_date','symbol','trade_type','account',
  'entry_price','close_price','tp_price','sl_price',
  'position_size','leverage','rr','win_loss','profit_loss','fee','pnl_percent',
];
const notInForm = FROM_A_BROKER_CARD.filter(k => !inForm.has(k));
notInForm.forEach(k => console.log('     nawawala: ' + k));
check('bawat bagay sa card ng broker ay may kahon',
  notInForm.join(', ') || 'kumpleto', 'kumpleto');

console.log('\nWALANG KAHON ANG KINUKUWENTA\n');
// Ang paglalagay ng kahon para sa isang bagay na kinukuwenta ay nagbibigay sa
// iyo ng dalawang sagot na maaaring hindi magkasundo, at ang mano-mano ang
// mananalo — kaya ang isang mali ay nagiging permanente.
const shouldNotBeThere = Object.keys(COMPUTED)
  .filter(k => inForm.has(k) && k !== 'pnl_percent');
check('walang kinukuwentang may kahon', shouldNotBeThere.join(', ') || 'wala', 'wala');

console.log('\nANG BAWAT KAHON AY MAY URI AT MAY PALIWANAG\n');
const noInput = SPECS.filter(s => !s.input);
const noGroup = SPECS.filter(s => !s.group);
const needPh  = SPECS.filter(s =>
  (s.input === 'text' || s.input === 'number' || s.input === 'account') && !s.ph);
check('bawat kahon ay may uri', noInput.map(s => s.key).join(', ') || 'lahat', 'lahat');
check('bawat kahon ay may grupo', noGroup.map(s => s.key).join(', ') || 'lahat', 'lahat');
check('bawat sinusulatan ay may halimbawa', needPh.map(s => s.key).join(', ') || 'lahat', 'lahat');

console.log('\n' + (fail ? fail + ' FAIL' : 'walang nakakalimutang column'));
process.exit(fail ? 1 : 0);
