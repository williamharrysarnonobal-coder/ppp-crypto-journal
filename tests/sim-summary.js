const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Run the REAL summary-strip builder out of renderCalendar and check the
// labels, the ordering, the win-rate band and the BE click target.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

// The strip block sits inside renderCalendar, between `const winTrades` and
// the closing of the else — pull exactly that.
const start = js.indexOf('const winTrades = monthTrades.filter(_isWin).length;');
/* Ang Win rate ang huling cell. Ang anchor ay ang PANGALAN lang, hindi ang
   buong tawag — dalawang beses nang nabasag ang sim na ito nang dagdagan ko
   ang cell na iyon ng title at ng bagong kulay. Ang pangalan ay hindi
   nagbabago; ang mga argumento ay palaging magbabago. */
const WR = js.indexOf("cell('Win rate'", start);
if(WR < 0) throw new Error('strip block not found');
const end = js.indexOf(');', js.indexOf('});', WR)) + 2;
if (start < 0 || end < start) throw new Error('strip block not found');
const BLOCK = js.slice(start, end);

// The strip now takes its win-rate colour from the shared _winRateTint, so the
// real one is pulled in rather than reimplemented — otherwise this test would
// pass against a copy that had drifted from the app.
function grabFn(name){
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
/* Ang buong pamilya ng win-rate tint, hindi lang ang isa. Kasama na ngayon ang
   RR sa kulay — ang 40% ay masama sa 1:1 at mahusay sa 1:2 — kaya tatlo pa ang
   kailangan. Kinukuha nang buo mula sa file, hindi ginagaya. */
const WRAPI = new Function('fmtNum',
  js.slice(js.indexOf('const WIN_RATE_STRONG'), js.indexOf('\n', js.indexOf('const WIN_RATE_STRONG'))) +
  (js.match(/const WR_MARGIN_STRONG[^\n]*/) || [''])[0] +
  grabFn('_winRateTint') + grabFn('_breakevenWinRate') +
  grabFn('_winRateTintRR') + grabFn('_winRateWhy') +
  ' return { _winRateTint, _breakevenWinRate, _winRateTintRR, _winRateWhy };')(
    (n, d) => Number(n).toFixed(d));
const _winRateTint = WRAPI._winRateTint;

function build(trades){
  const el = { innerHTML: '' };
  /* Every trade gets a close_date. In the app, monthTrades is BUILT by
     filtering on close_date, so one is always present — the fixtures here
     predate the Days-traded cell and left it off. Assigning deterministically
     (cycling 1..20) keeps the day count predictable and testable. */
  const dated = trades.map((t, i) => t.close_date ? t
    : { ...t, close_date: new Date(2026, 7, (i % 20) + 1) });
  const scope = {
    _winRateTint,
    _winRateTintRR: WRAPI._winRateTintRR,
    _winRateWhy: WRAPI._winRateWhy,
    monthTrades: dated,
    summaryEl: el,
    _isWin: t => String(t.win_loss||'').toLowerCase() === 'win',
    _isLoss: t => ['loss','liquidated'].includes(String(t.win_loss||'').toLowerCase()),
    _winRateOf: ts => {
      let w=0,d=0;
      ts.forEach(t=>{const v=String(t.win_loss||'').toLowerCase();
        if(v==='win'){w++;d++} else if(v==='loss'||v==='liquidated'){d++}});
      return d ? w/d*100 : null;
    },
    netPnl: t => (t.profit_loss||0) - (t.fee||0),
    /* Ang bagong cell na "Rules kept" ay tumatawag ng tatlong bagay na wala pa
       rito. Kinukuha ang dalawa mula mismo sa file para hindi kopya; ang cssVar
       ay isang token lang ng kulay at walang kahulugan sa Node. */
    _ruleTags: v => String(v || '').split(/[,;]/).map(s => s.trim()).filter(Boolean),
    _brokenRuleTags: v => String(v || '').split(/[,;]/).map(s => s.trim())
      .filter(s => s && s !== 'Rules Followed'),
    cssVar: n => 'var(' + n + ')',
    fmtMoney: n => (n<0?'−':'+') + '$' + Math.abs(n).toFixed(2),
    fmtNum: (n, d) => Number(n).toFixed(d),
    Set,
    Math, String, Number,
  };
  new Function(...Object.keys(scope), BLOCK)(...Object.values(scope));
  return el.innerHTML;
}

// His August: 23 win, 33 loss, 7 neither (5 breakeven + 2 blank).
// 23 x 100 = 2300 wins; the losses have to remove 834.08 to land on the real
// month total of +1,465.92 — 32 at -25 plus one carrying the remainder, so the
// fixture sums exactly instead of approximately.
const AUG = [
  ...Array.from({length:23}, () => ({win_loss:'Win',  profit_loss:100, fee:0})),
  ...Array.from({length:32}, () => ({win_loss:'Loss', profit_loss:-25, fee:0})),
  { win_loss:'Loss', profit_loss:-34.08, fee:0 },
  ...Array.from({length:5},  () => ({win_loss:'Breakeven', profit_loss:0, fee:0})),
  ...Array.from({length:2},  () => ({win_loss:'',          profit_loss:0, fee:0})),
];

const html = build(AUG);
const cells = [...html.matchAll(/<span class="cal-sum-k">(?:<i[^>]*><\/i>)?([^<]*)<\/span>\s*<span class="cal-sum-v"[^>]*>([^<]*)<\/span>/g)]
  .map(m => [m[1].trim(), m[2].trim()]);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(40) + got + (ok ? '' : '   <-- ' + want));
};

