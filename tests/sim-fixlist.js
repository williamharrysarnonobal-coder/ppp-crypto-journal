// "Ma-check mo ba lahat ng data ko?"
//
// Hindi ko mababasa ang database, kaya ito ang sagot: ang app na mismo ang
// sumasagot. Ang bilang na "N invalid" ay nandoon na dati pero WALANG sinasabi
// kung ano ang N — kaya isa-isang binubuksan ang trades para malaman. Ngayon
// may buod na, at nakaka-click para makita agad.
const core = require('./tag-core');
const js = core.js;
const A = core.API;

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
const objBlock = n => {
  const i = js.indexOf('const ' + n);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
};

const ACCOUNTS = [{ account_name:'Upscale Trade 5K', account_size:5000 }];
const FIELDS = ['symbol','open_date','close_date','win_loss','profit_loss','account','session',
  'trade_type','trade_setup','pattern_type','execution_tf','aof_phase','rules_followed',
  'exit_type','unfollowed_rules','post_be_result','post_cutloss_result']
  .map(k => ({ key:k, label:k.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()) }));

const API = new Function('TRADING_ACCOUNTS','FIELD_OPTIONS','CONFLUENCE_SETUPS',
  'DRAWER_FIELDS','ALL_DRAWER_FIELDS','_staleConfluenceItems','_confluenceScoreFor','DEFAULT_MIN_CONFLUENCE_PCT','computeSession','computeDayOfWeek', `
  ${core.SRC}
  ${core.arrBlock('JOURNAL_REQUIRED_KEYS')}
  ${core.arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab('const _isBlankish')}
  ${grab('const _postBEApplies')}
  ${grab('const _num =')};
  ${grab('function normalizeTrade(')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  ${grab('function _journalMissingFields(')}
  ${grab('function _journalBlankSummary(')}
  ${grab('function _journalInvalidSummary(')}
  return { normalizeTrade, _journalBlankSummary, _journalInvalidSummary,
           _journalMissingFields, _journalInvalidFields };
`)(ACCOUNTS, new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')(),
   {}, FIELDS, FIELDS, () => [], () => null, 60, () => 'London', () => 'Monday');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const GOOD = {
  symbol:'BTC/USD', open_date:'2026-08-10T09:00:00Z', close_date:'2026-08-10T11:00:00Z',
  win_loss:'Win', profit_loss:250, account:'Upscale Trade 5K', session:'London',
  trade_type:'Long', trade_setup:'Bounce Play', pattern_type:'15 mins HL',
  execution_tf:'5 min', aof_phase:'IC', rules_followed:'Yes',
  unfollowed_rules:'Rules Followed', exit_type:'TP Hit',
  post_be_result:'N/A', post_cutloss_result:'N/A',
};
const mk = o => API.normalizeTrade({ ...GOOD, ...o });

// Isang journal na may bawat klase ng sirang naiwan ng mga pagbabago natin.
const JOURNAL = [
  ...Array.from({length:20}, () => mk({})),                                  // malinis
  mk({ rules_followed:'No', unfollowed_rules:'Ignored Trend' }),             // retired
  mk({ rules_followed:'No', unfollowed_rules:'Ignored Trend' }),
  mk({ rules_followed:'No', unfollowed_rules:'Early TP' }),                  // retired
  mk({ rules_followed:'No', unfollowed_rules:'No Scalping Trade' }),         // retired
  mk({ rules_followed:'No', unfollowed_rules:'No BE at Prev High/Low' }),    // No pero walang breach
  mk({ aof_phase:'' }),                                                      // blangko
  mk({ aof_phase:'' }),
  mk({ aof_phase:'' }),
  mk({ exit_type:'Cut Loss', post_cutloss_result:'' }),                      // hindi sinagot
  mk({ win_loss:'Breakeven', exit_type:'BE Hit', post_be_result:'', profit_loss:0 }),
  mk({ account:'Ibang Broker' }),                                            // di-kilala
];

console.log('ANG BUONG JOURNAL: ' + JOURNAL.length + ' trades\n');
const incomplete = JOURNAL.filter(r => API._journalMissingFields(r).length).length;
const invalid = JOURNAL.filter(r => API._journalInvalidFields(r).length).length;
console.log('   ' + incomplete + ' incomplete · ' + invalid + ' to fix\n');

console.log('ANO ANG KULANG — buod:\n');
API._journalBlankSummary(JOURNAL).forEach(([l,n]) => console.log('   ' + String(n).padStart(3) + '  ' + l));
console.log('\nANO ANG DAPAT AYUSIN — buod:\n');
const inv = API._journalInvalidSummary(JOURNAL);
inv.forEach(([l,n]) => console.log('   ' + String(n).padStart(3) + '  ' +
  (l.length > 88 ? l.slice(0,88) + '…' : l)));

console.log();
check('may buod ng kulang', API._journalBlankSummary(JOURNAL).length > 0, true);
check('may buod ng dapat ayusin', inv.length > 0, true);
check('naka-sort pababa', inv.every((x,i) => i===0 || inv[i-1][1] >= x[1]), true);

console.log('\nNahahati ba nang tama ang mga problema?\n');
const find = re => inv.find(([l]) => re.test(l));
check('pinagsama ang 2 Ignored Trend', (find(/Ignored Trend/)||[])[1], 2);
check('hiwalay ang Early TP', !!find(/Early TP/), true);
check('hiwalay ang No Scalping Trade', !!find(/No Scalping/), true);
// Ang mahabang mensahe ay isinasama sa key, kaya "Rules Followed?: ..." —
// mas mabuti 'yon: nakikita agad ang dahilan nang hindi na kailangang buksan.
// Tinanggal na ang tsek sa Rules Followed? — sa kanya ang field, at hindi
// kayang ipagkaiba ng journal ang sinadyang sagot sa lumang halaga.
check('wala nang linya para sa Rules Followed?', !!find(/^Rules Followed\?:/), false);
check('may sariling linya ang Account', !!find(/^Account:/), true);
// case-insensitive: ang label dito ay gawa-gawa ng fixture ("Aof Phase"),
// samantalang "AOF Phase" ang tunay na nasa ALL_DRAWER_FIELDS.
check('nagbibilang ang blangkong AOF Phase',
  (API._journalBlankSummary(JOURNAL).find(([l]) => /aof/i.test(l))||[])[1], 3);

console.log('\nMay tagubilin ba ang bawat linya?\n');
inv.forEach(([l]) => {
  const actionable = /untick|Exit Type|pick |no account by that name|broken rule|any more|never reached/.test(l) ||
                     /^(Rules Followed\?|Account)$/.test(l);
  if(!actionable) fail++;
  console.log('   ' + (actionable ? 'ok   ' : 'FAIL ') + (l.length > 76 ? l.slice(0,76) + '…' : l));
});

console.log('\nAng malinis na journal ay tahimik:\n');
const CLEAN = Array.from({length:12}, () => mk({}));
check('walang kulang', API._journalBlankSummary(CLEAN).length, 0);
check('walang dapat ayusin', API._journalInvalidSummary(CLEAN).length, 0);

console.log('\nNakaka-click ba?\n');
check('may onclick ang bilang', /toggleJournalInvalidOnly\(\)/.test(js), true);
check('may filter', /if\(JOURNAL_INVALID_ONLY\) rows = rows\.filter/.test(js), true);
check('nabubura ng Clear', /JOURNAL_INVALID_ONLY = false;/.test(js), true);
check('may "to fix" na label', /\$\{invalid\} to fix/.test(js), true);
check('may buod sa tooltip', /_journalInvalidSummary\(rows\)/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
