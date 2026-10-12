const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang apat na pagbabago sa Trade Tags:
//   1. Palitan ang pangalan ng column
//   2. Gawing observation (hindi breach) ang dalawang BE tag
//   3. Idagdag ang "BE'd at Prev High/Low" — ang kabilang panig ng A/B test
//   4. Igrupo ang display sa limang tunay na rules (WALANG binabago sa listahan)
const fs = require('fs');
const PATH = __ROOT + '/js/dashboard.js';
const js = fs.readFileSync(PATH, 'utf8');
const CORE_JS = js;

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
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
// Hanggang sa ";" na nasa DULO ng linya — hindi basta unang ";". Ang _ruleTags
// ay may regex na /[,;]/ sa loob, at pinuputol siya ng naive na hanap.
function decl(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  const m = /;[ \t]*\r?\n/.exec(js.slice(i));
  if (!m) throw new Error('walang dulo: ' + name);
  return js.slice(i, i + m.index + 1);
}
// Para sa deklarasyong may block: bilangin ang brace, tapos abutin ang ";".
// Ang decl() ay pumuputol sa gitna ng _tagKind at _RULE_GROUP_OF dahil may ";"
// ang mga linya sa loob nila.
function declBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0, j = js.indexOf('{', i);
  for (; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) break; }
  }
  const end = js.indexOf(';', j);
  return js.slice(i, end + 1);
}

function oneLine(name){ const i=js.indexOf('const '+name); return js.slice(i, js.indexOf('\n', i)); }

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// ---- ang klasipikasyon, galing mismo sa file ----
// Ang buong klasipikasyon ay galing sa tag-core — isang lugar lang, kaya hindi
// na magkakahiwa-hiwalay ang mga sim kapag may naidagdag o natanggal.
const CORE = new Function(`
  ${require('./tag-core').SRC}
  ${grab('function _unfollowedOptionsFor(')}
  return { UNFOLLOWED_RULES_OPTIONS, TAG_OBSERVATIONS, RULE_GROUPS, _tagKind, _tagRetiredNote,
           _ruleGroupOf, _brokenRuleTags, _isCleanRules,
           _ruleTags, _unfollowedOptionsFor };
`)();

