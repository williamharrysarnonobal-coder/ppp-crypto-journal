const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Two things: does the 0.5% ceiling warn at the right point, and does the
// auto-adjust to max leverage already work the way he remembers?
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name) {
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const api = new Function('fmtNum', '_leverageTint', `
  ${fnBody('_psRiskCeiling')}
  ${fnBody('_psRiskCeilingNote')}
  ${fnBody('_psMinLeverage')}
  ${fnBody('_psComputeRow')}
  return { ceiling:_psRiskCeiling, note:_psRiskCeilingNote, row:_psComputeRow };
`)((n,d) => Number(n).toFixed(d), () => 'currentColor');

const accounts = [
  { id:1, account_name:'Upscale 50K', account_size:50000, current_balance:50000, max_leverage:5 },
  { id:2, account_name:'Upscale 10K', account_size:10000, current_balance:10000, max_leverage:5 },
  { id:3, account_name:'Upscale 5K',  account_size:5000,  current_balance:5000,  max_leverage:5 },
];

console.log('=== ang 0.5% na hangganan kada account');
accounts.forEach(a => {
  const c = api.ceiling(a);
  console.log('   ' + a.account_name.padEnd(14) + '$' + c.amount.toFixed(2).padStart(9) + '   (' + c.pct + '% ng $' + a.account_size.toLocaleString() + ')');
});

console.log('\n=== kailan nagbabala');
const acc50 = accounts[0];
[200, 230, 250, 250.01, 300].forEach(r => {
  const note = api.note(acc50, r);
  console.log('   risk $' + String(r).padEnd(8) + (note ? 'BABALA  ' + note.replace(/<[^>]+>/g,'') : 'ok, nasa loob ng limit'));
});

console.log('\n=== auto-adjust sa 5x — gumagana na ba?');
// A tight stop needs a huge position: entry 64,000, SL 63,960 -> $40 per unit.
const scenarios = [
  { label:'malapad na SL (kasya)',  entry:64000, riskPerUnit:640, risk:230 },
  { label:'masikip na SL (hindi)',  entry:64000, riskPerUnit:40,  risk:230 },
  { label:'sobrang sikip',          entry:64000, riskPerUnit:8,   risk:230 },
];
scenarios.forEach(s => {
  const c = api.row(acc50, s.risk, s.entry, s.riskPerUnit);
  console.log('   ' + s.label.padEnd(24) +
    'hiningi $' + s.risk +
    '  ->  ginamit $' + (c.effRisk === null ? '—' : c.effRisk.toFixed(2)).padStart(8) +
    '   qty ' + (c.qty === null ? '—' : c.qty.toFixed(4)).padStart(9) +
    '   lev ' + (c.minLev === null ? '—' : c.minLev + 'x') +
    (c.capped ? '   ← inadjust' : ''));
});

console.log('\n   Ang maxRisk ay (balanse x 0.995 x 5) x riskPerUnit / entry.');
const c = api.row(acc50, 230, 64000, 40);
console.log('   Sa masikip na SL: ' + '(50,000 x 0.995 x 5) x 40 / 64,000 = $' + c.maxRisk.toFixed(2));
console.log('   Kaya ibinaba ang $230 papuntang $' + c.effRisk.toFixed(2) + ' — ito ang kaya talaga ng account sa 5x.');

console.log('\n=== ang dalawang babala ay magkaiba');
const tight = api.row(acc50, 400, 64000, 40);
console.log('   margin cap (kaya ba)   : ' + (tight.capped ? 'oo, ibinaba sa $' + tight.effRisk.toFixed(2) : 'hindi'));
console.log('   0.5% ceiling (dapat ba): ' + (api.note(acc50, 400) ? 'oo, lagpas sa $250' : 'hindi'));
console.log('   Ang una ay awtomatikong nag-aadjust. Ang pangalawa ay nagbabala lang —');
console.log('   hindi ko binababa nang tahimik, dahil desisyon mo iyon.');
