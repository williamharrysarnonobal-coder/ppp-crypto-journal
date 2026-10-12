const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* MARAMING CHART PATTERN SA IISANG TRADE.

   Ang mahalaga rito ay hindi ang pagpindot kundi ang mga LUGAR NA BUMABASA.
   Ang isang halaga na dating "Double Bottom" ay "Double Bottom, FVG" na
   ngayon, at bawat lugar na gumagamit ng === sa halagang iyon ay tahimik na
   magiging mali: mawawala ang trade sa filter, gagawa ng basurang bucket sa
   report, at ituturing na sira ng validation ang isang tamang trade.

   Kaya kinukuha ko ang TUNAY na mga function mula sa dashboard.js. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
function constBlock(name){
  const m = new RegExp('const ' + name + ' = [\\[{]').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  const open = js[m.index + m[0].length - 1], close = open === '[' ? ']' : '}';
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === open) d++;
    else if(js[j] === close){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + got + (ok ? '' : '   <-- ' + want));
};

const { _patternList, _patternToggle } = new Function(`
  ${fnBody('_patternList')}
  ${fnBody('_patternToggle')}
  return { _patternList, _patternToggle };
`)();

console.log('1. ANG PAGBASA NG LISTAHAN\n');
check('isang pangalan ay listahan ng isa', JSON.stringify(_patternList('FVG')), '["FVG"]');
check('dalawa', JSON.stringify(_patternList('Double Bottom, FVG')), '["Double Bottom","FVG"]');
check('kahit magulo ang espasyo', JSON.stringify(_patternList(' FVG ,  H&S ')), '["FVG","H&S"]');
check('walang laman', JSON.stringify(_patternList('')), '[]');
check('null', JSON.stringify(_patternList(null)), '[]');
// Ang bawat LUMANG trade ay may iisang pangalan na walang kuwit. Kung ito ay
// mababasa nang mali, ang bawat trade na naitala mo ay masisira nang sabay.
check('lumang halaga, hindi nasisira', JSON.stringify(_patternList('Inverse H&S')), '["Inverse H&S"]');

console.log('\n2. ANG TOGGLE\n');
check('magdagdag sa wala', _patternToggle(null, 'FVG'), 'FVG');
check('magdagdag ng pangalawa', _patternToggle('FVG', 'H&S'), 'FVG, H&S');
check('pindutin ulit -> tinatanggal', _patternToggle('FVG, H&S', 'FVG'), 'H&S');
check('tanggalin ang huli -> null', _patternToggle('FVG', 'FVG'), null);
check('None -> naglilinis', _patternToggle('FVG, H&S', 'None'), null);
check('None sa wala', _patternToggle(null, 'None'), null);
// Hindi dapat madoble kapag naipit ang pindot.
check('walang doble', _patternToggle('FVG', 'FVG') === null ? 'ok' : 'doble', 'ok');

console.log('\n3. ANG GRADING — HINDI DAPAT MAGBAGO\n');
/* Sinabi niya: "yung grading hindi naman need adjust". Ang chart pattern ay
   isang tsek pa rin, hindi isang tsek kada pattern — kung hindi, ang pagpili
   ng tatlong hugis ay magbibigay ng libreng puntos. */
const progress = new Function(fnBody('_confluenceProgress') + ' return _confluenceProgress;')();
const items = [{}, {}, {}, {}];   // apat na tanong
const answers = { 0:'yes', 1:'yes', 2:'yes', 3:'yes' };
const one   = progress(items, answers, !!'Double Bottom');
const three = progress(items, answers, !!'Double Bottom, FVG, FVG + Fib');
const none  = progress(items, answers, !!'');
console.log('   isa: ' + one.done + '/' + one.total +
            '   tatlo: ' + three.done + '/' + three.total +
            '   wala: ' + none.done + '/' + none.total);
check('pareho ang isa at ang tatlo', three.done, one.done);
check('isang tsek lang ang pattern', one.done - none.done, 1);

console.log('\n4. ANG MGA LUGAR NA BUMABASA\n');
/* Hindi teksto ang hinahanap ko kundi ang mismong tanong: may natira pa bang
   === sa isang halaga ng chart pattern? Iyon ang hugis ng bug. */
const readers = [
  ['journal filter (multi key)', /JOURNAL_MULTI_KEYS = new Set\(\[[^\]]*'chart_pattern'/],
  ['breakdown dimension (many)', /label:'Chart pattern'[\s\S]{0,140}many:\s*true/],
  ['_setupStats tumatanggap ng many', /function _setupStats\(trades, keyOf, order, many\)/],
  ['_sxFiltered gumagamit ng includes', /if\(d\.many\) return _patternList\(d\.of\(t\)\)\.includes/],
  ['validation isa-isa', /_patternList\(r\.chart_pattern\)\.filter/],
];
readers.forEach(([label, re]) => check(label, re.test(js) ? 'oo' : 'HINDI', 'oo'));

// At ang lumang isahang paghahambing ay hindi na dapat naroon.
const oldCompare = [
  ['chip: p === confluenceChartPattern', /p === confluenceChartPattern/],
  ['chip: p === chartPattern',           /\|\| p === chartPattern/],
  ['validation: includes(r.chart_pattern)', /cfg\.patterns\.includes\(r\.chart_pattern\)/],
];
oldCompare.forEach(([label, re]) => check('wala na: ' + label, re.test(js) ? 'NARIYAN PA' : 'wala', 'wala'));

console.log('\n5. ANG PAGBIBILANG SA REPORT\n');
/* Ang isang trade na may dalawang pattern ay dapat mabilang sa DALAWA, hindi
   bumuo ng ikatlong pangalan na "Double Bottom, FVG". */
const T = (cp, wl) => ({ chart_pattern: cp, win_loss: wl, profit_loss: wl === 'Win' ? 100 : -50, fee: 0 });
const rows = [
  T('Double Bottom', 'Win'), T('Double Bottom, FVG', 'Win'),
  T('FVG', 'Loss'), T('FVG, FVG + Fib', 'Win'), T('', 'Win'),
];
const g = {};
rows.forEach(t => {
  const k = t.chart_pattern;
  if(k === null || k === undefined || k === '' || k === 'Unspecified') return;
  _patternList(k).forEach(v => { (g[v] = g[v] || []).push(t); });
});
const names = Object.keys(g).sort();
console.log('   mga bucket: ' + names.join(' · '));
console.log('   bilang    : ' + names.map(n => n + '=' + g[n].length).join(', '));
check('walang pinagsamang pangalan',
  names.some(n => n.includes(',')) ? 'MERON' : 'wala', 'wala');
check('Double Bottom ay nabibilang ng dalawang beses', g['Double Bottom'].length, 2);
check('FVG ay tatlo', g['FVG'].length, 3);
check('FVG + Fib ay isa', g['FVG + Fib'].length, 1);
// Tatlo: Double Bottom, FVG, FVG + Fib. Ang blangkong hilera ay walang
// bucket, at ang "Double Bottom, FVG" ay hindi isang pangalan kundi dalawa.
check('tatlong natatanging hugis', names.length, 3);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
