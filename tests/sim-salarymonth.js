const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* NAGKAKASUNDO BA ANG PAYSLIP AT ANG CALENDAR TUNGKOL SA PAREHONG TRADE?

   Ang Payslip vs P&L lang ang naghahati ng buwan sa UTC; ang lahat ng iba ay
   lokal. Sa UAE (UTC+4) ang bawat trade na nagsara sa pagitan ng hatinggabi at
   alas-kuwatro ay nasa NAUNANG araw sa UTC, at kung ika-1 ng buwan iyon, sa
   naunang BUWAN.

   Kaya ang pagsubok ay isang trade na eksaktong nasa hangganan: 2am ng ika-1.
   Ang Calendar ay dapat maglagay nito sa Setyembre; ang Payslip ay dapat
   Setyembre rin. Bago ang pagbabago ay Agosto ito rito. */
const fs = require('fs');
const js = fs.readFileSync(
  __ROOT + '/js/dashboard.js', 'utf8');

function fn(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('missing ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

const api = new Function('ALL_TRADES', 'netPnl', `
  ${fn('_dayKeyLocal')}
  ${fn('_salaryMonthKey')}
  ${fn('_salaryMonthLabel')}
  ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
  ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
  ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
  ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
  ${fn('_salaryTrades')}
  ${fn('_salaryDayAndMonthBuckets')}
  ${fn('_salaryMonthsPresent')}
  return { _salaryMonthKey, _salaryDayAndMonthBuckets, _salaryMonthsPresent, _salaryMonthLabel };
`);

/* Ang oras ng makina ang nagtatakda ng "lokal". Sa UAE ay UTC+4; kung sa ibang
   zone tumakbo ang pagsubok, ibang trade ang nasa hangganan. Kaya ang trade ay
   binubuo mula sa LOKAL na bahagi para tumpak ang pagsubok saanman ito tumakbo:
   2am lokal ng ika-1 ng Setyembre. */
const T = (localDate, pl) => ({ close_date: localDate, profit_loss: pl, fee: 0,
                                account_type: 'Funded', win_loss: 'Win' });
const boundary = new Date(2026, 8, 1, 2, 0, 0);     // Set 1, 2:00am LOKAL
const midMonth = new Date(2026, 8, 15, 12, 0, 0);   // Set 15, tanghali

const trades = [T(boundary, 500), T(midMonth, 300)];
const A = api(trades, t => (t.profit_loss || 0) - (t.fee || 0));

const off = -new Date().getTimezoneOffset() / 60;
console.log('Time zone ng makina: UTC' + (off >= 0 ? '+' : '') + off);
console.log('Trade sa hangganan  : ' + boundary.toString().slice(0, 24));
console.log('  ... sa UTC        : ' + boundary.toISOString().slice(0, 16) + 'Z\n');

const { dayKeys, monthOfDay } = A._salaryDayAndMonthBuckets();
const months = A._salaryMonthsPresent(monthOfDay);

// Ang Calendar: lokal na taon at buwan, diretso.
const calMonthOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

/* Ang LUMANG lohika, para makita kung ano talaga ang naayos. Hindi ito
   panghula — ito ang eksaktong linyang nasa file dati. */
console.log('ANG LUMANG LOHIKA (UTC) SA PAREHONG TRADE\n');
{
  const oldKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  const oldMonth = oldKey(boundary);
  const calMonth = `${boundary.getFullYear()}-${String(boundary.getMonth()+1).padStart(2,'0')}`;
  console.log('   Calendar : ' + calMonth);
  console.log('   Payslip (luma) : ' + oldMonth);
  check('MALI nga ang luma — hindi tugma', oldMonth === calMonth, false);
}

console.log('\nBUWAN NG BAWAT TRADE\n');
[boundary, midMonth].forEach((d, i) => {
  const cal = calMonthOf(d);
  const key = A._salaryMonthKey(d);
  check('trade ' + (i + 1) + ': Payslip = Calendar', key, cal);
});

console.log('\nKABUUAN NG BUWAN\n');
const sept = '2026-09';
const salNet = Object.keys(dayKeys)
  .filter(k => monthOfDay[k] === sept)
  .reduce((s, k) => s + dayKeys[k], 0);
const calNet = trades.filter(t => calMonthOf(t.close_date) === sept)
  .reduce((s, t) => s + t.profit_loss, 0);
check('Setyembre: pareho ang kabuuan', salNet, calNet);
check('isang buwan lang ang nabuo', months.length, 1);
check('at Setyembre iyon', months[0], sept);

console.log('\nBILANG NG ARAW NA MAY TRADE\n');
const salDays = Object.keys(dayKeys).filter(k => monthOfDay[k] === sept).length;
const calDays = new Set(trades.filter(t => calMonthOf(t.close_date) === sept)
  .map(t => t.close_date.getDate())).size;
check('pareho ang bilang ng araw', salDays, calDays);

/* At ang huling tanong, na siyang tunay na panuntunan: may natirang UTC pa ba
   sa pahinang ito? Ang My Accounts ay UTC nang sadya — panuntunan ng prop firm
   iyon — pero ang Payslip ay hindi na dapat. */
console.log('\nWALA NA BANG UTC SA PAHINA NG SAHOD?\n');
const salaryFns = ['_salaryMonthKey', '_salaryMonthLabel', '_salaryDayAndMonthBuckets'];
salaryFns.forEach(name => {
  const body = fn(name);
  check(name.padEnd(30) + ' ay lokal', /getUTC|_dayKeyUTC|Date\.UTC|timeZone:'UTC'/.test(body), false);
});
// At ang My Accounts ay UTC pa rin, dahil doon ay tama ito.
const accStats = fn('computeAccountStats');
check('computeAccountStats ay UTC pa rin', /_dayKeyUTC/.test(accStats), true);

console.log('\n' + (fail ? fail + ' MALI' : 'magkasundo ang dalawang pahina'));
process.exit(fail ? 1 : 0);
