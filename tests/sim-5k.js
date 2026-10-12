const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// His actual 5K card: Trade Balance $5,098.64 but Total Earn $61.47.
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

const acc = {
  account_name:'Upscale Trade 5K', account_type:'Prop Firm', account_size:5000,
  current_balance:5098.64, phase:'Evaluation Phase 1', phase_start_date:null,
  phase_start_balance:null, profit_target_pct:5, max_daily_loss_pct:5,
  max_total_drawdown_pct:10, min_trading_days:5, min_daily_profit_pct:0.5
};
// The journal only accounts for $61.47 of the $98.64 the balance shows.
const ALL_TRADES = [
  { account:'Upscale Trade 5K', close_date:new Date(2026,6,20), profit_loss:40,   fee:1 },
  { account:'Upscale Trade 5K', close_date:new Date(2026,7,3),  profit_loss:15.47,fee:0 },
  { account:'Upscale Trade 5K', close_date:new Date(2026,7,11), profit_loss:8,    fee:1 },
];

const api = new Function('ALL_TRADES','netPnl','_dayKeyUTC','_accountPreset', `
  ${fnBody('computeAccountStats')}
  return computeAccountStats;
`)(ALL_TRADES,
   t => (t.profit_loss||0) - (t.fee||0),
   d => new Date(d).toISOString().slice(0,10),
   () => null);

const s = api(acc);
const m = n => '$' + Number(n).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});

console.log('Upscale Trade 5K · balanse $5,098.64 · target 5%');
console.log('Sa journal: 3 trades, kabuuang net $61.47\n');

console.log('=== ang dalawang numero sa card');
console.log('   Trade Balance      : ' + m(s.currentBalance) + '   (+' + m(s.currentBalance - acc.account_size).slice(1) + ' sa $5,000)');
console.log('   Total Earn ngayon  : ' + m(s.totalEarn));
const agree = Math.abs(s.totalEarn - (s.currentBalance - acc.account_size)) < 0.005;
console.log('   ' + (agree ? 'PASS — magkatugma na sila' : 'FAIL — magkaiba pa rin'));

const oldWay = 61.47;   // dating fallback: sum ng trades
console.log('\n   dating Total Earn  : ' + m(oldWay) + '   <- galing sa journal, hindi sa balanse');
console.log('   pagkakaiba         : ' + m(s.currentBalance - acc.account_size - oldWay) + ' na hindi na-journal');

console.log('\n=== ang progress bar');
const pct = s.balanceRangeFraction * 100;
console.log('   stop ' + m(s.drawdownFloor) + '  ->  goal ' + m(s.profitGoal));
console.log('   laman ngayon       : ' + pct.toFixed(1) + '%');
const span = s.profitGoal - s.drawdownFloor;
const startPos = (acc.account_size - s.drawdownFloor) / span * 100;
console.log('   marka ng simula    : ' + startPos.toFixed(1) + '%   <- dito ka nagsimula, $5,000');
console.log('   ibig sabihin       : ' + (pct - startPos).toFixed(1) + ' puntos lang sa kanan ng simula');
console.log('\n   Kung walang marka, mukhang ' + pct.toFixed(0) + '% ka nang tapos.');
console.log('   May marka, kita mong katatapat mo pa lang ng simula.');

console.log('\n=== progress sa target');
console.log('   Total Earn / target: ' + m(s.totalEarn) + ' / ' + m(s.targetEarn) +
  '   = ' + (s.totalEarn / acc.account_size * 100).toFixed(2) + ' of 5%');
