const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Ang buod ng isang paper trade ay walong linyang gitling noon: Objective,
   Result, Profit/Loss, PNL Percent, Fee, Trade Duration, Rules Followed at
   Trade Tags. Hindi sila blangko dahil nakalimutan — hindi sila umiiral, dahil
   hindi pinasok ang trade.

   Ang pagsubok na ito ay pinapatakbo ang TUNAY na computeTradeSummary at
   binabasa ang lumalabas. Ang panuntunan ay isa lang at hindi ito listahan ng
   pangalan na kakailanganin kong panatilihin: WALANG label na markado bilang
   realOnly sa ALL_DRAWER_FIELDS ang dapat lumitaw sa buod ng isang paper trade.
   Kung may maidagdag na bagong tunay-lamang na field bukas, mahuhuli ito rito. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (label, cond, extra) => { if (!cond) fail++;
  console.log('  ' + (cond ? 'ok   ' : 'MALI ') + label.padEnd(56) + (extra || '')); };

/* Ang mga tunay-lamang na label, kinukuha sa pinagmulan at hindi kinokopya. */
const src = arrBlock('ALL_DRAWER_FIELDS');
let depth = 0, start = -1; const objs = [];
for (let j = src.indexOf('['); j < src.length; j++) {
  if (src[j] === '{') { if (!depth) start = j; depth++; }
  else if (src[j] === '}') { depth--; if (!depth) objs.push(src.slice(start, j + 1)); }
}
const realOnlyLabels = objs.filter(o => /realOnly\s*:\s*true/.test(o))
  .map(o => (/\blabel\s*:\s*'([^']*)'/.exec(o) || [, ''])[1]).filter(Boolean);
const paperOnlyLabels = objs.filter(o => /paperOnly\s*:\s*true/.test(o))
  .map(o => (/\blabel\s*:\s*'([^']*)'/.exec(o) || [, ''])[1]).filter(Boolean);

const api = new Function(`
  const CONFLUENCE_SETUPS = {};
  const fmtMoney = n => '$' + Number(n).toFixed(2);
  const fmtNum = (n, d) => Number(n).toFixed(d);
  ${fnBody('computeSession')}
  ${js.slice(js.indexOf('const SESSION_WINDOWS'), js.indexOf('\n};', js.indexOf('const SESSION_WINDOWS')) + 3)}
  ${fnBody('_tzOffsetHours')}
  ${fnBody('_sessionUtcWindow')}
  ${fnBody('computeDayOfWeek')}
  ${fnBody('computeObjective')}
  ${fnBody('computeDuration')}
  ${fnBody('_allNotesText')}
  ${fnBody('_plannedRR')}
  ${fnBody('_confluenceCellData')}
  ${fnBody('_paperTradeSummary')}
  ${fnBody('computeTradeSummary')}
  return { summary: computeTradeSummary };
`)();

const plain = h => h.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').trim();

/* Ang hilaw na hilera na galing mismo sa Supabase — hindi dumaan sa
   normalizeTrade, dahil iyon ang ibinibigay ng drawer sa buod. */
const paper = {
  is_paper: true, symbol: 'BTC', position_id: 'P1',
  open_date: '2026-09-02T18:18:00Z',
  trade_setup: 'Rejection Play', pattern_type: '1 hour LH',
  aof_phase: 'IC', execution_tf: '15 min', trade_type: 'Short',
  entry_price: 69784, tp_price: 68000, sl_price: 70400,
  no_trade_reason: 'Already extended — missed the entry',
  paper_outcome: 'Hit TP',
  notes: 'Sayang kasi hindi nag retest si price.',
  notes_log: []
};
const real = { ...paper, is_paper: false, no_trade_reason: null, paper_outcome: null,
  close_date: '2026-09-02T20:00:00Z', win_loss: 'Win', profit_loss: 320.5,
  pnl_percent: 1.4, fee: 2.1, rules_followed: 'Yes', unfollowed_rules: 'Rules Followed' };

const pOut = plain(api.summary(paper));
const rOut = plain(api.summary(real));

console.log('ANG BUOD NG PAPER\n');
pOut.split('\n').forEach(l => console.log('    ' + l));

console.log('\n1. WALA NA ANG MGA LINYANG LAGING GITLING\n');
realOnlyLabels.forEach(l =>
  ok('walang "' + l + '"', !new RegExp('(^|\\n)' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':').test(pOut)));

console.log('\n2. NANDOON ANG MGA TANONG NA PAPER LANG\n');
paperOnlyLabels.filter(l => l !== 'Planned RR').forEach(l =>
  ok('may "' + l + '"', pOut.includes(l + ':')));
ok('may "Planned RR"', /Planned RR:/.test(pOut));

console.log('\n3. TAMA ANG MGA NUMERO\n');
// entry 69784, sl 70400 -> risk 616; tp 68000 -> reward 1784; RR = 2.90
ok('kinukuwenta ang Planned RR mula sa tatlong presyo', /Planned RR: 2\.90/.test(pOut),
   (/Planned RR: ([^\n]*)/.exec(pOut) || [, '?'])[1]);
ok('may petsa ang Date Seen', /Date Seen: \w/.test(pOut),
   (/Date Seen: ([^\n]*)/.exec(pOut) || [, '?'])[1]);
ok('napupunan ang Session mula sa oras', /Session: \w/.test(pOut) && !/Session: —/.test(pOut),
   (/Session: ([^\n]*)/.exec(pOut) || [, '?'])[1]);
ok('napupunan ang Day of Week', !/Day of Week: —/.test(pOut),
   (/Day of Week: ([^\n]*)/.exec(pOut) || [, '?'])[1]);
ok('nandoon ang mismong dahilan', pOut.includes('Already extended — missed the entry'));
ok('nandoon ang notes', pOut.includes('Sayang kasi'));

console.log('\n4. WALANG MASYADONG GITLING\n');
const dashes = (pOut.match(/: —/g) || []).length;
const lines = pOut.split('\n').filter(l => /: /.test(l)).length;
ok('mas kaunti sa isang-katlo ang gitling', dashes * 3 < lines, dashes + ' sa ' + lines + ' linya');

console.log('\n5. HINDI NAGALAW ANG TUNAY NA BUOD\n');
['Objective', 'Result', 'Profit/Loss', 'Price Move', 'Fee', 'Trade Duration',
 'Rules Followed?', 'Trade Tags'].forEach(l =>
  ok('nasa tunay pa rin ang "' + l + '"', rOut.includes(l + ':')));
ok('walang tanong na paper sa tunay', !/Why you did not take it/.test(rOut));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
