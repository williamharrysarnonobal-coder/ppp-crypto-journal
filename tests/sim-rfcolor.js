const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// 1. Ang apat na kulay ng Rules Followed?
// 2. Ang Chased Extended Move / Traded Into Key Level ay observation na.
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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// Ang sangay ng _journalColoredCell para sa rules_followed, hinugot at pinatakbo.
const i = js.indexOf("if(key === 'rules_followed'){");
const branch = (() => { let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++; else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  } })();
const _TAG_ADVERSE_SET = new Function(
  (() => { const m = /const TAG_ADVERSE\s*=\s*\[/.exec(js); let d = 0;
    for (let j = m.index + m[0].length - 1; j < js.length; j++) {
      if (js[j] === '[') d++; else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; } } })()
  + ' return new Set(TAG_ADVERSE.map(s => s.toLowerCase()));')();

const colorFor = new Function('key','row','v','lower','_box','_canonicalTags','_tagKind','_TAG_ADVERSE_SET',
  branch + " return null;");

const box = (cls) => cls;
const color = (answer, tags) => colorFor('rules_followed',
  { unfollowed_rules: tags }, answer, String(answer||'').toLowerCase(),
  box, A._canonicalTags, A._tagKind, _TAG_ADVERSE_SET);

console.log('ANG APAT NA KULAY\n');
/* KAHEL = may naka-tag na HINDI umubra. GREEN = naka-tick ang "Rules Followed"
   at wala sa anim na kahel. BLUE = may naitala pero walang masamang hatol.

   Ang kahel ay nangunguna sa berde: kung tinsek mo ang malinis at may naka-tag
   pa ring hindi umubra, ang huli ang bagong balita. Isang kulay lang ito noon
   para sa dalawang magkaibang bagay. */
/* Simple na, ayon sa kanya: Yes = berde, No = pula — anuman ang tag. */
const cases = [
  ['Yes', 'Rules Followed',                          'box-solid-win',  'GREEN'],
  ['Yes', 'Rules Followed, Chased Extended Move',    'box-solid-win',  'GREEN'],
  ['Yes', '',                                        'box-solid-win',  'GREEN'],
  ['Yes', 'No BE at Prev High/Low',                  'box-solid-win',  'GREEN'],
  ['Yes', 'FOMO Entry',                              'box-solid-win',  'GREEN'],
  ['No',  'FOMO Entry',                              'box-solid-loss', 'RED'],
  ['No',  'Rules Followed',                          'box-solid-loss', 'RED'],
  ['No',  '',                                        'box-solid-loss', 'RED'],
  ['Maybe','',                                       null,             'walang kulay'],
];
cases.forEach(([ans, tags, want, note]) => {
  const got = color(ans, tags);
  const ok = got === want;
  if(!ok) fail++;
  console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + (ans + ' · ' + (tags || '(wala)')).padEnd(42) + note +
    (ok ? '' : '   <-- ' + want + ', nakuha: ' + got));
});
check('walang halaga -> walang kulay', color('', ''), 'null');
/* Ang "Entered Early" ay nagiging "Entered Without Confirmation" sa
   TAG_ALIASES, at kahel iyon — kaya ang lumang alyas ay nakakakuha rin ng
   bagong kulay, na siya namang dapat. */
check('Yes ay berde kahit lumang alyas',
  color('Yes', 'Entered Early'), 'box-solid-win');
check('Yes ay berde kahit walang sentinel',
  color('Yes', 'Revenge Trade'), 'box-solid-win');
check('gitling -> walang kulay', color('—', ''), 'null');

console.log('\n   Ang CSS:');
const css = require('fs').readFileSync(__ROOT + '/css/style.css','utf8');
/* Bumalik ang amber, at may gumagamit na ngayon: ang anim na tag na sinabi
   niyang kahel. Inalis ito noon dahil walang gumagamit — hindi dahil mali. */
check('may .box-solid-warn na', /\.box-solid-warn\{/.test(css), true);
check('.box-solid-info ay meron', /\.box-solid-info\{/.test(css), true);
check('.box-solid-win ay meron', /\.box-solid-win\{/.test(css), true);
check('.box-solid-loss ay meron', /\.box-solid-loss\{/.test(css), true);

console.log('\nANG DALAWANG TAG — OBSERVATION NA\n');
['Chased Extended Move','Traded Into Key Level'].forEach(t => {
  check(t, A._tagKind(t), 'observation');
});
check('hindi na nagpapa-No', A._brokenRuleTags('Chased Extended Move').length, 0);
const derive = new Function('_brokenRuleTags','_ruleTags','_confluenceScoreFor',
  'DEFAULT_MIN_CONFLUENCE_PCT',
  grab('function _deriveRulesFollowed(') + ' return _deriveRulesFollowed;'
)(A._brokenRuleTags, A._ruleTags, () => 1.0, 60);
check('mataas ang confluence + Chased -> Yes',
  derive({ unfollowed_rules:'Rules Followed, Chased Extended Move' }), 'Yes');
check('kasama ang breach -> No pa rin',
  derive({ unfollowed_rules:'Chased Extended Move, FOMO Entry' }), 'No');

console.log('\n   Nasa "Others" na sa hover, hindi sa "Unfollowed Rules":');
const tags = A._canonicalTags('Chased Extended Move, FOMO Entry');
check('breach lang', tags.filter(t => A._tagKind(t) === 'breach').join(','), 'FOMO Entry');
check('observation', tags.filter(t => A._tagKind(t) !== 'breach').join(','), 'Chased Extended Move');

console.log('\nANG MGA GRUPO PAGKATAPOS\n');
A.RULE_GROUPS.forEach(g => console.log('   ' + g.name.padEnd(36) + g.tags.length + ' tag'));
const grouped = A.RULE_GROUPS.flatMap(g => g.tags);
const breaches = A.UNFOLLOWED_RULES_OPTIONS.filter(t => A._tagKind(t) === 'breach');
check('13 breach na lang', breaches.length, 13);
// Sampu na — nadagdagan ng "Stopped Out Then Hit TP", na observation din:
// nangyayari ito kapag TAMA ka sa direksyon at masyadong malapit ang stop.
check('10 observation', A.UNFOLLOWED_RULES_OPTIONS.filter(t => A._tagKind(t)==='observation').length, 10);
check('wala nang "Read where the move already is"',
  A.RULE_GROUPS.some(g => g.name === 'Read where the move already is'), false);
check('bawat breach ay may grupo', breaches.every(t => grouped.includes(t)), true);
check('walang grupo na tumutukoy sa observation',
  grouped.some(t => A._tagKind(t) !== 'breach'), false);
check('ang lumang "Ignored Trend" ay binibilang pa rin',
  A._brokenRuleTags('Ignored Trend').length, 1);
check('   at may sariling pangalan sa card',
  A._ruleGroupOf('Ignored Trend'), 'Ignored Trend');

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
