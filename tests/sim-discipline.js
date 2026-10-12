const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The new option adds a SECOND "nothing broken" sentinel. Every discipline
// count compared the whole string to "rules followed", so a clean trade
// carrying both would have flipped to "breach". Prove it no longer does.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function constBlock(name, open) {
  const m = new RegExp('const ' + name + '\\s*=\\s*\\' + open).exec(js);
  if (!m) throw new Error('missing: ' + name);
  const close = open === '[' ? ']' : ')';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function arrowConst(name) {
  const i = js.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error('missing: ' + name);
  const end = js.indexOf('\n', js.indexOf(';', i));
  return js.slice(i, end);
}
// _isCleanRules spans several lines and ends with `};`
function blockConst(name) {
  const i = js.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error('missing: ' + name);
  const end = js.indexOf('};', i) + 2;
  return js.slice(i, end);
}

const API = new Function(`
  ${require('./tag-core').SRC}
  return { _ruleTags, _brokenRuleTags, _isCleanRules, TAG_OBSERVATIONS };
`)();

// Read the label straight from the source rather than retyping it — the
// apostrophe in "BE'd" is exactly the kind of thing a retype gets wrong.
// Dating hinahalungkat ang _RULES_POSITIVE_SET; ngayon may sariling listahan
// Dating naka-lowercase ang _RULES_POSITIVE_SET; ang TAG_OBSERVATIONS ay
// nasa orihinal na baybay, kaya diretsong paghahambing na.
const NEW_TAG = API.TAG_OBSERVATIONS[0];
const BE = "Would Have BE'd Out";
console.log('Bagong tag sa source: ' + JSON.stringify(BE));
if (NEW_TAG !== BE) {
  console.log('  MISMATCH — ang nasa source ay ' + JSON.stringify(NEW_TAG));
  process.exit(1);
}

// The check every panel used before this change.
const OLD_clean  = v => String(v||'').trim().toLowerCase() === 'rules followed';
const OLD_broken = v => String(v||'').trim() !== '' && String(v||'').trim().toLowerCase() !== 'rules followed';

const cases = [
  ['Rules Followed',                 'malinis, lumang paraan'],
  ['Rules Followed, ' + BE,          'malinis, BAGONG pares'],
  [BE,                               'malinis, bago lang'],
  ['Moved Stop Loss',                'may sira'],
  ['Moved Stop Loss, Changing Plan', 'dalawang sira'],
  ['',                               'hindi pa naitatala'],
];

console.log('\n  ' + 'kaso'.padEnd(26) + 'halaga'.padEnd(34) + 'dati'.padEnd(11) + 'ngayon');
console.log('  ' + '-'.repeat(84));
let regressions = 0;
cases.forEach(([v, label]) => {
  const oldV = OLD_clean(v) ? 'malinis' : (OLD_broken(v) ? 'SIRA' : 'blangko');
  const newV = API._isCleanRules(v) ? 'malinis'
    : (API._brokenRuleTags(v).length ? 'SIRA' : 'blangko');
  const flag = oldV !== newV ? '   <-- naayos' : '';
  console.log('  ' + label.padEnd(26) + (v || '(blangko)').padEnd(34) +
    oldV.padEnd(11) + newV + flag);
});

console.log('\nAng mahalagang kaso — malinis na trade na may dalawang tag:');
const both = 'Rules Followed, ' + BE;
console.log('  dati   : ' + (OLD_broken(both) ? 'binibilang na SIRA  <-- ito ang mali' : 'ok'));
console.log('  ngayon : ' + (API._isCleanRules(both) ? 'binibilang na malinis  PASS' : 'FAIL'));
if (!API._isCleanRules(both)) regressions++;
if (!OLD_broken(both)) { console.log('  (inaasahan ang lumang bug pero wala — suriin)'); regressions++; }

console.log('\nAng mga tag na binibilang na breach (ang cost table):');
[both, 'Moved Stop Loss, ' + BE, 'Early TP, FOMO Entry'].forEach(v => {
  const tags = API._brokenRuleTags(v);
  console.log('  ' + v.padEnd(42) + '-> ' + (tags.length ? tags.join(' | ') : '(wala)'));
});
const mixed = API._brokenRuleTags('Moved Stop Loss, ' + BE);
if (mixed.length !== 1 || mixed[0] !== 'Moved Stop Loss') { console.log('  FAIL sa halong kaso'); regressions++; }

console.log('\n' + (regressions ? regressions + ' FAIL' : 'walang regression'));
process.exit(regressions ? 1 : 0);