console.log('Ang strip, ayon sa pagkakasunod:\n');
cells.forEach(([k,v]) => console.log('  ' + k.padEnd(12) + v));

console.log('\nMga label na hiniling mo:');
check('unang cell ay Profit, hindi Agosto', cells[0][0], 'Profit');
check('Win, hindi Profit', cells[2][0], 'Win');
check('Loss', cells[3][0], 'Loss');
check('BE, hindi Undecided', cells[4][0], 'BE');
// Anim -> pito nang dumating ang Avg RR, pito -> walo nang dumating ang
// Days traded. Pareho silang nasa pagitan ng BE at ng Win rate.
// Siyam na: nadagdag ang "Rules kept" sa dulo — gaano ka ka-kulit sa buwan,
// katabi ng resulta nito.
check('siyam na cell', cells.length, 9);
/* ANG PAGKAKASUNOD. Ang Win rate ang konklusyon ng hilera at doon dumadapo ang
   mata sa dulo, kaya ito ang huli — nauuna ang Rules kept. Nasa dulo ang Rules
   kept noong idinagdag ko ito, kaya nasa gitna ang konklusyon. */
{
  const keys = [...html.matchAll(/cal-sum-k">(?:<i[^>]*><\/i>)?([^<]*)</g)].map(m => m[1].trim());
  console.log('   ' + keys.join(' · '));
  check('Win rate ang huli', keys[keys.length - 1], 'Win rate');
  check('Rules kept bago ito', keys[keys.length - 2], 'Rules kept');
}
check('Avg RR', cells[5][0], 'Avg RR');
check('Days traded', cells[6][0], 'Days traded');

console.log('\nMga halaga:');
check('Profit', cells[0][1], '+$1465.92');
check('Trades', cells[1][1], '63');
check('Win', cells[2][1], '23');
check('Loss', cells[3][1], '33');
check('BE', cells[4][1], '7');
// 63 na trade na naka-ikot sa 20 araw — 20 ang natatanging petsa.
check('Days traded', cells[6][1], '20');
check('Win rate', cells[8][1], '41%');

console.log('\nAng Days traded ay ARAW, hindi trade:');
// Sampung trade sa iisang araw ay ISANG araw, hindi sampu. Ito ang buong
// punto ng cell — may Trades cell na para sa bilang ng trade.
const oneDay = Array.from({length:10}, () => ({
  win_loss:'Win', profit_loss:10, fee:0, close_date:new Date(2026, 7, 3) }));
const od = build(oneDay);
const dayCell = [...od.matchAll(/<span class="cal-sum-k">([^<]*)<\/span>\s*<span class="cal-sum-v"[^>]*>([^<]*)</g)]
  .find(m => m[1].trim() === 'Days traded');
check('10 trade sa 1 araw -> 1', dayCell[2], '1');
check('at 10 pa rin ang Trades', /cal-sum-k">Trades<\/span>\s*<span class="cal-sum-v"[^>]*>10</.test(od), true);
check('sinasabi ng hover ang trades kada araw',
  /10\.0 trades on an average day you traded/.test(od), true);

console.log('\nKulay ng win rate — banda, hindi pass/fail sa 50:');
[[60,'--win'],[41,'--accent'],[30,'--loss']].forEach(([rate, want]) => {
  const set = [
    ...Array.from({length:rate}, () => ({win_loss:'Win', profit_loss:1, fee:0})),
    ...Array.from({length:100-rate}, () => ({win_loss:'Loss', profit_loss:-1, fee:0})),
  ];
  const h = build(set);
  const m = /Win rate<\/span>\s*<span class="cal-sum-v" style="color:var\((--[a-z]+)\)">/.exec(h);
  check(rate + '% -> ' + want, m ? m[1] : '(wala)', want);
});

console.log('\nAlin ang napipindot:');
['win','loss','be'].forEach(k =>
  check(k + ' napipindot', new RegExp("showMonthResultTrades\\('" + k + "'\\)").test(html), true));

const none = build(AUG.filter(t => ['Win','Loss'].includes(t.win_loss)));
check('BE hindi napipindot kapag 0', /showMonthResultTrades\('be'\)/.test(none), false);
check('may tuldok pa rin ang BE kapag 0', /tc-dot be/.test(none), true);
const winsOnly = build(AUG.filter(t => t.win_loss === 'Win'));
check('Loss hindi napipindot kapag 0', /showMonthResultTrades\('loss'\)/.test(winsOnly), false);
check('Win napipindot pa rin', /showMonthResultTrades\('win'\)/.test(winsOnly), true);

console.log('\nAng tuldok ng BE ay asul:');
const css = fs.readFileSync(__ROOT + '/css/style.css','utf8');
check('tc-dot.be = var(--info)', /\.tc-dot\.be\{background:var\(--info\)/.test(css), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
