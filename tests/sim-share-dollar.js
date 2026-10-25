// Share images: the $ amount must keep its "$" (it was lost once by a
// String.replace that turned "$$" into "$"). Runs the real _drawWeekShare
// valOf maths through a tiny check on the source.
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const js = require('fs').readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
let fail = 0;
const ok = (l, c, x) => { if(!c) fail++; console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + (x || '')); };
const n = (js.match(/md === 'usd' \? `\$\{sign\(s\.net\)\}\$\$\{Math\.abs\(s\.net\)/g) || []).length;
ok('week / month / year: "$" before the amount', n === 3, n + ' of 3');
ok('month total: "$" before the amount', /mode === 'usd' \? `\$\{sign\(net\)\}\$\$\{Math\.abs\(net\)/.test(js));
ok('Share week title is "Week N - Month Year"', /`Week \$\{_weekShare\.weekNo \|\| 1\} - /.test(js));
console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
