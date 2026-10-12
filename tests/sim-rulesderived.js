// Rules Followed? ay hindi na hatol — konsekwensya na siya, kaya kinukwenta
// na lang ng journal imbes na itanong.
//
//   "No"  kung  confluence < 60%   O   may breach tag
//   "Yes" kung  wala sa dalawa
//   null  kung  walang tags AT walang checklist — walang mahuhugutan
//
// Ang observations ay HINDI kailanman nagpapa-No. Ang "hindi ako nag-BE sa
// prev high/low" ay desisyong sinusubukan pa, hindi patakarang nasira — at
// ang paghila nito pa-No ang dahilan kung bakit gumagalaw ang discipline rate
// kasabay ng swerte.
const core = require('./tag-core');
const A = core.API;
const js = core.js;

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// Isang tunay na checklist ang ginagamit para totoo ang score.
const CS = new Function(js.slice(js.indexOf('const CONFLUENCE_SETUPS'),
  (() => { const i = js.indexOf('const CONFLUENCE_SETUPS'); let d=0;
    for(let j=js.indexOf('{',i); j<js.length; j++){ if(js[j]==='{')d++;
      else if(js[j]==='}'){d--; if(!d) return j+1;} } })()) +
  '; return CONFLUENCE_SETUPS;')();
const KEY = 'Long|15 mins HL';
const ITEMS = CS[KEY].items;
const BAR = Number(/DEFAULT_MIN_CONFLUENCE_PCT = (\d+)/.exec(js)[1]);
console.log('Ang bar: ' + BAR + '%   ·   checklist: ' + ITEMS.length + ' item\n');

const derive = new Function('_brokenRuleTags','_ruleTags','_confluenceScoreFor',
  'DEFAULT_MIN_CONFLUENCE_PCT',
  grab('function _deriveRulesFollowed(') + ' return _deriveRulesFollowed;');

// Ginagaya ang score nang diretso para malinaw ang pagsubok.
const mk = (score, tags) => ({ unfollowed_rules: tags || '', _score: score });
const D = derive(A._brokenRuleTags, A._ruleTags, t => t._score, BAR);

console.log('1. ANG CONFLUENCE SCORE\n');
check('100% -> Yes', D(mk(1.0, 'Rules Followed')), 'Yes');
check('60% (nasa bar mismo) -> Yes', D(mk(0.60, 'Rules Followed')), 'Yes');
check('59% -> No', D(mk(0.59, 'Rules Followed')), 'No');
check('30% -> No', D(mk(0.30, 'Rules Followed')), 'No');
check('walang checklist, may tag -> Yes', D(mk(null, 'Rules Followed')), 'Yes');

console.log('\n2. ANG MGA BREACH TAG\n');
check('FOMO Entry -> No kahit 100% confluence', D(mk(1.0, 'FOMO Entry')), 'No');
check('Revenge Trade -> No', D(mk(1.0, 'Revenge Trade')), 'No');
check('Moved Stop Loss -> No', D(mk(1.0, 'Moved Stop Loss')), 'No');
check('breach + mababang score -> No pa rin', D(mk(0.2, 'FOMO Entry')), 'No');

console.log('\n3. ANG MGA OBSERVATION — HINDI DAPAT MAGPA-No\n');
A.TAG_OBSERVATIONS.forEach(t => {
  check(t, D(mk(1.0, 'Rules Followed, ' + t)), 'Yes');
});
check('observation lang, walang sentinel', D(mk(1.0, 'No BE at Prev High/Low')), 'Yes');
check('observation + breach -> No', D(mk(1.0, 'No BE at Prev High/Low, FOMO Entry')), 'No');
check('observation + mababang score -> No',
  D(mk(0.4, 'Held Through Invalidation')), 'No');

console.log('\n4. WALANG MAHUHUGUTAN -> HINDI GINAGALAW\n');
check('walang tag, walang checklist', D(mk(null, '')), 'null');
check('   -> hindi ipinapalagay na malinis', D(mk(null, '')) === 'Yes', false);

console.log('\n5. NAKAKABIT BA SA SAVE?\n');
check('tinatawag ng _collectDrawerPatch',
  /const rf = _deriveRulesFollowed\(patch\);/.test(js), true);
check('nasa dulo, matapos ang tags at exit type',
  js.indexOf('_deriveRulesFollowed(patch)') > js.indexOf('_applyMovedStopFlags(patch)'), true);
check('hindi nagtatakda kapag null', /if\(rf\) patch\.rules_followed = rf;/.test(js), true);

console.log('\n6. WALA NANG BABALA TUNGKOL SA SAGOT MO\n');
// Ang tsek na ito ay tinanggal: ang field ay sa kanya, at hindi kayang
// ipagkaiba ng journal ang sinadyang sagot sa lumang halaga. Ang pagbabala sa
// pareho ay ginagawang walang saysay ang override, at inililibing ang mga
// babalang TUNAY na may sira sa ilalim ng mga judgement call na desidido na.
check('wala nang "should be" na babala', /but should be \$\{want\}/.test(js), false);
// Sa loob LANG ng _journalInvalidFields — ang mismong pangalan ay nasa
// OPTIONS_FIELD_META at ALL_JOURNAL_COLUMNS pa rin, at tama lang 'yon.
check('wala nang push ng rules_followed sa validation',
  /bad\.push\(\{\s*key:'rules_followed'/.test(js), false);
check('may paliwanag kung bakit tinanggal',
  /deliberately NO check that Rules Followed\? matches/.test(js), true);

console.log('   Pero buhay pa ang ibang babala:');
const invalid2 = new Function('FIELD_OPTIONS','ALL_DRAWER_FIELDS','CONFLUENCE_SETUPS',
  'TRADING_ACCOUNTS','_staleConfluenceItems','_postBEApplies','_confluenceScoreFor',
  'DEFAULT_MIN_CONFLUENCE_PCT', `
  ${core.SRC}
  ${core.arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab('const _isBlankish')}
  ${grab('function _journalInvalidFields(')}
  return _journalInvalidFields;
`)(new Function(js.slice(js.indexOf('const FIELD_OPTIONS'), js.indexOf('\n};', js.indexOf('const FIELD_OPTIONS'))+3) + ' return FIELD_OPTIONS;')(),
   [{key:'unfollowed_rules',label:'Trade Tags'},{key:'win_loss',label:'Win/Loss'},
    {key:'post_be_result',label:'Post-BE Result'},{key:'account',label:'Account'}],
   {}, [{account_name:'Real'}], () => [], () => false, () => 0.4, 60);
const w2 = r => invalid2(r).map(b => b.label + ': ' + b.value);
const cases2 = [
  ['retiradong tag', { unfollowed_rules:'Early TP' }],
  ['di-kilalang tag', { unfollowed_rules:'Ghost Rule' }],
  ['magkasalungat na pares', { unfollowed_rules:'Held Through Invalidation, Cut on Invalidation' }],
  ['Post-BE sa maling trade', { win_loss:'Win', exit_type:'TP Hit', post_be_result:'TP After BE' }],
  ['account na wala', { account:'Wala Ito' }],
];
cases2.forEach(([label, row]) => {
  const got = w2(row);
  if(!got.length) fail++;
  console.log('   ' + (got.length ? 'ok   ' : 'FAIL ') + label.padEnd(26) + '-> ' +
    ((got[0]||'(WALANG BABALA)').slice(0,64)));
});
check('malinis na trade -> tahimik',
  w2({ rules_followed:'Yes', unfollowed_rules:'Rules Followed', account:'Real' }).length, 0);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);