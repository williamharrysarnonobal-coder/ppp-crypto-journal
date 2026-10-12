const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG APAT NA BAGONG CHALLENGE.

   Ang tinatanong ko sa bawat isa ay hindi "may lumalabas bang numero" kundi
   "TAMA ba ang numero, at tumatanggi ba itong magsinungaling kapag kulang ang
   datos". Ang huli ang mas mahalaga: ang isang challenge na nagbibigay ng
   marka mula sa walang datos ay mas masahol kaysa sa walang challenge.

   Tinatakbo ko ang MISMONG computeChallenges mula sa dashboard.js. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('nawawala: ' + name);
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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

/* Ang computeChallenges ay isang malaking function na humihipo sa maraming
   global. Ibinibigay ko ang mga ito bilang argumento sa halip na gayahin ang
   nilalaman nito — kaya ang sinusubok ay ang tunay na code at hindi isang
   paglalarawan nito. */
const SCOPE = {
  PAPER_TRADES: [], TRADING_ACCOUNTS: [], accStatsCache: [],
  _isLoss: t => ['loss','liquidated'].includes(String(t.win_loss||'').toLowerCase()),
  _isWin:  t => String(t.win_loss||'').toLowerCase() === 'win',
  _isLosingResult: t => ['loss','liquidated'].includes(String(t.win_loss||'').toLowerCase()),
  netPnl: t => (Number(t.profit_loss)||0) - (Number(t.fee)||0),
  _dayKeyLocal: d => { const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); },
  fmtNum: (n, d) => Number(n).toFixed(d),
  fmtMoney: n => (n<0?'-':'+') + '$' + Math.abs(n).toFixed(2),
  _ruleTags: v => String(v||'').split(',').map(s=>s.trim()).filter(Boolean),
  _brokenRuleTags: v => String(v||'').split(',').map(s=>s.trim())
    .filter(s => s && s.toLowerCase() !== 'rules followed'),
  _winRateOf: a => { let w=0,d=0; a.forEach(t=>{ const x=String(t.win_loss||'').toLowerCase();
    if(x==='win'){w++;d++;} else if(x==='loss'||x==='liquidated') d++; }); return d?w/d*100:null; },
  _confluenceScoreFor: () => null,
  _beAvoidedLoss: () => null,
  computeAccountStats: () => ({}),
  getWeekKey: d => { const x = new Date(d); const y = x.getFullYear();
    const s = new Date(y,0,1); return y + '-W' + Math.ceil(((x - s)/864e5 + s.getDay()+1)/7); },
  // Hinihipo rin ng computeChallenges ang checklist ng confluence. Walang
  // setup na tumutugma sa fixture ko, kaya ang walang lamang bagay ay tama
  // dito — ang mahalaga ay tumakbo ito, hindi na may sinasabi ito.
  CONFLUENCE_SETUPS: {}, DEFAULT_MIN_CONFLUENCE_PCT: 60,
  _confluenceProgress: () => ({ total: 0, done: 0, unanswered: 0 }),
  _patternList: v => String(v||'').split(',').map(s=>s.trim()).filter(Boolean),
  LOCKED_CHALLENGES: [], SAVED_SETUPS: [],
  _salarySettings: () => ({ monthly: null, currency: 'USD' }),
  _salaryStreakTarget: () => null,
  SALARY_DEFAULTS: {}, PROFILE_DATA: null, YEAR: 2026,
  _salMoney: n => '$' + Number(n).toFixed(2),
  escapeHtml: s => String(s ?? ''),
};

let compute;
try{
  compute = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE));
}catch(e){
  console.log('HINDI MABUO: ' + e.message);
  process.exit(1);
}

const T = (day, wl, extra) => ({
  close_date: new Date(2026, 2, day, 15, 0), open_date: new Date(2026, 2, day, 14, 0),
  win_loss: wl, profit_loss: wl === 'Win' ? 100 : -50, fee: 0,
  unfollowed_rules: 'Rules Followed', rr: 2, account: 'Upscale 10K', ...extra
});
const P = (day, reason) => ({ open_date: new Date(2026, 2, day, 14, 30),
  close_date: new Date(2026, 2, day, 14, 30), no_trade_reason: reason, is_paper: true });

const find = (list, title) => list.find(c => c.title === title);

console.log('1. NO REVENGE TRADING\n');
{
  /* Araw 1: talo, tapos NAG-PASS ka. Disiplina.
     Araw 2: talo, tapos pumasok agad ulit nang walang pass. Hinabol mo.
     Araw 3: talo lang, wala nang sumunod. Hindi binibilang sa alinman. */
  SCOPE.PAPER_TRADES = [P(1, 'Nag pahinga muna')];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Loss'), T(2,'Loss'), T(2,'Win'), T(3,'Loss')], []);
  const c = find(list, 'No Revenge Trading');
  console.log('     ' + (c ? c.statOverride : '(wala)'));
  check('umiiral na ito, hindi na naka-lock', !!c, true);
  check('isang malinis (araw 1)', c.current, 1);
  check('hindi binibilang ang araw na natapos sa talo',
    /1 of 2 losses/.test(c.statOverride || ''), true);
}
{
  // Walang paper trade kahit kailan: walang masasabi, hindi zero na marka.
  SCOPE.PAPER_TRADES = [];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Loss'), T(1,'Win'), T(2,'Loss')], []);
  const c = find(list, 'No Revenge Trading');
  check('walang pass -> hindi nagpapanggap',
    /log the setups you skip/.test(c.statOverride || ''), true);
}

