// Ang checklist ng Trade Tags sa drawer.
//
// DATI: itinatago nito ang kalahati depende sa Rules Followed?. May katuturan
// 'yon noong ITINATANONG pa ang sagot — pindutin ang "Yes" at wala nang saysay
// ang mga breach. Pero DERIVED na siya ngayon: ang mga tag ang GUMAGAWA ng
// sagot. Baliktad ang causality, at itinatago nito ang mismong option na
// magtatakda niyon — kaya hindi na masabi ng trade kung ano talaga ang nangyari.
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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const optsFor = new Function('UNFOLLOWED_RULES_OPTIONS',
  grab('function _unfollowedOptionsFor(') + ' return _unfollowedOptionsFor;'
)(A.UNFOLLOWED_RULES_OPTIONS);

const ALL = A.UNFOLLOWED_RULES_OPTIONS.length;
console.log('Kabuuang options: ' + ALL + '\n');

console.log('1. BUO ANG LISTAHAN, ANUMAN ANG SAGOT\n');
['Yes','No','',null].forEach(v => {
  const o = optsFor(v);
  const ok = o.length === ALL;
  if(!ok) fail++;
  console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + ('Rules Followed = ' + (v || '(blangko)')).padEnd(30) +
    o.length + ' option');
});

console.log('\n   Ang eksaktong reklamo mo:');
check('makikita ang "Entered Without Confirmation" sa Yes',
  optsFor('Yes').includes('Entered Without Confirmation'), true);
check('makikita rin ang FOMO Entry sa Yes', optsFor('Yes').includes('FOMO Entry'), true);
check('nandoon pa rin ang "Rules Followed" sa No',
  optsFor('No').includes('Rules Followed'), true);
check('nandoon ang lahat ng observation',
  A.TAG_OBSERVATIONS.every(t => optsFor('Yes').includes(t)), true);

console.log('\n2. HINDI NAWAWALA ANG LUMANG HALAGA\n');
// Ang naka-tick na wala na sa listahan ay dapat manatiling nakikita — ang
// nakatagong checkbox ay nabubura sa pag-save.
const legacy = optsFor('Yes', ['Ego Hold Despite Invalidation']);
check('nadagdag ang retiradong tag', legacy.includes('Ego Hold Despite Invalidation'), true);
check('isang beses lang', legacy.filter(o => o === 'Ego Hold Despite Invalidation').length, 1);
check('hindi nadodoble ang nasa listahan na',
  optsFor('Yes', ['FOMO Entry']).length, ALL);

console.log('\n3. WALA NANG PAG-REFILTER\n');
check('wala nang syncUnfollowedRulesFromFollowed', /syncUnfollowedRulesFromFollowed/.test(js), false);
check('wala nang onchange sa rules_followed na select',
  /f\.key === 'rules_followed' \? ` onchange/.test(js), false);

console.log('\n4. TINUTULUNGAN, HINDI KINUKUHANAN NG KONTROL\n');
// Sinulat ko itong naka-lock noon at HINDI naman 'yon hiningi. Ang hiningi ay
// ang lohika kung kailan "No", hindi ang tanggalan siya ng kakayahang baguhin.
check('editable pa rin', /\{key:'rules_followed'[^}]*editable:true/.test(js), true);
check('walang locked na static', /id="drawerRulesFollowed"/.test(js), false);
check('may live na tulong', /_refreshDerivedRulesFollowed/.test(js), true);
check('naka-kabit sa checklist',
  /onchange="_refreshDerivedRulesFollowed\(\)"/.test(js), true);
check('inililipat ang select, hindi ang static',
  /sel\.value = v;/.test(js), true);
check('hindi pinapatungan ng save ang sagot mo',
  /if\(!patch\.rules_followed\)\{/.test(js), true);

console.log('\n5. ANG LIVE NA PAG-UPDATE\n');
// Ginagaya ang drawer: mga checkbox at ang select.
function drawer(ticked, score, startValue){
  const el = { value: startValue || '' };
  const boxes = ticked.map(v => ({ value:v }));
  const scope = {
    document: {
      querySelector: s => /rules_followed/.test(s) ? el : null,
      querySelectorAll: () => boxes,
    },
    _drawerRow: { _score: score },
    _deriveRulesFollowed: new Function('_brokenRuleTags','_ruleTags','_confluenceScoreFor',
      'DEFAULT_MIN_CONFLUENCE_PCT',
      grab('function _deriveRulesFollowed(') + ' return _deriveRulesFollowed;'
    )(A._brokenRuleTags, A._ruleTags, t => t._score, 60),
  };
  new Function(...Object.keys(scope),
    grab('function _refreshDerivedRulesFollowed(') + ' _refreshDerivedRulesFollowed();'
  )(...Object.values(scope));
  return { text: el.value, cls: '' };
}
let d = drawer(['Rules Followed'], 1.0);
check('malinis -> Yes', d.text, 'Yes');

d = drawer(['Rules Followed','FOMO Entry'], 1.0);
check('tinick ang FOMO -> No agad', d.text, 'No');

d = drawer(['Rules Followed','Held Through Invalidation'], 1.0);
check('observation -> Yes pa rin', d.text, 'Yes');
d = drawer(['Rules Followed'], 0.4);
check('mababang confluence -> No', d.text, 'No');
d = drawer([], null);
check('walang tick, walang checklist -> hindi ginagalaw', d.text, '');
d = drawer(['Rules Followed','FOMO Entry'], 1.0, 'Yes');
check('pinapalitan ang mali habang tinitick', d.text, 'No');
d = drawer([], null, 'Yes');
check('walang mahuhugutan -> iniiwan ang pinili mo', d.text, 'Yes');

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
