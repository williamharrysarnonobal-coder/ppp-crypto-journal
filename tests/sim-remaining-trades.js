const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* REMAINING TRADES — ang The5ers 100K na nagpakita ng 9,740.
   Ang bagong account na kulang sa 3 talo ay dapat gumamit ng sarili nitong
   planned risk, hindi ng average ng talo ng ibang (mas maliliit) account. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function fnBlock(name){
  const m = new RegExp('function ' + name + '\\s*\\(').exec(js);
  let d = 0, start = js.indexOf('{', m.index);
  for (let j = start; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1); }
  }
}
let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

const make = (ALL_TRADES, PROFILE_DATA) => new Function('ALL_TRADES', 'PROFILE_DATA',
  'const netPnl = t => t.pnl; const _isLoss = t => t.pnl < 0;\n' +
  fnBlock('_accountLossSize') + '\nreturn _accountLossSize;')(ALL_TRADES, PROFILE_DATA);

// Ibang account: 5K na may maraming ~$93 na talo.
const others = Array.from({length: 20}, () => ({ account: '5K', pnl: -93 }));
const five = { account_name: 'The5ers 100K', account_size: 100000, risk_per_trade_pct: 0.4 };

let f = make(others, {});
let r = f(five);
ok('bagong 100K: planned $400, hindi $93', r.size === 400, String(r.size));
ok('basis nagsasabing planned risk', /planned 0.4%/.test(r.basis), r.basis);
ok('room $10,000 → 25 talo', Math.floor(10000 / r.size) === 25, String(Math.floor(10000 / r.size)));

// Dalawang talo lang sa account: planned pa rin.
f = make(others.concat([{account:'The5ers 100K', pnl:-380},{account:'The5ers 100K', pnl:-420}]), {});
ok('2 sariling talo: planned pa rin', f(five).size === 400, String(f(five).size));

// Tatlo: sariling average.
f = make(others.concat([-300,-400,-500].map(p => ({account:'The5ers 100K', pnl:p}))), {});
ok('3 sariling talo: average nila', f(five).size === 400 && /3 losing trades on this account/.test(f(five).basis), f(five).basis);

// Walang risk %: Profile default.
f = make(others, { risk_per_trade: 0.5 });
ok('walang account risk: Profile 0.5% = $500', f({ account_name: 'X', account_size: 100000 }).size === 500);

// Walang laki at walang balance: lahat ng talo.
f = make(others, {});
ok('walang size: average ng lahat', f({ account_name: 'X' }).size === 93);

// Ang save guard.
ok('saveAccount humaharang sa 1.5× / 0.5×', /_farFromSize/.test(js) && /extra or missing zero/.test(js));
ok('ang edit ay nagre-reset ng maling phase start', /payload\.phase_start_balance = payload\.account_size/.test(js));
ok('Ask my data gumagamit ng parehong helper', (js.match(/_accountLossSize\(a\)/g) || []).length >= 2);

// "nilagay ko 98015 tapos lumalabas $98,822.41" — ang itinype ang masusunod.
ok('ang itinype na balanse ang headline',
   /const currentBalance = manualBalance != null \? manualBalance : journalBalance;/.test(js));
ok('ang (+$X) ay mula sa parehong balanse',
   /const totalEarn = currentBalance - phaseBaseline;/.test(js));
ok('ang note ay nagpapakita ng journal', /Your journal adds up to/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
