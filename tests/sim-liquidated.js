const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// What a liquidation being invisible actually cost, panel by panel.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

const helpers = /const LOSS_RESULTS = new Set\(\[[^\]]*\]\);[\s\S]*?const _isWin\s*=[^;]*;/.exec(js)[0];
function fnBody(name) {
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
const api = new Function(helpers + '\n' + fnBody('_winRateOf') +
  '\nreturn { isLoss:_isLoss, isWin:_isWin, winRate:_winRateOf };')();

const netPnl = t => (t.profit_loss || 0) - (t.fee || 0);

// 6 wins, 3 ordinary losses, 1 liquidation, 2 breakevens.
const trades = [
  ...Array(6).fill(0).map(() => ({ win_loss: 'Win', profit_loss: 100, fee: 2 })),
  ...Array(3).fill(0).map(() => ({ win_loss: 'Loss', profit_loss: -50, fee: 2 })),
  { win_loss: 'Liquidated', profit_loss: -400, fee: 5 },
  ...Array(2).fill(0).map(() => ({ win_loss: 'Breakeven', profit_loss: 0, fee: 2 })),
];

const oldLoss = t => String(t.win_loss).toLowerCase() === 'loss';

const stats = (lossTest, rateFn) => {
  const wins = trades.filter(t => String(t.win_loss).toLowerCase() === 'win');
  const losses = trades.filter(lossTest);
  const grossWin = wins.reduce((s, t) => s + netPnl(t), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + netPnl(t), 0));
  return {
    losses: losses.length,
    avgLoss: losses.length ? (grossLoss / losses.length) : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : Infinity,
    winRate: rateFn(trades)
  };
};

const before = stats(oldLoss, a => a.filter(t => String(t.win_loss).toLowerCase() === 'win').length / a.length * 100);
const after = stats(api.isLoss, api.winRate);

console.log('6 wins (+$98 each) · 3 losses (-$52) · 1 LIQUIDATION (-$405) · 2 breakevens\n');
console.log('metric'.padEnd(18) + 'before'.padStart(10) + 'after'.padStart(10) + '   what changed');
console.log('-'.repeat(70));
const row = (label, b, a, note) =>
  console.log(label.padEnd(18) + String(b).padStart(10) + String(a).padStart(10) + '   ' + note);
row('losses counted', before.losses, after.losses, 'the liquidation was invisible');
row('avg loss', '$' + before.avgLoss.toFixed(2), '$' + after.avgLoss.toFixed(2), 'understated by ' +
  (100 - before.avgLoss / after.avgLoss * 100).toFixed(0) + '%');
row('profit factor', before.profitFactor.toFixed(2), after.profitFactor.toFixed(2), 'looked ' +
  (before.profitFactor / after.profitFactor).toFixed(1) + 'x better than it was');
row('win rate', before.winRate.toFixed(1) + '%', after.winRate.toFixed(1) + '%', 'breakevens were counted as losses');

console.log('\n=== every call site now shares the helpers');
[['renderKPIs', 'losses feed avg loss + profit factor'],
 ['renderCalendar', 'month summary counts'],
 ['renderDisciplineRadar', 'risk-consistency spread'],
 ['buildSummaryForAI', 'what Claude is told'],
 ['renderTradeCards', 'the dot colour']].forEach(([fn, why]) => {
  const b = fnBody(fn) || '';
  const clean = !/win_loss[^\n]{0,40}===\s*'loss'/.test(b);
  console.log('   ' + (clean ? 'OK   ' : 'FAIL ') + fn.padEnd(23) + why);
});

const leftover = [...js.matchAll(/win_loss[^\n]{0,60}===\s*'loss'/g)];
console.log('\n   raw \'loss\' tests left in the file: ' + leftover.length);
leftover.forEach(m => {
  const n = js.slice(0, m.index).split(/\r?\n/).length;
  console.log('      line ' + n + '  ' + js.split(/\r?\n/)[n - 1].trim().slice(0, 92));
});
