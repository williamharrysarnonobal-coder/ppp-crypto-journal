const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG ANIM NA BAGONG "CREATION" NA PATTERN TYPE.

   Ibang tanong sila sa walong nauna: hindi kung tumutugma ang isang antas na
   naroon na, kundi kung NABUBUO pa lamang ito — kaya pababa ang basa, mula sa
   humihinang mataas na timeframe hanggang sa mababang nagsasabi kung nagkaroon
   nga ng HL o LH.

   Tatlong bagay ang tahimik kung mali:
     - ang pattern type na walang checklist ay nagbibigay ng blangkong
       Confluence modal, at walang sasabihin ang app;
     - ang checklist na walang `patterns` ay hindi kailanman aabot ng 100%,
       dahil laging may +1 na puwesto ang chart pattern sa kabuuan;
     - ang mga sagot ay naka-imbak ayon sa POSISYON, kaya ang pagbago ng ayos
       ng item ay tahimik na binabago ang kahulugan ng bawat naitalang trade. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function objBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(js);
  if (!m) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
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
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };

const SETUPS = new Function(objBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();
const OPTS = new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')();

const NEW = [
  ['4H HL Creation',  'Long',  'bounce', ['4H','1H','30M','15M']],
  ['4H LH Creation',  'Short', 'reject', ['4H','1H','30M','15M']],
  ['1H HL Creation',  'Long',  'bounce', ['1H','15M','3M','5M']],
  ['1H LH Creation',  'Short', 'reject', ['1H','15M','3M','5M']],
  ['15M HL Creation', 'Long',  'bounce', ['15M','5M','3M','1M']],
  ['15M LH Creation', 'Short', 'reject', ['15M','5M','3M','1M']],
];

console.log('1. NASA LISTAHAN BA NG PATTERN TYPE?\n');
NEW.forEach(([p]) => ok('"' + p + '"', OPTS.pattern_type.includes(p)));
ok('walang naulit sa listahan',
   new Set(OPTS.pattern_type).size === OPTS.pattern_type.length,
   OPTS.pattern_type.length + ' pattern');

console.log('\n2. MAY CHECKLIST BA ANG BAWAT ISA?\n');
NEW.forEach(([p, dir]) => {
  const cfg = SETUPS[dir + '|' + p];
  ok('"' + dir + '|' + p + '"', !!cfg, cfg ? cfg.items.length + ' tanong' : 'WALA');
});

console.log('\n3. PITO ANG KABUUAN — anim na tanong at ang Reaction Area\n');
/* Ang kabuuan ay `items.length + 1`: laging may puwesto ang chart pattern.
   Ang Reaction Area ay hindi item kundi ang listahang iyon — kaya anim na item
   at ang listahan ang gumagawa ng pito sa talahanayan niya. */
const progress = new Function('items','answers','chartPatternPresent',
  'const _selectCredit = () => 1;' + fnBody('_confluenceProgress').replace(/^function [^(]+\([^)]*\)\s*\{/, '') .replace(/\}$/, ''));
NEW.forEach(([p, dir]) => {
  const cfg = SETUPS[dir + '|' + p];
  if(!cfg) { fail++; return; }
  ok('"' + p + '" ay anim na tanong', cfg.items.length === 6, cfg.items.length + '');
  /* Ang Reaction ay isang TANONG na may sariling select, hindi ang listahan ng
     chart pattern — iyon ang inayos niya. Ang Chart Pattern ay hiwalay na
     hilera na may parehong siyam na hugis ng ibang setup. */
  const react = cfg.items.find(it => it.tag === 'Reaction');
  ok('"' + p + '" ay may Reaction na select',
     !!react && Array.isArray(react.select) && react.select.length === 5,
     react && react.select ? react.select.join(' · ') : 'WALA');
  /* allGood: ang tanong ay SAAN, hindi GAANO KABUTI. Kung wala ito, ang FVG ay
     ikalimang pagpipilian at makakakuha ng zero — isang tamang sagot na
     binibilang na parang hindi mo sinagot. */
  ok('  at lahat ng sagot doon ay tama', !!react && react.allGood === true);
  const exec = cfg.items.find(it => /^Execution/.test(it.tag));
  ok('"' + p + '" ay may Execution na select',
     !!exec && Array.isArray(exec.select) && exec.select.length === 2 && exec.allGood === true,
     exec && exec.select ? exec.select.join(' · ') : 'WALA');
  // Siyam dati; labindalawa mula nang idagdag ang tatlong FVG fill (#33).
  ok('"' + p + '" ay may labindalawang chart pattern',
     Array.isArray(cfg.patterns) && cfg.patterns.length === 12,
     (cfg.patterns || []).length + '');
});

console.log('\n4. KAYA BANG UMABOT NG 100%?\n');
/* Kung walang `patterns`, hindi kailanman makukuha ang ikapitong puntos at
   ang pinakamataas na posible ay 86% — mukhang kulang ang isang kumpletong
   checklist. Dito iyon nahuhuli. */
const prog = new Function(
  'const _selectCredit = (it, ans) => 1;' + fnBody('_confluenceProgress') +
  ' return _confluenceProgress;')();
NEW.forEach(([p, dir]) => {
  const cfg = SETUPS[dir + '|' + p];
  if(!cfg) return;
  const all = {}; cfg.items.forEach((it, i) => all[i] = it.invert ? 'no' : 'yes');
  const withPat = prog(cfg.items, all, true);
  const noPat   = prog(cfg.items, all, false);
  ok('"' + p + '" -> 100% kapag kumpleto',
     Math.round(withPat.done / withPat.total * 100) === 100,
     withPat.done + '/' + withPat.total);
  ok('"' + p + '" -> mas mababa kapag walang pattern',
     noPat.done < withPat.total, noPat.done + '/' + noPat.total);
});

console.log('\n5. TAMA BA ANG TIMEFRAME NG BAWAT HAKBANG?\n');
/* Ang buong punto ng Creation ay ang PAGBABA ng timeframe. Kung magkamali ang
   ayos, ang checklist ay nagtatanong ng maling bagay sa maling antas at
   walang magsasabi nito. */
NEW.forEach(([p, dir, react, tfs]) => {
  const cfg = SETUPS[dir + '|' + p];
  if(!cfg) return;
  const tags = cfg.items.map(i => i.tag);
  ok('"' + p + '" pababa ang basa',
     tags[0].includes(tfs[0]) && tags[1].includes(tfs[1]) &&
     tags[2].includes(tfs[2]) && tags[3].includes(tfs[3]),
     tags.slice(0, 4).join('  '));
  ok('"' + p + '" ay nagtatanong ng ' + react,
     new RegExp(react, 'i').test(cfg.items[5].text), cfg.items[5].text);
});

console.log('\n6. MAGKASALAMIN ANG HL AT LH\n');
[['4H HL Creation','4H LH Creation'], ['1H HL Creation','1H LH Creation'],
 ['15M HL Creation','15M LH Creation']].forEach(([hl, lh]) => {
  const a = SETUPS['Long|' + hl], b = SETUPS['Short|' + lh];
  if(!a || !b) { fail++; return; }
  ok(hl + ' / ' + lh + ' — parehong bilang', a.items.length === b.items.length);
  ok(hl + ' / ' + lh + ' — parehong tag',
     a.items.map(i => i.tag).join('|') === b.items.map(i => i.tag).join('|'));
  /* Ang long ay naghahanap ng humihinang bear, ang short ng humihinang bull.
     Kung magkatugma sila, isa sa dalawa ay nakakopya nang mali. */
  ok(hl + ' — hinahanap ang Bear Territory', /Bear Territory/.test(a.items[0].text));
  ok(lh + ' — hinahanap ang Bull Territory', /Bull Territory/.test(b.items[0].text));
  /* Ang eksaktong salita ng kumpletong talahanayan niya: Pre-Breakdown sa
     ikalawa, at Breakdown / Invalidation sa ikatlo — walang "Bearish". Ang
     Territory ay nasa UNANG hakbang lamang, kung saan sinasabi ang direksyon. */
  ok(hl + ' — Bear Territory sa una', /Bear Territory/.test(a.items[0].text), a.items[0].text);
  ok(lh + ' — Bull Territory sa una', /Bull Territory/.test(b.items[0].text), b.items[0].text);
  ok(hl + ' — Pre-Breakdown sa ikalawa', /Pre-Breakdown\?$/.test(a.items[1].text), a.items[1].text);
  ok(lh + ' — Pre-Breakout sa ikalawa', /Pre-Breakout\?$/.test(b.items[1].text), b.items[1].text);
  ok(hl + ' — Breakdown / Invalidation',
     /Breakdown \/ Invalidation\?$/.test(a.items[2].text), a.items[2].text);
  ok(lh + ' — Breakout / Invalidation',
     /Breakout \/ Invalidation\?$/.test(b.items[2].text), b.items[2].text);
});

console.log('\n7. ANG EXECUTION TIMEFRAME AY SADYANG BLANGKO\n');
/* Ang bawat Creation ay may DALAWANG tamang execution timeframe ("Retest on
   3M or 5M?"). Ang pagpuno ng isa ay tama lang sa kalahati ng panahon, at ang
   maling awtomatikong sagot ay mas masama kaysa sa blangko: kailangan pa
   niyang mapansin ito. */
const EXEC = new Function(objBlock('PATTERN_EXEC_TF') + ' return PATTERN_EXEC_TF;')();
NEW.forEach(([p]) => ok('"' + p + '" ay walang awtomatikong exec TF',
  !EXEC[p], EXEC[p] || 'blangko'));

console.log('\n8. WALANG NASIRA SA WALONG NAUNA\n');
['Long|5 mins HL','Short|5 mins LH','Long|15 mins HL','Short|15 mins LH',
 'Long|1 hour HL','Short|1 hour LH','Long|30 mins Invalidation Play',
 'Short|30 mins Invalidation Play'].forEach(k =>
  ok('"' + k + '" nandoon pa rin', !!SETUPS[k], SETUPS[k] ? SETUPS[k].items.length + ' tanong' : 'NAWALA'));
ok('labing-anim na setup lahat (kasama ang dalawang 3ger)', Object.keys(SETUPS).length === 16,
   Object.keys(SETUPS).length + '');

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
