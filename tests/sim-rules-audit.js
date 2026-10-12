const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Every place unfollowed_rules is read, and what each one does with an option
// the DEFAULT list has never heard of (one he added in the Options editor).
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function arrowConst(n){ const i = js.indexOf('const '+n+' ='); return js.slice(i, js.indexOf('\n', js.indexOf(';', i))); }
function blockConst(n){ const i = js.indexOf('const '+n+' ='); return js.slice(i, js.indexOf('};', i)+2); }
function grab(m){
  const i = js.indexOf(m); let d=0;
  for(let j=js.indexOf('{',i); j<js.length; j++){ if(js[j]==='{')d++; else if(js[j]==='}'){d--; if(!d) return js.slice(i,j+1);} }
}

const API = new Function(`
  ${require('./tag-core').SRC}
  ${grab('function _unfollowedOptionsFor(')}
  return { UNFOLLOWED_RULES_OPTIONS, _tagKind, _ruleTags,
           _brokenRuleTags, _isCleanRules, _unfollowedOptionsFor };
`)();

// loadOptionsConfig MERGES a saved list with the defaults, so an option added
// in the Options editor lives in this array at runtime. Simulate that.
// Dating 'Ego Hold Despite Invalidation' — pero naka-alias na 'yon ngayon sa
// 'Held Through Invalidation' na OBSERVATION, kaya hindi na siya breach.
// Kailangan dito ng tunay na di-kilalang tag.
const ADDED = 'Sinundan Ko Ang Kutob Ko';
if(!API.UNFOLLOWED_RULES_OPTIONS.includes(ADDED)) API.UNFOLLOWED_RULES_OPTIONS.push(ADDED);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

console.log('Buong listahan (' + API.UNFOLLOWED_RULES_OPTIONS.length + '):');
API.UNFOLLOWED_RULES_OPTIONS.forEach(o => {
  const pos = API._tagKind(o) !== 'breach';
  console.log('   ' + (pos ? '[malinis] ' : '[breach ] ') + o);
});

console.log('\nAng dalawang tinanong mo:');
check("Would Have BE'd Out ay MALINIS", API._isCleanRules("Would Have BE'd Out"), true);
check("Would Have BE'd Out ay hindi breach", API._brokenRuleTags("Would Have BE'd Out").length, 0);
// Binago niya: ang tag na IDINAGDAG niya ay note, hindi rule.
check('idinagdag na tag ay HINDI breach (note)', API._brokenRuleTags(ADDED).length, 0);
check('idinagdag na tag ay malinis', API._isCleanRules(ADDED), true);
check('built-in na rule ay breach pa rin', API._brokenRuleTags('Revenge Trade').length, 1);

console.log('\nHalo-halo:');
const mix = "Rules Followed, Would Have BE'd Out";
check('dalawang sentinel = malinis', API._isCleanRules(mix), true);
const mix2 = `Would Have BE'd Out, ${ADDED}`;
check('observation + idinagdag = malinis', API._isCleanRules(mix2), true);
const mix3 = `${ADDED}, FOMO Entry`;
check('idinagdag + rule -> ang rule lang ang breach', API._brokenRuleTags(mix3).join('|'), 'FOMO Entry');

console.log('\nAling kalahati ang kinabibilangan sa checklist:');
const yes = API._unfollowedOptionsFor('Yes'), no = API._unfollowedOptionsFor('No');
check('Ego Hold nasa No half', no.includes(ADDED), true);
check('Ego Hold nasa Yes half din — buo na ang listahan', yes.includes(ADDED), true);
check("Would Have BE'd Out nasa Yes half", yes.includes("Would Have BE'd Out"), true);
// HINDI na mahigpit na hati. Ang observations ay lumalabas sa MAGKABILANG
// panig — 'yon mismo ang punto ng pagbukod sa kanila: totoo ang "hindi ako
// nag-BE sa prev high/low" sa disiplinadong trade at sa maluwag na trade.
// Ang mahalaga: walang option na nawawala sa dalawa.
// Wala nang hati. Ang Rules Followed? ay DERIVED na mula sa mga tag, kaya ang
// pag-filter ng tag base sa sagot ay may baliktad na causality — itinatago nito
// ang mismong option na magtatakda niyon. Buo na ang listahan sa magkabila.
const seen = new Set([...yes, ...no].map(s => s.toLowerCase()));
check('walang option na nawawala', seen.size, API.UNFOLLOWED_RULES_OPTIONS.length);
check('pareho ang dalawang panig', yes.join('|'), no.join('|'));
check('buo ang dalawa', yes.length, API.UNFOLLOWED_RULES_OPTIONS.length);

console.log('\nAng mga dashboard na bumabasa nito:');
// The five call sites, each reduced to the predicate it actually uses.
const SITES = [
  ['Discipline % (KPI)',            v => API._isCleanRules(v) ? 'malinis' : (API._brokenRuleTags(v).length ? 'sira' : 'blangko')],
  ['Rules broken drill',            v => API._brokenRuleTags(v).length > 0 ? 'kasama' : 'hindi'],
  ['Cost per broken rule',          v => API._brokenRuleTags(v).join(', ') || '(wala)'],
  ['Account comparison Rules kept', v => API._isCleanRules(v) ? 'binibilang' : 'hindi'],
  ['Breakdown > Discipline',        v => API._brokenRuleTags(v).length > 0 ? 'sira' : (API._isCleanRules(v) ? 'malinis' : 'blangko')],
];
[["Would Have BE'd Out"], [ADDED], [mix2]].forEach(([val]) => {
  console.log('\n   "' + val + '"');
  SITES.forEach(([name, fn]) => console.log('      ' + name.padEnd(32) + fn(val)));
});

console.log('\nAng mga auto-rule ay may katumbas pa ring option:');
const body = grab('function _autoUnfollowedRules(');
const added = [...new Set([...body.matchAll(/reasons\.add\('([^']+)'\)/g)].map(m => m[1]))];
added.forEach(r => {
  const ok = API.UNFOLLOWED_RULES_OPTIONS.includes(r);
  if(!ok) fail++;
  console.log('   ' + (ok ? '[x] ' : 'PATAY ') + r);
});

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat kinikilala nang tama'));
process.exit(fail ? 1 : 0);
