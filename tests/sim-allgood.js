const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
﻿/* ANG TANONG NA WALANG RANGGO.

   Ang _selectCredit ay nagbibigay ng buong puntos sa una at ikalawa lamang,
   kalahati sa ikatlo, at wala sa natitira. Gawa iyon para sa Sequence: ang
   ika-1 at ika-2 na HL ay mabuti, ang ika-3 ay katamtaman, ang ika-4 at ika-5
   ay nasa loob na ng galaw na tumakbo na.

   Ang Reaction ay hindi ganoon. Ang ".382 Â· .5 Â· .618 Â· Market OB Â· FVG" ay
   nagtatanong ng SAAN, hindi ng GAANO KABUTI â€” pantay silang lahat. Kung wala
   ang allGood, ang FVG ay ikalimang pagpipilian at makakakuha ng ZERO: isang
   tamang sagot na binibilang na parang hindi mo sinagot, at ang iskor mo ay
   mas mababa nang hindi mo alam kung bakit. */
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
function objBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

const credit = new Function(fnBody('_selectCredit') + ' return _selectCredit;')();
const prog = new Function('const _selectCredit = ' + fnBody('_selectCredit').replace('function _selectCredit', 'function') + ';' +
  fnBody('_confluenceProgress') + ' return _confluenceProgress;')();
const CS = new Function(objBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();

const AREAS = ['.382', '.5', '.618', 'Market OB', 'FVG'];

console.log('1. ANG LUMANG PANUNTUNAN â€” nananatili sa Sequence\n');
const seq = { select:['1st','2nd','3rd','4th','5th'] };
[['1st',1],['2nd',1],['3rd',0.5],['4th',0],['5th',0]].forEach(([a, want]) =>
  ok('"' + a + '" -> ' + want, credit(seq, a) === want, String(credit(seq, a))));

console.log('\n2. ANG BAGO â€” pantay ang lahat\n');
const react = { select:AREAS, allGood:true };
AREAS.forEach(a => ok('"' + a + '" -> 1', credit(react, a) === 1, String(credit(react, a))));
/* Ito ang mismong sira. Kung mawala ang allGood, ang huling dalawang reaction
   area ay parehong zero. */
const noFlag = { select:AREAS };
ok('kung walang allGood, ZERO ang FVG', credit(noFlag, 'FVG') === 0,
   'iyon ang bug: ' + credit(noFlag, 'FVG'));
ok('at ZERO din ang Market OB', credit(noFlag, 'Market OB') === 0);

console.log('\n3. HINDI KILALANG SAGOT\n');
ok('wala sa listahan -> 0', credit(react, 'wala dito') === 0);

console.log('\n4. KUMPLETONG CHECKLIST -> 100%\n');
/* Anumang reaction area ang piliin, dapat 100% pa rin ang iskor. Kung may
   isang pagpipiliang nagbabawas, hindi na ito checklist kundi ranggo. */
Object.keys(CS).filter(k => /Creation/.test(k)).forEach(k => {
  const cfg = CS[k];
  const scores = AREAS.map(area => {
    const ans = {};
    cfg.items.forEach((it, i) => {
      ans[i] = it.select
        ? (it.tag === 'Reaction' ? area : it.select[0])
        : (it.invert ? 'no' : 'yes');
    });
    const p = prog(cfg.items, ans, true);
    return Math.round(p.done / p.total * 100);
  });
  ok(k.padEnd(24) + ' 100% sa bawat area',
     scores.every(v => v === 100), scores.join('% ') + '%');
});

console.log('\n5. PANTAY DIN ANG KULAY\n');
/* Ang pulang ikalimang chip ay magsasabing may mali sa isang sagot na tama
   naman â€” ang kulay ay bahagi ng sagot, hindi palamuti. */
ok('sinusunod ng chip ang allGood',
   /it\.allGood \? 'var\(--win\)'[\s\S]{0,200}?_sequenceTint\(idx\)/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