console.log('1. ANG PANGALAN NG COLUMN\n');
check('drawer field', /\{key:'unfollowed_rules', label:'Trade Tags', widget:'checklist'/.test(js), true);
check('column sa table', /\{key:'unfollowed_rules', label:'Trade Tags'\}/.test(js), true);
check('Options editor', /label:'Trade Tags \(checklist\)'/.test(js), true);
check('trade view modal', /<b>Trade Tags:<\/b>/.test(js), true);
check('walang natirang label na luma', /label:'Unfollowed Rules/.test(js), false);
check('hindi ginalaw ang DB column', /unfollowed_rules/.test(js), true);

console.log('\n2. ANG DALAWANG BE TAG — OBSERVATION NA\n');
console.log('   Uri ng bawat tag:');
const kinds = { breach:[], observation:[], sentinel:[] };
CORE.UNFOLLOWED_RULES_OPTIONS.forEach(t => kinds[CORE._tagKind(t)].push(t));
Object.entries(kinds).forEach(([k, list]) =>
  console.log('     ' + k.padEnd(12) + list.length + '  ' + list.join(' · ')));
check("Would Have BE'd Out", CORE._tagKind("Would Have BE'd Out"), 'observation');
check('No BE at Prev High/Low', CORE._tagKind('No BE at Prev High/Low'), 'observation');
// Retirado na ang "BE'd at Prev High/Low": ang Breakeven Report ay tumitimbang
// lamang ng mga trade kung saan HINDI mo ginalaw ang stop, kaya wala nang
// masasabi ang trade kung saan ginalaw mo na. Naka-TAG_RETIRED ito — hindi
// binura — kaya may babala pa rin ang lumang trade na may hawak nito.
check("BE'd at Prev High/Low ay retirado na",
  !!CORE._tagRetiredNote("BE'd at Prev High/Low"), true);
check("may tagubilin ang babala nito",
  /Post-BE Result already records/.test(CORE._tagRetiredNote("BE'd at Prev High/Low") || ""), true);
check('Rules Followed ay sentinel', CORE._tagKind('Rules Followed'), 'sentinel');
check('Moved Stop Loss ay breach pa rin', CORE._tagKind('Moved Stop Loss'), 'breach');
check('FOMO Entry ay breach pa rin', CORE._tagKind('FOMO Entry'), 'breach');
// Binago niya: ang idinagdag sa Options editor ay note ang default.
check('bagong option ay note ang default', CORE._tagKind('Kung Ano Man Bukas'), 'observation');
check('"TP area was just right" ay note', CORE._tagKind('TP area was just right'), 'observation');
check('13 breach', kinds.breach.length, 13);
// Nadagdagan ng "Stopped Out Then Hit TP" — observation din, hindi breach.
check('10 observation', kinds.observation.length, 10);

console.log('\n   Hindi na binibilang na kasalanan:');
check('walang breach tag', CORE._brokenRuleTags('No BE at Prev High/Low').length, 0);
check('malinis pa rin', CORE._isCleanRules('No BE at Prev High/Low'), true);
check("malinis din ang Would Have BE'd Out", CORE._isCleanRules("Would Have BE'd Out"), true);
check('pero hindi kapag may tunay na breach',
  CORE._isCleanRules('No BE at Prev High/Low, FOMO Entry'), false);
check('at ang breach ay naiisa-isa pa rin',
  CORE._brokenRuleTags('No BE at Prev High/Low, FOMO Entry').join(','), 'FOMO Entry');
check('blangko ay hindi malinis — hindi naka-log', CORE._isCleanRules(''), false);

console.log('\n   Sa checklist ng drawer:');
const yes = CORE._unfollowedOptionsFor('Yes');
const no  = CORE._unfollowedOptionsFor('No');
console.log('     Rules Followed = Yes -> ' + yes.join(' · '));
check('lumalabas ang observation sa Yes', yes.includes('No BE at Prev High/Low'), true);
check('lumalabas din sa No', no.includes('No BE at Prev High/Low'), true);
check('may breach na rin sa Yes — buo ang listahan', yes.some(o => CORE._tagKind(o) === 'breach'), true);
check('may sentinel din sa No', no.includes('Rules Followed'), true);
check('may breach sa No', no.includes('Moved Stop Loss'), true);
check('lahat lumalabas kapag walang sagot',
  CORE._unfollowedOptionsFor('').length, CORE.UNFOLLOWED_RULES_OPTIONS.length);

console.log('\n3. ANG BAGONG TAG\n');
check('wala na sa listahan', CORE.UNFOLLOWED_RULES_OPTIONS.includes("BE'd at Prev High/Low"), false);
check('23 -> 24 na option', CORE.UNFOLLOWED_RULES_OPTIONS.length, 24);
// Walang TAHIMIK na nawala: bawat orihinal na tag ay nasa listahan pa rin, o
// may kapalit sa TAG_ALIASES, o sinadyang tinanggal dahil may ibang column na
// nagtatala nito. Walang pangatlong posibilidad.
const ORIGINAL = ['Rules Followed',"Would Have BE'd Out",'Early TP','Entered Early','Overleveraged',
  'No Confirmation','Moved Stop Loss','Revenge Trade','Ignored Trend',
  'Against Daily Bias / HTF Bias','FOMO Entry','No BE at Prev High/Low',
  'Ignored No-Trade Decision','Non-BnB Setup','No Scalping Trade','Moved Take Profit',
  'Lack of Confluence','BTC Only','Changing Plan','No Cutloss 3mins Breakout'];
const ALIAS_SRC = CORE_JS.slice(CORE_JS.indexOf('const TAG_ALIASES'),
  CORE_JS.indexOf('};', CORE_JS.indexOf('const TAG_ALIASES')) + 2);
const ALIASES = new Function(ALIAS_SRC + ' return TAG_ALIASES;')();
const RETIRED = new Function(declBlock('TAG_RETIRED') + ' return TAG_RETIRED;')();
const lost = ORIGINAL.filter(t => {
  if(CORE.UNFOLLOWED_RULES_OPTIONS.includes(t)) return false;          // nandoon pa
  const k = t.toLowerCase();
  if(Object.prototype.hasOwnProperty.call(ALIASES, k)) return false;   // may kapalit
  return !Object.prototype.hasOwnProperty.call(RETIRED, k);            // o retired
});
check('walang tahimik na nawala', lost.join(', ') || '(wala)', '(wala)');
console.log('   Isinanib o tinanggal: ' +
  Object.entries(ALIASES).map(([k,v]) => k + ' -> ' + (v || 'exit_type')).join(' · '));
check('bawat alias ay tumuturo sa buhay na tag',
  Object.values(ALIASES).filter(Boolean)
    .every(v => CORE.UNFOLLOWED_RULES_OPTIONS.includes(v)), true);

console.log('\n4. ANG PAGGRUPO — DISPLAY LANG\n');
console.log('   Limang rule:');
CORE.RULE_GROUPS.forEach(g => console.log('     ' + g.name.padEnd(36) + g.tags.length + ' tag'));
const grouped = CORE.RULE_GROUPS.flatMap(g => g.tags);
check('lahat ng 12 breach ay may grupo',
  kinds.breach.every(t => grouped.includes(t)), true);
check('walang observation sa mga grupo',
  grouped.some(t => CORE._tagKind(t) === 'observation'), false);
check('walang tag na dalawang beses', new Set(grouped).size, grouped.length);
check('tatlo ang confluence group', CORE.RULE_GROUPS[0].tags.length, 3);
check('mapa: Lack of Confluence -> rule 1',
  CORE._ruleGroupOf('Lack of Confluence'), 'Follow the confluence checklist');
// Ang 'No Confirmation' ay naging 'Entered Without Confirmation', at OBSERVATION
// na siya — kaya wala nang breach group; sariling pangalan ang lumalabas.
check('mapa: lumang No Confirmation -> sariling pangalan',
  CORE._ruleGroupOf('No Confirmation'), 'Entered Without Confirmation');
check('tag na walang grupo ay nananatiling sarili',
  CORE._ruleGroupOf('Kung Ano Man Bukas'), 'Kung Ano Man Bukas');

console.log('\n   HINDI nagbabago ang tinitick mo:');
check('buo pa rin ang checklist ng drawer',
  CORE._unfollowedOptionsFor('No').filter(o => CORE._tagKind(o) === 'breach').length, 13);
check('isa-isa pa rin, hindi grupo',
  CORE._unfollowedOptionsFor('No').includes('Lack of Confluence'), true);
check('walang group name sa checklist',
  CORE._unfollowedOptionsFor('No').includes('Follow the confluence checklist'), false);

// ---- Edge Map ----

// Ang mga seksyong sumusubok sa Edge Map ay tinanggal — pinalitan na siya ng
// dalawang panel (Discipline & Experiments, Pattern/Session/Confluence), at
// sinusubok sila ng sim-panels.js. Ang klasipikasyon ng tag ang natitira dito.

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);