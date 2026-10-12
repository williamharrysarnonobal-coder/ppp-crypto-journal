const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* "May confluence ba ang setup na ito?"

   Tatlong lugar ang nagtatanong nito, at pare-pareho silang sumasagot noon sa
   pamamagitan ng `s.pattern_type` — na hindi ang tanong. Itinatakda ng modal
   ang Pattern Type sa sandaling buksan ito, bago pa may kahit isang sagot.
   Kaya ang isang setup na binuksan at isinara ay pumapasa sa lahat ng tatlo,
   at ang dinadala nito sa trade ay isang walang lamang `{}` na lumalabas na
   "—". Walang sinabi ang app kahit kailan.

   Isang function na lang ang sumasagot ngayon, at dito ito binabantayan. */
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

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

console.log('1. ANG SAGOT MISMO\n');
const has = new Function(fnBody('_setupHasConfluence') + ' return _setupHasConfluence;')();
ok('may sagot -> oo', has({ confluence_answers: { 0:'yes' } }) === true);
ok('walang laman -> hindi', has({ confluence_answers: {} }) === false,
   'ito ang naiiwan ng modal na binuksan at isinara');
ok('null -> hindi', has({ confluence_answers: null }) === false);
ok('wala talaga -> hindi', has({}) === false);
ok('walang row -> hindi', has(null) === false);
/* Ang mahalagang isa: ang Pattern Type lamang ay HINDI confluence. Ito mismo
   ang lumang panuntunan, at ito ang dahilan kung bakit tahimik ang pagkabigo. */
ok('pattern_type lang -> HINDI', has({ pattern_type: '5 mins HL' }) === false);
ok('hindi object -> hindi', has({ confluence_answers: 'yes' }) === false);

console.log('\n2. LAHAT NG TATLONG GATE AY DUMADAAN DITO\n');
const gate = fnBody('journalSelectedSetups');
ok('gate ng bulk: ready', /const ready = picked\.filter\(_setupHasConfluence\)/.test(gate));
ok('gate ng bulk: missing', /const missing = picked\.filter\(s => !_setupHasConfluence\(s\)\)/.test(gate));
ok('label ng pindutan', /_setupHasConfluence\(s\) \? 'Edit Confluence' : 'Confluence'/.test(js));
ok('naka-disable ang Journal', /!_setupHasConfluence\(s\) \? 'disabled/.test(js));

/* Walang natitirang lugar na nagtatanong ng parehong tanong sa lumang paraan.
   Ang paghahambing ng pattern sa _bulkJournalRows ay ibang tanong — kung
   NAGBAGO ba ang pattern — kaya hindi ito kasama. */
console.log('\n3. WALANG NATIRANG LUMANG PANUNTUNAN\n');
const strip = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const suspects = [
  [/picked\.filter\(s => s\.pattern_type\)/, 'gate ng bulk'],
  [/s\.pattern_type \? 'Edit Confluence'/, 'label ng pindutan'],
  [/!s\.pattern_type \? 'disabled/, 'Journal na naka-disable'],
];
suspects.forEach(([re, name]) =>
  ok('wala nang "' + name + '" na naka-pattern_type', !re.test(strip)));

console.log('\n4. NANATILI ANG IBANG TANONG\n');
const bulk = fnBody('_bulkJournalRows');
ok('nananatili ang paghahambing ng pattern (ibang tanong)',
   /patternChanged\s*=\s*patch\.pattern_type\s*&&\s*setup\.pattern_type/.test(bulk));
ok('may babala pa rin', /confluence cleared on/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
