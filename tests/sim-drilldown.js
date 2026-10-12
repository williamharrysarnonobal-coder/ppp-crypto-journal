const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The checklist drilldown and the ordinal dimensions, run against the real
// functions. The thing most worth proving here is DIRECTION: an inverted
// question must read `Met` when the answer is No, or the Divergence card ranks
// upside down and quietly tells him to do the opposite of the right thing.
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
// Brace/bracket-matched so a multi-line object or array comes out whole; a scan
// to the first ';' would cut through the regexes inside SETUP_DIMENSIONS.
function decl(name, open, close){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\' + open).exec(js);
  if(!m) throw new Error('missing const ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === open) d++;
    else if(js[j] === close){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
const line = n => { const m = new RegExp('const ' + n + '\\s*=[^\\n]*').exec(js); return m ? m[0] : ''; };
/* For an arrow whose body is a block: `const _hr = h => { ... };`. decl() wants
   the brace straight after the `=` and finds nothing here, and line() stops at
   the first newline — this brace-matches, then runs on to the `;`. */
function arrowBlock(name){
  const i = js.indexOf('const ' + name + ' =');
  if(i < 0) throw new Error('missing const ' + name);
  let d = 0, j = js.indexOf('{', i);
  for(; j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) break; }
  }
  return js.slice(i, js.indexOf(';', j) + 1);
}

const API = new Function(`
  let TRADING_ACCOUNTS = [];
  const escapeHtml = s => String(s);
  ${line('EM_MIN_N')}
  ${line('EM_PRIOR')}
  ${line('DEFAULT_MIN_CONFLUENCE_PCT')}
  ${line('MET_ORDER')}
  ${line('SEQ_ORDER')}
  ${decl('CONFLUENCE_SETUPS', '{', '}')}
  ${decl('SESSION_WINDOWS', '{', '}')}
  ${fn('_tzOffsetHours')}
  ${fn('_sessionUtcWindow')}
  ${arrowBlock('_hr')}
  ${fn('_sessionUaeWindow')}
  // Ang Session card ay galing na sa computeSession mismo — tingnan ang
  // _sessionLocalWindow sa dashboard.js.
  ${fn('computeSession')}
  ${fn('_sessionLocalWindow')}
  ${decl('SETUP_DIMENSIONS', '[', ']')}
  ${fn('_selectCredit')}
  ${fn('_confluenceProgress')}
  ${fn('_confluenceCellData')}
  ${fn('_confluenceAnswerAt')}
  ${fn('_confluenceItemAnswer')}
  ${line('_isBE')}
  ${fn('_tagArmStats')}
  ${fn('_setupStats')}
  const _isWin  = t => t.win_loss === 'Win';
  const _isLoss = t => t.win_loss === 'Loss';
  return { setAccounts: a => { TRADING_ACCOUNTS = a; },
           CONFLUENCE_SETUPS, SETUP_DIMENSIONS, _confluenceItemAnswer,
           _confluenceAnswerAt, _setupStats, SEQ_ORDER, MET_ORDER };
`)();

API.setAccounts([{ account_name:'5K', account_size:5000 }]);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + got + (ok ? '' : '   <-- ' + want));
};

// --- 1. Direction of an inverted question -------------------------------
// 'Long|5 mins HL' index 4 is Divergence, "Left Hand Present?", invert:true.
// A hand that is NOT present is the good answer, so 'no' must read as Met.
const setup = API.CONFLUENCE_SETUPS['Long|5 mins HL'];
console.log('Long|5 mins HL item 4: ' + setup.items[4].text + '  (invert=' + !!setup.items[4].invert + ')');
const T = (ans, extra) => ({ trade_type:'Long', pattern_type:'5 mins HL',
  confluence_answers:ans, account:'5K', profit_loss:0, fee:0, win_loss:'Win', ...extra });
const divg = t => API._confluenceItemAnswer(t, it => it.tag === 'Divergence');

console.log('\nInverted question reads in the scoring direction:');
check("Left Hand Present = no   -> Met",     divg(T({4:'no'})),     'Met');
check("Left Hand Present = yes  -> Missed",  divg(T({4:'yes'})),    'Missed');
check("Left Hand Present = almost -> Half met", divg(T({4:'almost'})), 'Half met');
check('unanswered -> null (absent, not Missed)', divg(T({})), 'null');

// A plain question must NOT be flipped.
const htf = t => API._confluenceItemAnswer(t, it => /^MACD · (1H|4H)$/.test(it.tag));
console.log('\nPlain question is not flipped:');
check('1H MACD Bull = yes -> Met',    htf(T({0:'yes'})), 'Met');
check('1H MACD Bull = no  -> Missed', htf(T({0:'no'})),  'Missed');

/* --- 2. Ang unang tanong ang pinakamataas na timeframe --------------------

   Isang regex ito noon — `MACD · (1H|4H)` — na tama lang hangga't dalawa ang
   posibleng itaas. Dumating ang Creation: ang 15M ay walang tugma (zero hit,
   kaya walang HTF bias), at ang 4H ay may 1H din sa loob (dalawang tugma, at
   ang una ang nakukuha nang aksidente).

   Ang AYOS ang tunay na panuntunan, at nakasulat na iyon sa komento ng dimension
   noon pa: "question 1 on every one of your checklists". Iyon ang sinusuri
   dito — na ang unang item ay isang MACD sa pinakamataas na timeframe ng
   setup na iyon, anuman ang pangalan noon. */
