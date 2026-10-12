const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG WIN RATE KASAMA ANG RR.

   Ang win rate mag-isa ay hindi nagsasabi kung kumikita ka. Ang hangganan ay
   hindi opinyon — kinakalkula ito: breakeven = 1 / (1 + RR). Ang pagsubok ay
   hindi "may kulay ba" kundi TAMA BA ang kulay para sa matematika. */
const fs = require('fs');
const js = fs.readFileSync(
  __ROOT + '/js/dashboard.js', 'utf8');
function fn(n){
  const i = js.indexOf('function ' + n + '(');
  if(i < 0) throw new Error('missing ' + n);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
const api = new Function('fmtNum', `
  ${(js.match(/const WIN_RATE_STRONG[^\n]*/) || [''])[0]}
  ${(js.match(/const WR_MARGIN_STRONG[^\n]*/) || [''])[0]}
  ${fn('_winRateTint')}
  ${fn('_breakevenWinRate')}
  ${fn('_winRateTintRR')}
  ${fn('_winRateWhy')}
  return { _breakevenWinRate, _winRateTintRR, _winRateWhy };
`)((n, d) => Number(n).toFixed(d));

let fail = 0;
const check = (ok, label, detail) => { if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(44) + (detail ?? '')); };
const tone = c => c.includes('--win') ? 'berde' : c.includes('--accent') ? 'kahel'
           : c.includes('--loss') ? 'pula' : 'abo';

console.log('1. ANG BREAKEVEN — 1 / (1 + RR)\n');
[[1, 50], [1.5, 40], [2, 100/3], [3, 25], [4, 20]].forEach(([rr, want]) => {
  const got = api._breakevenWinRate(rr);
  check(Math.abs(got - want) < 0.01, 'RR 1:' + rr + ' -> ' + want.toFixed(1) + '%',
    got.toFixed(1) + '%');
});

console.log('\n2. ANG HALIMBAWA NIYA: RR 1:2, win rate 40%\n');
{
  const c = api._winRateTintRR(40, 2, 20);
  check(tone(c) === 'berde', 'BERDE, gaya ng sinabi niya', tone(c));
  console.log('        ' + api._winRateWhy(40, 2, 20));
}

console.log('\n3. ANG PAREHONG 40% SA IBANG RR\n');
/* Sa RR 1:1.5 ang breakeven ay EKSAKTONG 40.0%, kaya ang 40% ay nasa mismong
   linya — hindi ito lugi, patas lang. Kahel iyon, hindi pula. Inaasahan kong
   pula ito at mali ako: ang pula ay para sa lugi, at ang eksaktong breakeven
   ay hindi lugi. */
[[1, 'pula'], [1.5, 'kahel'], [2, 'berde'], [3, 'berde']].forEach(([rr, want]) => {
  const t = tone(api._winRateTintRR(40, rr, 20));
  check(t === want, '40% sa RR 1:' + rr + ' -> ' + want, t);
});

console.log('\n4. ANG TATLONG BANDA SA RR 1:1\n');
[[60,'berde'], [55,'berde'], [52,'kahel'], [50,'kahel'], [45,'pula']].forEach(([wr, want]) => {
  const t = tone(api._winRateTintRR(wr, 1, 20));
  check(t === want, wr + '% sa RR 1:1 -> ' + want, t);
});

console.log('\n5. WALANG RR — bumabalik sa lumang banda\n');
[[60,'berde'], [41,'kahel'], [30,'pula']].forEach(([wr, want]) => {
  const t = tone(api._winRateTintRR(wr, null, 20));
  check(t === want, wr + '% na walang RR -> ' + want, t);
});
check(/No RR recorded/.test(api._winRateWhy(41, null, 20)),
  'sinasabi nitong walang RR', '');

console.log('\n6. KULANG NA DATOS — abo, hindi hatol\n');
check(tone(api._winRateTintRR(100, 3, 2)) === 'abo', '2 trade lang -> abo',
  tone(api._winRateTintRR(100, 3, 2)));
check(tone(api._winRateTintRR(null, 2, 0)) === 'abo', 'walang decided -> abo',
  tone(api._winRateTintRR(null, 2, 0)));

console.log('\n' + (fail ? fail + ' MALI' : 'tama ang matematika'));
process.exit(fail ? 1 : 0);
