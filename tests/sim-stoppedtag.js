const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* "Stopped Out Then Hit TP" SA TRADE TAGS.

   Ang mahalagang tanong ay hindi kung nasa listahan ito kundi kung ANO ang
   ituturing nito. Ang komento sa code ay malinaw: "Anything not named above is
   a breach" — kaya ang isang bagong tatak na basta idinagdag sa listahan ay
   BUMABAWAS sa discipline score.

   At iyon ay eksaktong kabaligtaran ng gusto: ang tatak na ito ay nangyayari
   kapag TAMA ka sa direksyon. Kung ito ay parusa, ang pinakamabilis na paraan
   para itaas ang score mo ay ang huwag itong itala — at doon nagiging
   kasinungalingan ang buong journal. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + ' = \\[').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '[') d++;
    else if(js[j] === ']'){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

const TAG = 'Stopped Out Then Hit TP';
const OPTS = new Function(arrBlock('UNFOLLOWED_RULES_OPTIONS') + ' return UNFOLLOWED_RULES_OPTIONS;')();
const OBS  = new Function(arrBlock('TAG_OBSERVATIONS') + ' return TAG_OBSERVATIONS;')();
const SENT = new Function(arrBlock('TAG_SENTINELS') + ' return TAG_SENTINELS;')();

/* Ang tag-core ang kumukuha ng buong rehiyon ng tag machinery mula sa
   dashboard.js — iisang lugar para sa lahat ng sim, kaya kapag nagbago ang
   panuntunan ay sabay-sabay silang sumusunod. Sinubukan ko munang hiwa-hiwain
   ito nang mag-isa at bumagsak: ang _brokenRuleTags ay hindi isang
   `function` na deklarasyon, kaya hindi ito nahanap ng paghahanap ko. */
const CORE = require('./tag-core');
const kindOf = CORE.API._tagKind;
const broken = CORE.API._brokenRuleTags;

console.log('1. NASA LISTAHAN BA\n');
check('nasa Trade Tags', OPTS.includes(TAG), true);
check('at nasa TUNAY na journal (hindi paperOnly)',
  /\{key:'unfollowed_rules'[^\n]*realOnly:true/.test(js), true);

console.log('\n2. ANO ANG ITINUTURING NITO\n');
console.log('     ' + TAG + '  ->  ' + kindOf(TAG));
check('OBSERVATION ito, hindi breach', kindOf(TAG), 'observation');
// Ang kabaligtaran, para malinaw na gumagana ang pagsusuri.
check('ang Revenge Trade ay breach pa rin', kindOf('Revenge Trade'), 'breach');
check('ang Rules Followed ay sentinel', kindOf('Rules Followed'), 'sentinel');
// Binago niya: ang tag na idinagdag niya ay note, hindi rule.
check('at ang hindi kilalang tatak ay note', kindOf('Kung ano-ano lang'), 'observation');

console.log('\n3. HINDI ITO BUMABAWAS SA DISCIPLINE\n');
/* Ang _brokenRuleTags ang nagpapasya kung sinira mo ang isang rule. Kung
   kasama rito ang tatak na ito, ang bawat pagkakataong tama ka sa basa ay
   magpapababa sa Rules Kept mo. */
const cases = [
  [TAG,                          0, 'mag-isa: walang nasira'],
  [TAG + ', Revenge Trade',      1, 'kasama ang tunay na breach: isa lang'],
  ['Revenge Trade, Moved Stop Loss', 2, 'dalawang breach'],
  ['Rules Followed',             0, 'malinis'],
];
cases.forEach(([v, want, why]) => {
  const got = broken(v).length;
  check(why.padEnd(34) + '"' + v.slice(0, 26) + '"', got, want);
});

console.log('\n4. MAY PALIWANAG SA HOVER\n');
check('may paliwanag', new RegExp("'" + TAG + "':").test(js), true);
check('at sinasabi nitong hindi ito rule broken',
  /Not a rule broken/.test(js), true);

console.log('\n5. WALANG KUWIT\n');
// Comma-joined ang unfollowed_rules — ang kuwit sa pangalan ay maghahati nito.
check('walang kuwit sa pangalan', TAG.includes(','), false);
check('walang kuwit sa alinman sa Trade Tags',
  OPTS.filter(o => o.includes(',')).join(' | ') || 'wala', 'wala');

console.log('\n' + (fail ? fail + ' FAIL' : 'tama ang uri ng bagong tatak'));
process.exit(fail ? 1 : 0);
