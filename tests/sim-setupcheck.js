const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
    // Ang Setup Check. Ang mahalaga dito ay ang mga HANGGANAN ng tatlong bintana —
// ang "this month" ay dapat hindi umabot sa nakaraan, at ang "last 90 days" ay
// gumugulong mula ngayon kaya SADYANG nagsasapawan ito sa dalawa.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fn(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('missing function ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
const line = n => { const m = new RegExp('const ' + n + '\\s*=[^\\n]*').exec(js); return m[0]; };

let OUT = '';
const els = {
  setupCheckBody: { set innerHTML(v){ OUT = v; } },
  scSetup:  { value:'15 mins HL', innerHTML:'' },
  scSymbol: { value:'all', innerHTML:'' },
  setupCheckModal: { classList:{ add(){}, remove(){} } },
};
const doc = { getElementById: id => els[id] || null };

function render(all, setup, sym){
  els.scSetup.value = setup ?? '15 mins HL';
  els.scSymbol.value = sym ?? 'all';
  OUT = '';
  new Function('document','ALL_TRADES','netPnl','escapeHtml','fmtMoney','fmtNum',
               '_isWin','_isLoss', `
    ${line('EM_MIN_N')}
    ${line('EM_MIN_GAP')}
    ${line('_isBE')}
    /* Kinuha nang buo mula sa dashboard.js, hindi ginaya. Sa Node ay walang
       localStorage, kaya ang try/catch sa loob ng _realMoneyOnly ay nahuhuli ang
       ReferenceError at nagbabalik ng false — "naka-off ang Real money", na
       siyang estadong sinusuri ng sim na ito. Kung magbabago ang kahulugan ng
       pagsala doon, dito rin ito magbabago sa halip na tahimik na maiwan. */
    ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
    ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
    ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
    ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
    ${fn('_tagArmStats')}
    ${fn('_winRateOf')}
    ${fn('_scWindows')}
    ${fn('renderSetupCheck')}
    renderSetupCheck();
  `)(doc, all, t => (t.profit_loss || 0) - (t.fee || 0), s => String(s ?? ''),
     n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2),
     (n, d) => Number(n).toFixed(d),
     t => t.win_loss === 'Win', t => t.win_loss === 'Loss');
  return OUT;
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) + got + (ok ? '' : '   <-- ' + want));
};

const NOW = new Date();
const daysAgo = n => new Date(NOW.getTime() - n * 864e5);
const T = (when, wl, extra) => ({ close_date: when, win_loss: wl, profit_loss: wl === 'Win' ? 100 : -50,
  fee: 0, pattern_type: '15 mins HL', symbol: 'BTC/USD', ...extra });

// Isang trade sa bawat bintana, na may natatanging petsa.
const thisMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 1, 12);
const prevMonth = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15, 12);
const wayBack   = daysAgo(200);

console.log('1. ANG TATLONG BINTANA\n');
const winOf = (h, key) => {
  const seg = h.slice(h.indexOf(key));
  const m = /sc-w-rate">([^<]*)</.exec(seg);
  return m ? m[1] : '(wala)';
};
const nOf = (h, key) => {
  const seg = h.slice(h.indexOf(key));
  const m = /<dt>Trades<\/dt><dd>(\d+)<\/dd>/.exec(seg);
  return m ? +m[1] : -1;
};

let h = render([
  T(thisMonth, 'Win'), T(thisMonth, 'Win'), T(thisMonth, 'Loss'),
  T(prevMonth, 'Loss'), T(prevMonth, 'Loss'),
  T(wayBack,  'Win'),
]);
console.log('   This month     ' + winOf(h, 'This month') + '   ' + nOf(h, 'This month') + ' trades');
console.log('   Previous month ' + winOf(h, 'Previous month') + '   ' + nOf(h, 'Previous month') + ' trades');
console.log('   Last 90 days   ' + winOf(h, 'Last 90 days') + '   ' + nOf(h, 'Last 90 days') + ' trades');
check('this month: 3 trade', nOf(h, 'This month'), 3);
check('this month: 2 sa 3 = 67%', winOf(h, 'This month'), '67%');
check('previous month: 2 trade', nOf(h, 'Previous month'), 2);
check('previous month: 0%', winOf(h, 'Previous month'), '0%');
// Ang 90 araw ay SUMASAPAW sa dalawa — 5 ito, hindi 0, at hindi rin 6.
check('90 araw: 5, sumasapaw sa dalawang buwan', nOf(h, 'Last 90 days'), 5);
check('hindi kasama ang 200 araw ang tanda', nOf(h, 'Last 90 days') < 6, true);

