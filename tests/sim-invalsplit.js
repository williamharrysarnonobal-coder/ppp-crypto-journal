const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG TANONG NA HINDI MASAGOT NG SARILING DATOS NITO.

   Isang eksperimento ang "invalidation" noon na may dalawang panig, at ang
   hatol ay naghihintay ng dalawang panig na may laman bago magsalita. Ang
   totoo: 13 na paghawak, zero na pagputol. Kaya ang panel ay nagsasabi ng
   "tag the other side" habang may 3-of-13 sa harap nito — isang malinaw na
   sagot na hindi nito nabibigkas.

   Hiwalay na sila ngayon, at ang bawat isa ay sumasagot mula sa sariling
   ebidensya. Pinapatakbo nito ang TUNAY na _runReport sa mismong datos niya. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  if (!m) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + (x || '')); };

// Ang tunay na listahan, hindi isang kopya.
const REPORTS = new Function(arrBlock('TRADE_REPORTS') + ' return TRADE_REPORTS;')();

console.log('1. DALAWANG MAGKAHIWALAY NA TANONG\n');
const byId = Object.fromEntries(REPORTS.map(r => [r.id, r]));
ok('may "inval-hold"', !!byId['inval-hold']);
ok('may "inval-cut"', !!byId['inval-cut']);
ok('wala nang pinagsamang "inval"', !byId['inval'],
   Object.keys(byId).filter(k => /inval/.test(k)).join(', '));
ok('magkaiba ang tanong',
   byId['inval-hold'] && byId['inval-cut'] &&
   byId['inval-hold'].q !== byId['inval-cut'].q);
console.log('     "' + (byId['inval-hold'] || {}).q + '"');
console.log('     "' + (byId['inval-cut'] || {}).q + '"');

console.log('\n2. ISANG PANIG BAWAT ISA — doon gumagana ang hatol\n');
['inval-hold', 'inval-cut'].forEach(id => {
  const r = byId[id]; if(!r) { fail++; return; }
  ok('"' + id + '" ay may isang panig', r.arms.length === 1, r.arms.length + ' panig');
  ok('"' + id + '" ay may keep at change', !!r.keep && !!r.change);
});
/* Walang tag na ginagamit ng dalawa: kung magkapatong sila, ang isang trade ay
   mabibilang sa dalawang tanong at magsasalungat ang dalawang sagot. */
const tagsOf = r => r.arms.flatMap(a => [a.good.tag, a.bad.tag]).filter(Boolean);
const hTags = tagsOf(byId['inval-hold'] || { arms: [] });
const cTags = tagsOf(byId['inval-cut'] || { arms: [] });
ok('walang tag na ginagamit ng dalawa',
   !hTags.some(t => cTags.includes(t)), hTags.filter(t => cTags.includes(t)).join(', ') || 'wala');

console.log('\n3. ANG HATOL SA MISMONG DATOS NIYA (3 tama, 10 mali)\n');
const run = new Function('trades', 'rep', `
  ${/const EM_MIN_N\s*=\s*\d+;/.exec(js)[0]}
  ${/const EM_MIN_GAP\s*=\s*[\d.]+;/.exec(js)[0]}
  const escapeHtml = s => String(s);
  /* _canonicalTags ay dumadaan sa _ruleTags, na isang const arrow at hindi
     function — kinukuha nang hiwalay, pero mula pa rin sa pinagmulan. Kasama
     rin ang talahanayan ng pagsasanib na binabasa nito. */
  ${/^const _ruleTags = .*$/m.exec(js)[0]}
  ${/const TAG_ALIASES\s*=\s*\{[\s\S]*?\n\};/.exec(js)[0]}
  ${fnBody('_canonicalTags')}
  ${/const _hasTag = [\s\S]*?\};/.exec(js)[0]}
  ${fnBody('_runReport')}
  return _runReport(rep, trades);
`);

const T = tag => ({ unfollowed_rules: tag });
const trades = [
  ...Array(3).fill(0).map(() => T('Held Through Invalidation')),
  ...Array(10).fill(0).map(() => T('Ego Hold Despite Invalidation')),
];

const plain = v => String(v.txt || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const hold = run(trades, byId['inval-hold']);
const cut  = run(trades, byId['inval-cut']);

console.log('   paghawak : [' + hold.verdict.tone + '] ' + plain(hold.verdict));
console.log('   pagputol : [' + cut.verdict.tone + '] ' + plain(cut.verdict));
console.log('');
ok('13 ang nabilang sa paghawak', hold.total === 13, String(hold.total));
ok('may hatol na ang paghawak', hold.verdict.tone === 'bad', hold.verdict.tone);
ok('sinasabing itigil ito', /Stop holding through invalidation/.test(plain(hold.verdict)));
ok('sinasabi ang bilang', /10 of 13/.test(plain(hold.verdict)), plain(hold.verdict));
/* Ito ang mismong pangungusap na dating lumalabas kahit may 13 na sa harap
   nito. Kung babalik ito, bumalik ang bug. */
ok('WALA nang "tag the other side"', !/tag the other side/i.test(plain(hold.verdict)));
ok('ang pagputol ay walang datos', cut.total === 0, String(cut.total));
ok('at sinasabi nitong wala pa', /Nothing tagged yet/i.test(plain(cut.verdict)),
   plain(cut.verdict).slice(0, 46));

console.log('\n4. KUNG MAG-TAG SIYA NG PAGPUTOL — sariling sagot ito\n');
const withCuts = trades.concat(
  Array(6).fill(0).map(() => T('Cut on Invalidation')),
  Array(2).fill(0).map(() => T('Cut Too Early')));
const cut2 = run(withCuts, byId['inval-cut']);
const hold2 = run(withCuts, byId['inval-hold']);
console.log('   pagputol : [' + cut2.verdict.tone + '] ' + plain(cut2.verdict));
ok('may sariling hatol na ang pagputol', cut2.verdict.tone === 'good', cut2.verdict.tone);
ok('6 of 8 ang nabilang', /6 of 8/.test(plain(cut2.verdict)), plain(cut2.verdict));
ok('hindi nagalaw ang hatol sa paghawak',
   plain(hold2.verdict) === plain(hold.verdict),
   'magkaiba ang dalawang tanong, kaya hindi dapat maapektuhan');

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
