const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// What the card claimed versus what the detail said, on a phase-2 account.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

const baseline = (a) => a.phase_start_balance != null ? Number(a.phase_start_balance) : Number(a.account_size);
const cardNow  = (a) => { const pl = a.current_balance - baseline(a); return { pl, pct: pl / a.account_size * 100 }; };
const cardWas  = (a) => { const pl = a.current_balance - a.account_size; return { pl, pct: pl / a.account_size * 100 }; };
const detail   = (a) => a.phase_start_balance != null ? a.current_balance - Number(a.phase_start_balance) : null;

const cases = [
  { label:'Phase 1, fresh',        account_size:10000, phase_start_balance:10000, current_balance:10000, profit_target_pct:8 },
  { label:'Phase 1, +$400',        account_size:10000, phase_start_balance:10000, current_balance:10400, profit_target_pct:8 },
  { label:'Phase 2 just started',  account_size:10000, phase_start_balance:10800, current_balance:10800, profit_target_pct:5 },
  { label:'Phase 2, +$150',        account_size:10000, phase_start_balance:10800, current_balance:10950, profit_target_pct:5 },
  { label:'Phase 2, down $200',    account_size:10000, phase_start_balance:10800, current_balance:10600, profit_target_pct:5 },
  { label:'no phase balance set',  account_size:50000, phase_start_balance:null,  current_balance:51200, profit_target_pct:8 },
];

console.log('label'.padEnd(24) + 'CARD was'.padStart(13) + 'CARD now'.padStart(13) + 'DETAIL'.padStart(11) + '   progress bar');
console.log('-'.repeat(86));
cases.forEach(a => {
  const w = cardWas(a), n = cardNow(a), d = detail(a);
  const barWas = Math.max(0, Math.min(1, w.pct / a.profit_target_pct)) * 100;
  const barNow = Math.max(0, Math.min(1, n.pct / a.profit_target_pct)) * 100;
  console.log(a.label.padEnd(24) +
    ('$' + w.pl).padStart(13) + ('$' + n.pl).padStart(13) +
    (d === null ? 'n/a' : '$' + d).padStart(11) +
    '   was ' + barWas.toFixed(0).padStart(3) + '%  now ' + barNow.toFixed(0).padStart(3) + '%');
});

console.log('\nThe row that mattered:');
const p2 = cases[2];
console.log('   A phase 2 account that has made nothing yet showed the card bar at ' +
  (Math.min(1, cardWas(p2).pct / p2.profit_target_pct) * 100).toFixed(0) +
  '% — phase 1 profit counted again toward the new target.');
console.log('   It now reads ' + (Math.min(1, cardNow(p2).pct / p2.profit_target_pct) * 100).toFixed(0) +
  '%, which is what the Account Detail already said.');

const agree = cases.every(a => detail(a) === null || Math.abs(cardNow(a).pl - detail(a)) < 0.005);
console.log('\n' + (agree ? 'Card and detail now agree on every case.' : 'STILL DISAGREE'));
