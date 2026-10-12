// Ang hover sa "Rules Followed?" sa Trade Journal.
//
// Naka-gate siya dati sa "No" lang — tama 'yon noong puro breach ang laman ng
// column, dahil ang "Yes" ay walang laman kundi ang sentinel. Pero ngayon ang
// "Yes" ay may dalang OBSERVATIONS, at 'yon pa mismo ang pinakadapat basahin:
// "No BE at Prev High/Low", "Held Through Invalidation". Wala silang ibang
// paraan para makita mula sa table.
const core = require('./tag-core');
const A = core.API;
const js = core.js;

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// Ang mismong sangay ng renderJournalTable, hinugot at pinatakbo.
// Brace-matched: ang loob ay may template literal na puno ng ${...}, kaya ang
// paghanap ng unang "}" ay pumuputol sa gitna.
const i = js.indexOf("if(c.key === 'rules_followed' && (_ruleTags(");
const branch = (() => {
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
})();
const cellFor = new Function('c','r','colored','_ruleTags','_canonicalTags','_tagKind','escapeHtml','mistakesTxt',
  branch + " return null;");

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
const render = tags => cellFor({ key:'rules_followed' },
  { unfollowed_rules: tags }, 'CELL', A._ruleTags, A._canonicalTags, A._tagKind, esc, '');
const attr = (html, name) => {
  const m = new RegExp('data-' + name + '="([^"]*)"').exec(html || '');
  return m ? m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&') : null;
};
const tipOf = html => {
  const b = attr(html, 'broke'), n = attr(html, 'notes');
  if(b === null && n === null) return null;
  return [b, n].filter(Boolean).join(', ');
};

console.log('ANG DATING ASAL — "No" lang ang may tooltip\n');
check('gate sa "no" ay wala na', /=== 'no'\)\{\s*\n\s*const rulesText/.test(js), false);
check('naka-gate na sa dami ng tag',
  /_ruleTags\(r\.unfollowed_rules\)\.length \|\| mistakesTxt\)\)\{/.test(js), true);

console.log('\nANG "YES" NA MAY OBSERVATION — dapat may tooltip\n');
[
  ['No BE at Prev High/Low'],
  ["Rules Followed, Would Have BE'd Out"],
  ['Rules Followed, Held Through Invalidation'],
  ["Rules Followed, BE'd at Prev High/Low, Cut on Invalidation"],
].forEach(([tags]) => {
  const tip = tipOf(render(tags));
  const ok = tip !== null && tip.length > 0;
  if(!ok) fail++;
  console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + tags.padEnd(56) + '-> ' + (tip || '(WALANG TOOLTIP)'));
});

console.log('\nANG "NO" — gumagana pa rin\n');
[
  ['FOMO Entry'],
  ['Lack of Confluence, Chased Extended Move'],
].forEach(([tags]) => {
  const tip = tipOf(render(tags));
  const ok = tip === tags;
  if(!ok) fail++;
  console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + tags.padEnd(56) + '-> ' + (tip || '(wala)'));
});

console.log('\nHINDI NA NAKA-ALIAS ANG "EGO HOLD"\n');
/* Dating pinagsasama ito sa "Held Through Invalidation". Tama 'yon habang ang
   pares ay nagtatala LAMANG ng desisyon — ang pangalan ay nauunang humatol sa
   tanong na dapat sagutin ng journal. Mali na ito ngayon: ang apat na
   invalidation tag ay may hawak nang desisyon AT kung paano ito nauwi, at ang
   "hinawakan ko at napunta sa stop" ay sarili nitong kahon. */
const RAW = 'Lack of Confluence, Ego Hold Despite Invalidation, Chased Extended Move';
const tip = tipOf(render(RAW));
console.log('   nakaimbak : ' + RAW);
console.log('   tooltip   : ' + tip);
check('nananatili ang sariling pangalan', /Ego Hold Despite Invalidation/.test(tip), true);
check('hindi ito nagiging Held Through', /Held Through Invalidation/.test(tip), false);
check('buo ang tatlo', tip.split(', ').length, 3);

console.log('\nWALANG TAG — walang tooltip\n');
check('blangko', tipOf(render('')), 'null');
check('espasyo lang', tipOf(render('   ')), 'null');
console.log('   -> hindi naglalagay ng walang lamang popup');

console.log('\nANG ESCAPE\n');
const q = tipOf(render('Rules Followed, Against Daily Bias / HTF Bias'));
check('dumadaan ang slash', /Against Daily Bias \/ HTF Bias/.test(q), true);
const raw = render("Rules Followed, Would Have BE'd Out");
check('may onmouseenter', /onmouseenter="showRulesTooltip\(event\)"/.test(raw), true);
check('may onmouseleave', /onmouseleave="hideRulesTooltip\(\)"/.test(raw), true);