console.log('\n2. TRIGGER HONESTY\n');
{
  SCOPE.PAPER_TRADES = [P(1,'Nag alangan sa structure'), P(2,'Nag alangan sa structure'),
                        P(3,'Wala sa bahay'), P(4,'')];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Win')], []);
  const c = find(list, 'Trigger Honesty');
  console.log('     ' + c.statOverride);
  // Apat na paper, TATLO lang ang may dahilan.
  check('tatlo ang binibilang, hindi apat', c.current, 3);
  check('sinasabi ang pinakamadalas', /Nag alangan sa structure/.test(c.statOverride), true);
}

console.log('\n3. LEVERAGE DISCIPLINE\n');
{
  SCOPE.PAPER_TRADES = [];
  SCOPE.TRADING_ACCOUNTS = [{ account_name:'Upscale 10K', max_leverage: 5 }];
  const rows = [T(1,'Win',{leverage:3}), T(2,'Win',{leverage:5}), T(3,'Loss',{leverage:8}),
                T(4,'Win',{leverage:2}), T(5,'Win',{leverage:4}),
                T(6,'Win',{leverage:null}), T(7,'Win',{account:'Wala', leverage:9})];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))(rows, []);
  const c = find(list, 'Leverage Discipline');
  console.log('     ' + c.statOverride);
  // 3,5 ok -> 8 lumampas -> 2,4 ok. Pinakamahabang streak ay 2.
  check('pinakamahabang streak', c.current, 2);
  check('lima ang may leverage AT limitasyon', /5 trades have both/.test(c.statOverride), true);
  check('isang lumampas', /1 went over/.test(c.statOverride), true);
  check('pinakamataas na ginamit', /highest used 8x/.test(c.statOverride), true);
}
{
  // Walang leverage kahit saan: hindi dapat lumitaw ang card.
  SCOPE.TRADING_ACCOUNTS = [{ account_name:'Upscale 10K', max_leverage: 5 }];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Win'), T(2,'Win')], []);
  check('walang datos -> walang card', !find(list, 'Leverage Discipline'), true);
}
{
  // May leverage pero WALANG limitasyon sa account: wala ring masusukat.
  SCOPE.TRADING_ACCOUNTS = [{ account_name:'Upscale 10K' }];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Win',{leverage:3})], []);
  check('walang limitasyon -> hindi ipinapalagay na ligtas',
    !find(list, 'Leverage Discipline'), true);
}

console.log('\n4. SAME-DAY JOURNALING\n');
{
  SCOPE.TRADING_ACCOUNTS = [];
  const soon = d => new Date(2026, 2, d, 20, 0);       // parehong araw
  const late = d => new Date(2026, 2, d + 9, 12, 0);   // makalipas ang siyam na araw
  const rows = [
    T(1,'Win',{ created_at: soon(1) }), T(2,'Win',{ created_at: soon(2) }),
    T(3,'Loss',{ created_at: late(3) }),
    T(4,'Win'),                                        // lumang trade, walang created_at
    T(5,'Win'),
  ];
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))(rows, []);
  const c = find(list, 'Same-Day Journaling');
  console.log('     ' + c.statOverride);
  check('dalawa ang same-day', c.current, 2);
  // Ang mahalaga: ang dalawang lumang trade ay HINDI binibilang bilang huli.
  check('tatlo lang ang may oras, hindi lima', /2 of 3 trades/.test(c.statOverride), true);
}
{
  // Wala pang kahit isang trade na may created_at: hindi dapat lumitaw.
  const list = new Function(...Object.keys(SCOPE), fnBody('computeChallenges') + ' return computeChallenges;')
    (...Object.values(SCOPE))([T(1,'Win'), T(2,'Win')], []);
  check('walang naitalang oras -> walang card', !find(list, 'Same-Day Journaling'), true);
}

console.log('\n5. WALA NA SILA SA NAKA-LOCK NA LISTAHAN\n');
{
  const i = js.indexOf('const LOCKED_CHALLENGES');
  const seg = js.slice(i, js.indexOf('];', i));
  ['No Revenge Trading','Same-Day Journaling','1% Risk Master'].forEach(t =>
    check('umalis na: ' + t, seg.includes(t) ? 'nariyan pa' : 'wala na', 'wala na'));
  // At ang natitira ay may TUNAY pang dahilan.
  ['Daily Check-in Streak','Tournament Placement'].forEach(t =>
    check('naka-lock pa rin (tama): ' + t, seg.includes(t), true));
}

console.log('\n' + (fail ? fail + ' FAIL' : 'tama ang apat na bagong challenge'));
process.exit(fail ? 1 : 0);
