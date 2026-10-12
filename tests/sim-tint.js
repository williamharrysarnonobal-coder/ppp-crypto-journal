const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The matrix cells were tinted by SEQUENCE POSITION, so a 0% in the 2nd column
// came out green. Check they now follow the win rate, and that a tiny sample
// stays muted instead of shouting.
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
const consts = js.slice(js.indexOf('const WIN_RATE_STRONG'), js.indexOf('\n', js.indexOf('const WIN_RATE_STRONG')));
const tint = new Function(consts + grab('function _winRateTint(') + ' return _winRateTint;')();
const seqTint = new Function(grab('function _sequenceTint(') + ' return _sequenceTint;')();

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(46) + got + (ok ? '' : '   <-- ' + want));
};
const name = c => (c||'').replace('var(--','').replace(')','');

console.log('Ang mga eksaktong cell sa larawan mo:\n');
console.log('   setup / posisyon         n    rate    dati        ngayon');
console.log('   ' + '-'.repeat(64));
[
  ['1 hour LH · 2nd',            5,   0, 1],
  ['1 hour HL · 2nd',            3, 100, 1],
  ['5 mins HL · 1st',           12,  10, 0],
  ['5 mins LH · 1st',           18,  20, 0],
  ['5 mins HL · 3rd',            3, 100, 2],
  ['15 mins HL · 5th',           3,   0, 4],
  ['15 mins HL · 1st',           4, 100, 0],
  ['1 hour HL · 1st',            1, 100, 0],
  ['30 mins Invalidation · 1st', 3, 100, 0],
].forEach(([label, n, rate, seqIdx]) => {
  const before = name(seqTint(seqIdx));
  const after = name(tint(rate, n));
  console.log('   ' + label.padEnd(26) + String(n).padStart(2) + '  ' +
    (rate + '%').padStart(5) + '   ' + before.padEnd(12) + after +
    (before !== after ? '  <- naayos' : ''));
});

console.log('\nAng mga bandang mismo:');
check('0% sa 5 na trade ay pula', name(tint(0, 5)), 'loss');
check('10% sa 12 ay pula', name(tint(10, 12)), 'loss');
check('41% sa 20 ay accent', name(tint(41, 20)), 'accent');
check('50% sa 20 ay berde', name(tint(50, 20)), 'win');
check('100% sa 12 ay berde', name(tint(100, 12)), 'win');

console.log('\nMaliit na sample ay hindi sumisigaw:');
check('100% sa 1 ay muted', name(tint(100, 1)), 'muted');
check('100% sa 2 ay muted', name(tint(100, 2)), 'muted');
check('100% sa 3 ay berde na', name(tint(100, 3)), 'win');
check('0% sa 1 ay muted, hindi pula', name(tint(0, 1)), 'muted');
check('walang rate ay muted', name(tint(null, 9)), 'muted');

console.log('\nGinagamit din ng calendar summary ang parehong function:');
/* Ang layunin ay "ang Calendar ay gumagamit ng IBINABAHAGING function, hindi
   ng sariling kopya" — hindi ang eksaktong pangalan. Nadagdagan ito ng RR
   (_winRateTintRR), at ang RR na bersyon ay tumatawag pa rin ng _winRateTint
   kapag walang RR na naitala, kaya buhay pa rin ang bandang sinusuri dito. */
check('nakadikit sa ibinabahaging function',
  /const rateColor = _winRateTintRR\(winPct, avgRR, winTrades \+ lossTrades\)/.test(js), true);
check('at ang RR na bersyon ay bumabalik dito kapag walang RR',
  /if\(be === null\) return _winRateTint\(rate, count\);/.test(js), true);
// The matrix no longer shows a rate at all, so it no longer tints by one — its
// colour comes straight from wins vs losses.
//
// Ang Confluence Edge matrix at ang pooled table ay tinanggal na kasama ng
// panel, kaya wala nang assertion dito tungkol sa kanila. Buhay pa ang dalawang
// helper — ang mga tumatawag na lang ang naiba.
check('buhay pa ang _winRateTint', /function _winRateTint\(/.test(js), true);
check('buhay pa ang _sequenceTint', /function _sequenceTint\(/.test(js), true);
check('may tumatawag pa sa _winRateTint',
  (js.match(/(?<![\w.])_winRateTint\s*\(/g) || []).length > 1, true);
check('may tumatawag pa sa _sequenceTint',
  (js.match(/(?<![\w.])_sequenceTint\s*\(/g) || []).length > 1, true);

// Ang seksyon tungkol sa .cfe-subhead ay tinanggal: kasama ng Confluence Edge
// panel ang CSS na 'yon. Ang dalawang tint helper ay buhay pa at nasa itaas.

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