console.log('\nANG PAGHAHATI — magkaiba ang dalawang uri\n');
// Ang mismong trade sa screenshot niya.
const SHOT = 'Chased Extended Move, Cut on Invalidation, Held Through Invalidation';
const cell = render(SHOT);
console.log('   Unfollowed Rules: ' + attr(cell, 'broke'));
console.log('   Others:           ' + attr(cell, 'notes'));
// Ang tatlo sa screenshot ay OBSERVATION nang lahat — hindi pa niya
// napagdedesisyunan na mali ang pumasok sa 3rd HL/LH, kaya lumipat din ang
// "Chased Extended Move". Walang breach sa trade na ito.
check('walang breach', attr(cell, 'broke'), '');
check('lahat ng tatlo ay nasa "Others"',
  attr(cell, 'notes'), 'Chased Extended Move, Cut on Invalidation, Held Through Invalidation');
// Ang paghahati mismo, na may tunay na breach:
const mixed = render('FOMO Entry, Held Through Invalidation');
check('breach sa "Unfollowed Rules"', attr(mixed, 'broke'), 'FOMO Entry');
check('observation sa "Others"', attr(mixed, 'notes'), 'Held Through Invalidation');
check('hiwalay na attribute, hindi isang listahan', /data-rules=/.test(cell), false);

const onlyNotes = render("Rules Followed, Held Through Invalidation");
check('walang breach -> walang "Unfollowed Rules"', attr(onlyNotes, 'broke'), '');
check('may laman pa rin ang Others', attr(onlyNotes, 'notes').length > 0, true);
const onlyBroke = render('FOMO Entry, Moved Stop Loss');
check('walang note -> walang "Others"', attr(onlyBroke, 'notes'), '');

console.log('\n   Ang tooltip mismo (walang innerHTML):');
check('gumagamit ng textContent', /b\.textContent = text;/.test(js), true);
// Ang function mismo, brace-matched — hindi 700 chars na dumadaan sa kasunod.
// At walang comment, dahil ang salitang "innerHTML" ay nasa paliwanag doon.
const tipFn = (() => {
  const k = js.indexOf('function showRulesTooltip('); let d = 0;
  for(let j = js.indexOf('{', k); j < js.length; j++){
    if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(!d) return js.slice(k, j+1); }
  }
})().replace(/\/\/[^\n]*/g, '');
check('walang innerHTML sa tooltip', /innerHTML/.test(tipFn), false);
check('may dalawang seksyon',
  /section\('Unfollowed Rules'[\s\S]{0,120}section\('Notes'/.test(js), true);

console.log('\nANG KONTRADIKSYON SA SCREENSHOT MO\n');
function grab2(m){
  const k = js.indexOf(m); let d=0;
  for(let j=js.indexOf('{',k); j<js.length; j++){ if(js[j]==='{')d++; else if(js[j]==='}'){d--; if(!d) return js.slice(k,j+1);} }
}
const objBlock = n => { const k=js.indexOf('const '+n); let d=0;
  for(let j=js.indexOf('{',k); j<js.length; j++){ if(js[j]==='{')d++; else if(js[j]==='}'){d--; if(!d) return js.slice(k,j+1)+';';} } };
const invalid = new Function('FIELD_OPTIONS','ALL_DRAWER_FIELDS','CONFLUENCE_SETUPS',
  'TRADING_ACCOUNTS','_staleConfluenceItems','_postBEApplies','_confluenceScoreFor',
  'DEFAULT_MIN_CONFLUENCE_PCT', `
  ${core.SRC}
  ${core.arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab2('const _isBlankish')}
  ${grab2('function _journalInvalidFields(')}
  return _journalInvalidFields;
`)(new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')(),
   [{key:'unfollowed_rules',label:'Trade Tags'},{key:'rules_followed',label:'Rules Followed?'}],
   {}, [], () => [], () => false, () => null, 60);

const warnOf = tags => invalid({ rules_followed:'No', unfollowed_rules:tags })
  .filter(b => b.key === 'unfollowed_rules').map(b => b.value);
console.log('   ' + SHOT);
console.log('   -> ' + (warnOf(SHOT)[0] || '(walang babala)'));
check('nahuhuli ang parehong panig ng invalidation',
  /both sides of the invalidation decision/.test(warnOf(SHOT)[0] || ''), true);
// Ang pares ng breakeven ay dalawa nang PAGWAWAKAS ng iisang desisyon —
// hinayaan mo ang stop at umubra, o hinayaan mo at natalo ka. Hindi pwedeng
// pareho. Wala na ang "BE'd at Prev High/Low" sa listahang ito, kasama ng tag.
check('nahuhuli rin sa breakeven',
  /both sides of the breakeven decision/.test(
    warnOf("Would Have BE'd Out, No BE at Prev High/Low")[0] || ''), true);
check('anim na pares sa invalidation',
  /both sides of the invalidation decision/.test(
    warnOf("Cut on Invalidation, Cut Too Early")[0] || ''), true);
check('isang panig lang -> tahimik',
  warnOf('Held Through Invalidation').length, 0);
check('magkaibang eksperimento -> tahimik',
  warnOf('Held Through Invalidation, No BE at Prev High/Low').length, 0);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
