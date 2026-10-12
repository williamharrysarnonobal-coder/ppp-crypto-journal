const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang Confluence Score.
//
// DATI: "5/7". Magkakaiba ang total kada setup — 5/7, 6/9, 4/6 — kaya walang
// maikukumpara sa isang tingin, at kailangan mo pang hatiin sa isip bago may
// kahulugan. At ang mga kulay ay naka-banda sa 80/50 gayong 60% ang bar mo,
// kaya ang trade na PUMASA sa 70% ay lumalabas na orange.
//
// NGAYON: porsyento (parehong sukat para sa lahat ng setup) at tatlong kulay
// na nakatali sa bar ng mismong setup na 'yon.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const BAR = Number(/DEFAULT_MIN_CONFLUENCE_PCT = (\d+)/.exec(js)[1]);
console.log('Ang bar: ' + BAR + '%\n');

// Mga setup na may magkaibang bilang ng item — ang mismong pinagmumulan ng lito.
const SETUPS = {
  'Long|A': { items: Array.from({length:7}, (_,i) => ({ text:'q'+i })) },
  'Long|B': { items: Array.from({length:9}, (_,i) => ({ text:'q'+i })) },
  'Long|C': { items: Array.from({length:6}, (_,i) => ({ text:'q'+i })), minConfluencePct: 80 },
};
const data = new Function('CONFLUENCE_SETUPS','_confluenceProgress','DEFAULT_MIN_CONFLUENCE_PCT',
  grab('function _confluenceCellData(') + ' return _confluenceCellData;'
)(SETUPS, (items, ans) => ({ total: items.length, done: Object.keys(ans).length }), BAR);

const row = (pattern, answered) => ({
  trade_type:'Long', pattern_type:pattern,
  confluence_answers: Object.fromEntries(Array.from({length:answered}, (_,i) => [i,'yes'])),
});

console.log('1. PAREHONG SUKAT PARA SA LAHAT NG SETUP\n');
console.log('   setup   sagot   dati    ngayon   kulay');
console.log('   ' + '-'.repeat(46));
[['A',5,7],['B',6,9],['B',7,9],['C',5,6],['A',4,7],['A',3,7]].forEach(([p,a,t]) => {
  const d = data(row(p,a));
  const colour = d.state === 'pass' ? 'GREEN' : d.state === 'near' ? 'ORANGE' : 'RED';
  console.log('   ' + p + '       ' + (a+'/'+t).padEnd(8) + (a+'/'+t).padEnd(8) +
    (d.pct+'%').padEnd(9) + colour);
});

console.log('\n2. ANG BUG — pasado pero orange\n');
const d70 = data(row('A', 5));          // 5/7 = 71%, bar 60 -> pasado
check('71% ay PASADO sa 60% na bar', d70.pct >= BAR, true);
check('   at GREEN na siya', d70.state, 'pass');
console.log('   -> dati: orange, dahil naka-banda sa 80% ang green');

console.log('\n3. ANG TATLONG KULAY\n');
[[7,7,'pass','100%'],[5,7,'pass','71%'],[4,7,'near','57%'],[3,7,'fail','43%']].forEach(([a,t,want,pctStr]) => {
  const d = data(row('A', a));
  check(pctStr.padEnd(5) + ' -> ' + want, d.state, want);
});
check('eksaktong nasa bar ay pasado', data(row('B', 6)).state, 'pass');   // 6/9 = 67%
check('10 puntos sa ilalim ay alanganin', data(row('A', 4)).state, 'near'); // 57%
check('mas malayo pa ay bagsak', data(row('B', 4)).state, 'fail');          // 44%

console.log('\n4. IGINAGALANG ANG BAR NG BAWAT SETUP\n');
// Ang setup C ay may sariling bar na 80%.
const c5 = data(row('C', 5));   // 83%
const c4 = data(row('C', 4));   // 67%
check('setup C: 83% ay pasado sa sarili nitong 80%', c5.state, 'pass');
check('setup C: 67% ay BAGSAK dito', c4.state, 'fail');
check('   pero pasado sana sa 60%', c4.pct >= BAR, true);
check('sinasabi ng tooltip ang bar', c5.bar, 80);
console.log('   -> "green" = pumasa sa bar NG SETUP NA ITO, hindi sa isang numero');

console.log('\n5. WALANG SAGOT\n');
check('walang confluence_answers', data({ trade_type:'Long', pattern_type:'A' }), 'null');
check('walang laman', data({ trade_type:'Long', pattern_type:'A', confluence_answers:{} }), 'null');
check('di-kilalang setup', data(row('ZZZ', 5)), 'null');

console.log('\n6. PAREHO SA DALAWANG LUGAR\n');
check('ginagamit ng journal column', /if\(key === 'confluence_score'\)\{\s*\n\s*const d = _confluenceCellData\(row\);/.test(js), true);
check('ginagamit ng coloured cell', /const d = _confluenceCellData\(row\);\s*\n\s*if\(!d\) return null;/.test(js), true);
check('ginagamit ng Trade View badge', /const scoreBadge = \(\) => \{|const scoreBadge = \(\(\) => \{[\s\S]{0,80}_confluenceCellData/.test(js), true);
check('wala nang lumang 0.8/0.5 na banda sa badge',
  /pct >= 0\.8 \? 'var\(--win\)' : \(pct >= 0\.5/.test(js), false);
check('wala nang done\/total sa column', /return `\$\{Number\(done\.toFixed\(1\)\)\}\/\$\{total\}`/.test(js), false);
check('nasa tooltip pa rin ang hilaw na bilang', /of \$\{d\.total\} answered/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
