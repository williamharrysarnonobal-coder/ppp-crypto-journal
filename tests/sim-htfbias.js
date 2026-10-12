const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG "HTF BIAS" SA SETUP EDGE.

   Hinahanap nito ang sagot sa pinakamataas na timeframe ng bawat checklist.
   Isang regex ito noon — `MACD · (1H|4H)` — na tama lang hangga't dalawa ang
   posibleng itaas. Dalawang paraan ito nasira nang dumating ang Creation:

     15M Creation  ang itaas ay 15M -> walang tugma -> WALANG HTF bias kahit
                   may sagot, at walang magsasabi nito;
     4H Creation   may 4H at may 1H din sa loob -> dalawang tugma, at ang
                   findIndex ang unang nakukuha — tama sa pagkakataong ito,
                   pero aksidente lamang.

   Pinapatakbo nito ang TUNAY na _confluenceItemAnswer sa lahat ng 14 na setup,
   at inihahambing ang luma at ang bago sa parehong datos. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function constBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*([\\[{])').exec(js);
  const open = m[1], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + (x || '')); };

const API = new Function(
  constBlock('CONFLUENCE_SETUPS') + fnBody('_confluenceItemAnswer') +
  ' return { CS: CONFLUENCE_SETUPS, answer: _confluenceItemAnswer };')();

// Ang MISMONG predicate na nasa dashboard.js ngayon, kinuha sa pinagmulan —
// hindi isang kopya nito, kaya kung babalik ang regex, babagsak ito.
const line = /of: t => _confluenceItemAnswer\(t, ([^)]*\)[^)]*)\) \},/.exec(js)
          || /_confluenceItemAnswer\(t, (\(it, i\) => i === 0)\)/.exec(js);
ok('naka-index ang predicate, hindi naka-pangalan ng timeframe',
   !!line && /i === 0/.test(line[1]), line ? line[1] : '(hindi mahanap)');
ok('wala nang naka-hardcode na 1H|4H sa dimension',
   !/MACD · \(1H\|4H\)/.test(js));

const NEW = (it, i) => i === 0;                       // ang nasa app ngayon
const OLD = it => /^MACD · (1H|4H)$/.test(it.tag);    // ang dati

console.log('\nLAHAT NG 14 NA SETUP — may sagot ba ang HTF bias?\n');
console.log('  ' + 'setup'.padEnd(32) + 'item 0'.padEnd(16) + 'luma'.padEnd(12) + 'bago');
console.log('  ' + '-'.repeat(70));

let brokenBefore = 0;
Object.entries(API.CS).forEach(([k, cfg]) => {
  const [tt, pt] = k.split('|');
  // "yes" sa unang tanong — kung gumagana ang paghahanap, "Met" ang sagot.
  const t = { trade_type: tt, pattern_type: pt, confluence_answers: { 0: 'yes' } };
  const now = API.answer(t, NEW);
  const before = API.answer(t, OLD);
  if (before !== 'Met') brokenBefore++;
  console.log('  ' + k.padEnd(32) + cfg.items[0].tag.padEnd(16) +
    String(before || 'WALA').padEnd(12) + String(now || 'WALA'));
  ok('  "' + k + '"', now === 'Met', now || 'WALA');
});

console.log('');
ok('may nasira talaga noon', brokenBefore > 0,
   brokenBefore + ' setup ang walang HTF bias sa lumang regex');

console.log('\nANG DALAWANG SIRA, ISA-ISA\n');
const t15 = { trade_type:'Long', pattern_type:'15M HL Creation', confluence_answers:{ 0:'yes' } };
ok('15M Creation: WALA noon', API.answer(t15, OLD) === null, String(API.answer(t15, OLD)));
ok('15M Creation: Met na ngayon', API.answer(t15, NEW) === 'Met', String(API.answer(t15, NEW)));

/* Sa 4H Creation, ang item 0 ay 4H at ang item 1 ay 1H. Tumutugma ang luma sa
   dalawa; ang findIndex ang unang nakukuha, kaya tama ang naging sagot — pero
   dahil lang sa ayos, hindi dahil pinili nito ang pinakamataas. Ang pagpalit ng
   ayos ay tahimik na magpapalit ng ibig sabihin ng bawat naitalang trade. */
const t4h = { trade_type:'Long', pattern_type:'4H HL Creation', confluence_answers:{ 0:'yes', 1:'no' } };
const cfg4h = API.CS['Long|4H HL Creation'];
ok('4H Creation: dalawang tugma ang luma',
   cfg4h.items.filter(OLD).length === 2, cfg4h.items.filter(OLD).length + ' tugma');
ok('4H Creation: iisa ang tugma ng bago',
   cfg4h.items.filter((it, i) => NEW(it, i)).length === 1);
ok('4H Creation: 4H ang binabasa, hindi 1H',
   API.answer(t4h, NEW) === 'Met', String(API.answer(t4h, NEW)) + '  (1H ay "no")');

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
