const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Regression guard: the calendar buckets by CLOSE date, matching every other
// money figure in the app (Max Daily Loss, Profitable Days, Salary Goal) and
// the convention TradeZella documents. Runs the real bucketing loop.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

// Pull just the bucketing block out of renderCalendar, so this exercises the
// shipped code rather than a copy of it.
const fnStart = js.indexOf('function renderCalendar(');
const blockStart = js.indexOf('const byDay = {};', fnStart);
const blockEnd = js.indexOf('});', js.indexOf('byDay[key].trades.push(t);', blockStart)) + 3;
const BLOCK = js.slice(blockStart, blockEnd);

const D = s => new Date(s);
const TRADES = [
  { id:1, account:'5K',  open_date:D('2026-08-19T15:53'), close_date:D('2026-08-19T18:17'), profit_loss:591.36, fee:6.44 },
  // opened Aug 31 late, closed Sep 1 — belongs to SEPTEMBER
  { id:2, account:'5K',  open_date:D('2026-08-31T23:40'), close_date:D('2026-09-01T01:15'), profit_loss:-120,   fee:2 },
  // opened Jul 31, closed Aug 1 — belongs to AUGUST
  { id:3, account:'5K',  open_date:D('2026-07-31T22:10'), close_date:D('2026-08-01T03:00'), profit_loss:80,     fee:1 },
  // still open — must not appear anywhere
  { id:4, account:'5K',  open_date:D('2026-08-12T09:00'), close_date:null,                  profit_loss:0,      fee:0 },
];

function run(year, month, filtered){
  const scope = {
    FILTERED: filtered,
    netPnl: t => (t.profit_loss||0) - (t.fee||0),
    y: year, m: month,
  };
  return new Function(...Object.keys(scope), BLOCK + ' return { byDay, monthTrades };')
    (...Object.values(scope));
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + got + (ok ? '' : '   <-- ' + want));
};

console.log('Agosto 2026');
const aug = run(2026, 7, TRADES);
Object.entries(aug.byDay).sort((a,b)=>a[0]-b[0]).forEach(([d,v]) =>
  console.log('   Ago ' + String(d).padStart(2) + ' : ' +
    v.trades.map(t=>'#'+t.id).join(', ').padEnd(8) + v.pnl.toFixed(2)));

check('id 3 nasa Ago 1 (sara), hindi Hul 31', !!(aug.byDay[1] && aug.byDay[1].trades.some(t=>t.id===3)), true);
check('id 2 WALA sa Agosto (sara Set 1)', !!aug.byDay[31], false);
check('id 4 na bukas pa ay hindi lumalabas', aug.monthTrades.some(t=>t.id===4), false);
check('bilang sa Agosto', aug.monthTrades.length, 2);

console.log('\nSetyembre 2026');
const sep = run(2026, 8, TRADES);
check('id 2 lumilitaw sa Set 1', !!(sep.byDay[1] && sep.byDay[1].trades.some(t=>t.id===2)), true);
check('bilang sa Setyembre', sep.monthTrades.length, 1);

console.log('\nGumagalang sa FILTERED (kung saan naka-apply ang account/month filter)');
const only5k = run(2026, 7, TRADES.filter(t => t.id !== 3));
check('naalis ang id 3 kapag wala sa FILTERED', only5k.monthTrades.length, 1);

console.log('\nAng grid ay dapat tumugma sa mga bilang ng account:');
console.log('  Max Daily Loss   _dayKeyUTC(t.close_date)   pareho');
console.log('  Profitable Days  _dayKeyUTC(t.close_date)   pareho');
const usesClose = /FILTERED\.forEach[\s\S]{0,200}t\.close_date\.getDate\(\)/.test(BLOCK);
check('close_date pa rin ang gamit ng calendar', usesClose, true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
