const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* SAAN-SAAN BA DAPAT LUMABAS ANG BAGONG PATTERN?

   Ang tanong niya ay "nasa Setup check ba" — pero ang tunay na tanong sa
   likod nito ay "may nakalimutan pa ba". Kaya hindi lang ang Setup check ang
   tinitingnan dito kundi ang BAWAT lugar sa buong file kung saan may nakasulat
   na pangalan ng pattern.

   Dalawang uri ng listahan:
     BUHAY   — hinuhugot sa datos (ALL_TRADES, FIELD_OPTIONS, CONFLUENCE_SETUPS).
               Kusang sumasama ang bago; walang gagawin.
     PATAY   — nakasulat sa code. Ang bawat isa ay dapat may dahilan, dahil ang
               bagong pattern ay tahimik na hindi mabibilang doon. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const html = fs.readFileSync(ROOT + '/dashboard.html', 'utf8');

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

const NEW = ['4H HL Creation','4H LH Creation','1H HL Creation',
             '1H LH Creation','15M HL Creation','15M LH Creation'];
const OLD = ['5 mins HL','5 mins LH','15 mins HL','15 mins LH',
             '1 hour HL','1 hour LH','30 mins Invalidation Play'];

console.log('1. ANG MGA LISTAHANG BUHAY — kusang sumasama ang bago\n');
const live = [
  ['Setup check (dropdown)', /const setups = \[\.\.\.new Set\(ALL_TRADES\.map\(t => t\.pattern_type\)/],
  ['Confluence modal',       /function _renderConfluencePatternOptions[\s\S]{0,300}?_patternTypesForTradeType/],
  ['BnB — Notebook',         /function _renderBbPatternOptions[\s\S]{0,300}?_patternTypesForTradeType/],
  ['BnB — Calculator',       /function _renderPsBbPatternOptions[\s\S]{0,300}?_patternTypesForTradeType/],
  ['ang shared filter',      /function _patternTypesForTradeType[\s\S]{0,300}?FIELD_OPTIONS\.pattern_type/],
  ['drawer + journal column',/pattern_type: \['5 mins HL'/],
];
live.forEach(([name, re]) => ok(name + ' ay hinuhugot sa datos', re.test(js)));

console.log('\n2. ANG MGA LISTAHANG NAKASULAT SA CODE\n');
/* Ang unang bersyon nito ay humahati kada LINYA, kaya ang isang array na
   nakabalot sa tatlong linya ay lumalabas na tatlong hindi kilalang lugar.
   Ang DEKLARASYON ang tinitingnan ngayon: kaninong `const` ba kabilang ang
   bawat pangalan. Iyon ang tunay na yunit — isang listahan ay isang bagay na
   pinananatili, saan man ito bumalot. */
const stripped = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const decls = [...stripped.matchAll(/^(?:const|let)\s+(\w+)/gm)]
  .map(m => ({ name: m[1], at: m.index }));
const ownerOf = idx => {
  let best = { name: '(labas ng anumang const)', at: -1 };
  decls.forEach(d => { if(d.at <= idx && d.at > best.at) best = d; });
  return best.name;
};

/* Ang bawat listahan na may pangalan ng pattern, at kung bakit ito ayos:
   BUHAY = hinuhugot sa datos; ALAM = nakasulat pero may dahilan at nadagdagan
   na ng bago; BAGO = hindi ko pa nakikita, kaya baka nakalimutan. */
/* Ang ANIM NA BAGO lamang ang binabantayan dito. Ang mga lumang pangalan ay
   lumalabas din sa loob ng ilang function ("30 mins Invalidation Play" sa
   dalawang lugar) — matagal na iyon at hindi ito ang binabantayan.

   Dalawang lugar lang dapat ang may literal na anim: ang listahan mismo, at
   ang FIELD_OPTIONS. Lahat ng iba ay dapat dumaan sa CREATION_PATTERNS, kaya
   walang ikatlong kopyang maiiwan kapag may naidagdag pa. */
const HOMES = ['CREATION_PATTERNS', 'FIELD_OPTIONS'];
const owners = {};
NEW.forEach(p => {
  const re = new RegExp("'" + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'", 'g');
  let m;
  while ((m = re.exec(stripped))) {
    const o = ownerOf(m.index);
    (owners[o] = owners[o] || new Set()).add(p);
  }
});
Object.entries(owners).forEach(([name, pats]) => {
  const home = HOMES.includes(name);
  console.log('   ' + (home ? 'tahanan ' : 'KOPYA   ') + name.padEnd(26) + pats.size + '/6');
  ok('  "' + name + '"', home, home ? '' : 'ikatlong kopya — dapat dumaan sa CREATION_PATTERNS');
});
HOMES.forEach(n => {
  const got = owners[n] || new Set();
  ok('  "' + n + '" ay may lahat ng anim', NEW.every(p => got.has(p)),
     NEW.filter(p => !got.has(p)).join(', ') || '6/6');
});

/* At ang mapang dinudugtungan — sa RUNTIME ito sinusuri at hindi sa paghahanap
   ng literal, dahil walang literal doon: `CREATION_PATTERNS.slice()` ang
   nakalagay. Iyon mismo ang punto. */
console.log('');
const mapAtRuntime = new Function(
  (/const TRADE_SETUP_PATTERN_MAP[\s\S]*?\n\};/.exec(js)[0]) +
  (/const CREATION_PATTERNS[\s\S]*?\];/.exec(js)[0]) +
  "TRADE_SETUP_PATTERN_MAP['Creation Play'] = CREATION_PATTERNS.slice();" +
  ' return TRADE_SETUP_PATTERN_MAP;')();
ok('may "Creation Play" sa TRADE_SETUP_PATTERN_MAP',
   Array.isArray(mapAtRuntime['Creation Play']), Object.keys(mapAtRuntime).join(', '));
ok('anim ang laman nito',
   (mapAtRuntime['Creation Play'] || []).length === 6,
   (mapAtRuntime['Creation Play'] || []).length + '');
ok('at dumadaan ito sa CREATION_PATTERNS',
   /TRADE_SETUP_PATTERN_MAP\['Creation Play'\] = CREATION_PATTERNS/.test(js));
/* Ang tatlong lumang Play ay hindi dapat makakuha ng Creation — hindi Bounce
   at hindi Rejection ang pagbuo ng antas. */
['Bounce Play','Rejection Play','Invalidation Play'].forEach(k =>
  ok('walang Creation sa "' + k + '"',
     !(mapAtRuntime[k] || []).some(p => NEW.includes(p))));
ok('may direksyong pagsala ang Creation Play sa drawer',
   /setupValue === 'Creation Play'[\s\S]{0,300}?p\.includes\('HL'\)/.test(js));

console.log('\n3. ANG DALAWANG LUMANG PATTERN NA WALANG CHECKLIST\n');
/* Hindi ito bagong sira — matagal nang naroon ang "4 Hour HL" at "4 Hour LH"
   sa listahan nang walang CONFLUENCE_SETUPS. Nagiging halata lang ngayon dahil
   may dalawa nang 4H sa dropdown, at ang isa ay may checklist at ang isa wala.
   Hindi ko ito inaayos nang hindi tinatanong — pero hindi rin ito itinatago. */
const m = /const CONFLUENCE_SETUPS\s*=\s*\{/.exec(js);
let d = 0, src = '';
for (let j = m.index + m[0].length - 1; j < js.length; j++) {
  if (js[j] === '{') d++;
  else if (js[j] === '}') { d--; if (!d) { src = js.slice(m.index, j + 1) + ';'; break; } }
}
const CS = new Function(src + ' return CONFLUENCE_SETUPS;')();
const optM = /pattern_type:\s*\[[\s\S]*?\]/.exec(js)[0];
const allPats = [...optM.matchAll(/'([^']+)'/g)].map(x => x[1]);
const noChecklist = allPats.filter(p =>
  !CS['Long|' + p] && !CS['Short|' + p]);
console.log('   walang checklist: ' + (noChecklist.join(', ') || 'wala'));
ok('walang BAGONG pattern na walang checklist',
   !noChecklist.some(p => NEW.includes(p)),
   noChecklist.filter(p => NEW.includes(p)).join(', ') || 'lahat ng anim ay may checklist');
ok('ang dalawang walang checklist ay ang mga luma',
   noChecklist.every(p => /^4 Hour/.test(p)), noChecklist.join(', '));

console.log('\n4. MAY NAKASULAT BA SA HTML?\n');
const htmlHits = OLD.concat(NEW).filter(p => html.includes('>' + p + '<'));
ok('walang naka-hardcode na pattern sa HTML', htmlHits.length === 0,
   htmlHits.join(', ') || 'lahat ay ginagawa ng JS');

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