console.log('\nAng unang tanong ay ang pinakamataas na timeframe:');
Object.entries(API.CONFLUENCE_SETUPS).forEach(([k, cfg]) => {
  const first = cfg.items[0];
  const tf = (/^MACD · (\S+)$/.exec(first.tag) || [, null])[1];
  // Walang ibang item na mas mataas pa sa una.
  const MIN = { '1M':1, '3M':3, '5M':5, '15M':15, '30M':30, '1H':60, '4H':240 };
  const rank = t => MIN[t] || 0;
  const higher = cfg.items.slice(1)
    .map(it => (/^MACD · (\S+)$/.exec(it.tag) || [, null])[1])
    .filter(t => t && rank(t) > rank(tf));
  check(k, (tf ? 'MACD' : 'HINDI MACD') + (higher.length ? ' + mas mataas: ' + higher.join(',') : ''),
        'MACD');
});

// --- 3. Sequence comes back only for real select values ----------------
console.log('\nSequence:');
const seq = t => API._confluenceAnswerAt(t, it => it.tag === 'Sequence', API.SEQ_ORDER);
check("index 5 = '3rd' -> 3rd", seq(T({5:'3rd'})), '3rd');
check("a yes/no answer stored there is rejected", seq(T({5:'yes'})), 'null');
check("select item is not read as Met/Missed",
      API._confluenceItemAnswer(T({5:'3rd'}), it => it.tag === 'Sequence'), 'null');

// --- 4. Ordinal ordering survives sorting ------------------------------
// The whole point of the Sequence card is the trend along 1st..5th. If the
// sort ranks by return the card becomes unreadable, so the order must hold
// even when the returns run backwards to it.
console.log('\nOrdinal dimensions keep their own order:');
// Outcomes, not money — the panel has no dollars in it any more, so the
// fixture is built from wins and losses directly.
const mk = (s, wins, losses, bes) => [
  ...Array.from({length:wins},   (_, i) => T({5:s}, { win_loss:'Win',       position_id:s+'W'+i })),
  ...Array.from({length:losses}, (_, i) => T({5:s}, { win_loss:'Loss',      position_id:s+'L'+i })),
  ...Array.from({length:bes||0}, (_, i) => T({5:s}, { win_loss:'Breakeven', position_id:s+'B'+i })),
];
const seqTrades = [...mk('1st',1,5), ...mk('2nd',3,3), ...mk('3rd',5,1)];
const rows = API._setupStats(seqTrades, t => seq(t), API.SEQ_ORDER);
check('order is 1st,2nd,3rd not by win rate', rows.map(r => r.name).join(','), '1st,2nd,3rd');
check('3rd really is the best win rate', rows[2].rate > rows[0].rate, 'true');

// Without an order it must sort by win rate, best first.
const free = API._setupStats(seqTrades, t => seq(t));
check('no order -> sorted by win rate', free.map(r => r.name).join(','), '3rd,2nd,1st');

// Thin arms still sort last even under a free sort.
const thin = [...mk('4th',2,0), ...mk('1st',1,5)];
const ft = API._setupStats(thin, t => seq(t));
check('under EM_MIN_N cannot lead', ft[0].name, '1st');

// The centre of the bar is HIS average, not zero, so a group is only ever
// judged against how he normally trades.
console.log('\nShrinkage goes toward your own average, not toward zero:');
const base = 9 / 18 * 100;                      // 1+3+5 wins of 18 settled
check('baseline is the overall win rate', Math.round(rows[0].base), Math.round(base));
check('a thin 100% group does not read as +50 points',
      Math.abs(API._setupStats(thin, t => seq(t)).find(r => r.name === '4th').shown) < 10, 'true');

// --- 6. The breakeven trap ---------------------------------------------
// Moving a stop to breakeven turns losses into breakevens. If breakevens were
// dropped from the denominator, that habit would score 100% every time —
// which is the exact experiment this panel runs.
console.log('\nBreakeven counts in the denominator, so it cannot hide a loss:');
const beHeavy = API._setupStats(mk('1st', 3, 0, 7), t => seq(t));
check('3 wins, 7 breakevens -> 30%, not 100%', Math.round(beHeavy[0].rate), 30);
check('all 10 counted as settled', beHeavy[0].settled, 10);
check('the breakevens are still visible', beHeavy[0].bes, 7);

// --- 5. Every dimension is callable on a bare trade ---------------------
// A dimension that throws takes the whole panel down, and a half-filled trade
// is the normal case, not the exception.
console.log('\nEvery dimension survives a trade with nothing filled in:');
const bare = { account:'5K', profit_loss:0, fee:0 };
API.SETUP_DIMENSIONS.forEach(g => g.dims.forEach(d => {
  let got;
  try { got = String(d.of(bare)); } catch(e){ got = 'THREW ' + e.message; }
  check((g.group + ' / ' + d.label), got.startsWith('THREW') ? got : 'ok', 'ok');
}));

console.log('\nDimensions now on the panel: ' +
  API.SETUP_DIMENSIONS.reduce((s, g) => s + g.dims.length, 0) +
  ' across ' + API.SETUP_DIMENSIONS.length + ' groups (was 4 in one flat grid)');

console.log('\n' + (fail ? fail + ' FAIL' : 'all good'));
process.exit(fail ? 1 : 0);