console.log('\n2. ANG HANGGANAN — hindi tumatagas ang buwan\n');
// Huling segundo ng nakaraang buwan at unang segundo ng kasalukuyan.
const lastTick  = new Date(NOW.getFullYear(), NOW.getMonth(), 1, 0, 0, 0);
const justBefore = new Date(lastTick.getTime() - 1000);
h = render([T(justBefore, 'Win'), T(lastTick, 'Loss')]);
check('ang isang segundo bago -> previous', nOf(h, 'Previous month'), 1);
check('ang unang segundo -> this month', nOf(h, 'This month'), 1);
check('walang nabibilang nang dalawang beses sa dalawang buwan',
  nOf(h, 'This month') + nOf(h, 'Previous month'), 2);

console.log('\n3. SINASALA ANG SETUP AT ANG SYMBOL\n');
const MIX = [
  T(thisMonth, 'Win'),
  T(thisMonth, 'Win',  { pattern_type:'5 mins HL' }),
  T(thisMonth, 'Loss', { symbol:'ETH/USD' }),
];
h = render(MIX, '15 mins HL', 'all');
check('setup lang ang binibilang', nOf(h, 'This month'), 2);
h = render(MIX, '15 mins HL', 'BTC/USD');
check('pati symbol kapag pinili', nOf(h, 'This month'), 1);
h = render(MIX, '5 mins HL', 'all');
check('ibang setup, sariling bilang', nOf(h, 'This month'), 1);

console.log('\n4. ANG HATOL\n');
// 9 sa 12 (75%) sa 90 araw, laban sa 33% na kabuuang average -> maganda.
const good = [
  ...Array.from({length:9}, (_, i) => T(daysAgo(i + 1), 'Win')),
  ...Array.from({length:3}, (_, i) => T(daysAgo(i + 10), 'Loss')),
  // Ibang setup na masama, para bumaba ang pangkalahatang average.
  ...Array.from({length:20}, (_, i) => T(daysAgo(i + 1), 'Loss', { pattern_type:'5 mins LH' })),
];
h = render(good, '15 mins HL', 'all');
const verdict = (/sc-verdict (\w+)">([\s\S]*?)<\/div>/.exec(h) || [,'?','']);
console.log('   ' + verdict[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
check('berde', verdict[1], 'good');
check('sinasabing maganda', /Good setup for you/.test(h), true);
check('binabanggit ang sariling average', /against your \d+% average/.test(h), true);

console.log('\n   Kapag masama:');
const bad = [
  ...Array.from({length:2},  (_, i) => T(daysAgo(i + 1), 'Win')),
  ...Array.from({length:10}, (_, i) => T(daysAgo(i + 5), 'Loss')),
  ...Array.from({length:20}, (_, i) => T(daysAgo(i + 1), 'Win', { pattern_type:'5 mins LH' })),
];
h = render(bad, '15 mins HL', 'all');
check('pula', (/sc-verdict (\w+)/.exec(h) || [,'?'])[1], 'bad');
check('sinasabing hindi umuubra', /This one is not working/.test(h), true);

console.log('\n   Kapag kulang ang datos:');
h = render([T(daysAgo(3), 'Win'), T(daysAgo(4), 'Loss')], '15 mins HL', 'all');
check('naghihintay', (/sc-verdict (\w+)/.exec(h) || [,'?'])[1], 'wait');
check('sinasabi kung ilan ang kulang', /Too few to read/.test(h), true);

h = render([T(wayBack, 'Win')], '15 mins HL', 'all');
check('walang trade sa 90 araw', /No <b>15 mins HL<\/b> trades in the last 90 days/.test(h), true);

console.log('\n5. HINDI SUMUSUNOD SA FILTER NG DASHBOARD\n');
// Sinasadya: binabasa nito ang ALL_TRADES. Ang tala ng isang setup ay hindi
// dapat magbago dahil lang sa buwan na tinitingnan mo.
const src = fn('renderSetupCheck');
check('binabasa ang ALL_TRADES', /ALL_TRADES\.filter/.test(src), true);
check('hindi binabasa ang FILTERED', /\bFILTERED\b/.test(src), false);
check('sinasabi nito sa footer', /the dashboard&#x27;s year and month filters are|dashboard's year and month filters are/.test(h), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
