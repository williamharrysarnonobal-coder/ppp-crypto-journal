const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang dalawang bagong panel, pinapatakbo nang totoo.
//
//   Discipline & Experiments   — breach tags bilang rules, observations bilang A/B
//   Pattern, Session & Confluence — ang tatlong pinipili bago pumasok
const core = require('./tag-core');
const A = core.API, js = core.js;

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function arrBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
function line(p){ const i = js.indexOf(p); return js.slice(i, js.indexOf('\n', i)); }
// Isang multi-line na statement na walang brace. Hindi pwede ang scan hanggang
// unang ";" — ang _attrJson ay puno ng '&amp;' at '&quot;' na may semicolon sa
// loob mismo ng string. Ang hanap: ";" na sinusundan agad ng bagong linya.
function stmt(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  const m = /;\r?\n/.exec(js.slice(i));
  return js.slice(i, i + m.index + 1);
}
// Katulad ng arrBlock pero para sa object literal — CONFLUENCE_SETUPS.
function objBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
// Brace-matched then extended to the ";" — _hasTag spans several lines, and
// line() would cut it off after the arrow.
function declBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0, j = js.indexOf('{', i);
  for (; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) break; }
  }
  return js.slice(i, js.indexOf(';', j) + 1);
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const OUT = {};
const ACCOUNTS = [{ account_name:'Upscale Trade 5K', account_size:5000 },
                  { account_name:'Upscale Trade 50K', account_size:50000 }];

function run(trades){
  Object.keys(OUT).forEach(k => delete OUT[k]);
  const scope = {
    document:{ getElementById: id => ({ set innerHTML(v){ OUT[id] = v; } }) },
    escapeHtml: s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    fmtMoney: () => { throw new Error('walang pera sa dalawang panel'); },
    netPnl: t => (t.profit_loss||0) - (t.fee||0),
    _isWin:  t => String(t.win_loss||'').toLowerCase() === 'win',
    _isLoss: t => ['loss','liquidated'].includes(String(t.win_loss||'').toLowerCase()),
    _confluenceCellData: t => t._cfl || null,
    TRADING_ACCOUNTS: ACCOUNTS,
    ...A,
  };
  return new Function(...Object.keys(scope), 'FILTERED', `
    ${grab('function _patternList(')}
    ${line('const EM_MIN_N')}
    ${line('const EM_PRIOR')}
    ${line('const MET_ORDER')}
    ${line('const SEQ_ORDER')}
    ${objBlock('CONFLUENCE_SETUPS')}
    ${arrBlock('TRADE_REPORTS')}
    ${objBlock('SESSION_WINDOWS')}
    ${grab('function _tzOffsetHours(')}
    ${grab('function _sessionUtcWindow(')}
    ${declBlock('_hr')}
    ${grab('function _sessionUaeWindow(')}
    /* Ang Session card ay kumukuha na ng oras nito mula sa computeSession
       mismo, hindi mula sa timezone ng market — kaya kailangan ang dalawang
       ito o hindi tatakbo ang SETUP_DIMENSIONS. */
    ${grab('function computeSession(')}
    ${grab('function _sessionLocalWindow(')}
    ${arrBlock('SETUP_DIMENSIONS')}
    ${line('const EM_MIN_GAP')}
    ${line('const _isBE')}
    ${objBlock('RULE_PHRASE')}
    let SX_FILTERS = {};
    ${stmt('_attrJson')}
    ${grab('function _sxFiltered(')}
    ${grab('function _sxDim(')}
    ${grab('function toggleSetupFilter(')}
    ${grab('function clearSetupFilters(')}
    ${grab('function _tagArmStats(')}
    ${declBlock('_hasTag')}
    ${grab('function _disciplineStats(')}
    ${grab('function _disciplineSummary(')}
    const DX_RECENT_N = 20;
    const DX_SESSION_ORDER = ['Asia', 'London', 'London + NY Overlap', 'New York', 'Low Liquidity'];
    const DX_SESSION_SHORT = { 'London + NY Overlap':'Overlap', 'Low Liquidity':'Low Liq.' };
    ${grab('function _disciplineTrend(')}
    ${grab('function _afterLossStats(')}
    ${grab('function _dxRateRow(')}
    ${grab('function _tagWhereHtml(')}
    ${grab('function renderDisciplinePanel(')}
    ${grab('function _setupStats(')}
    ${grab('function _confluenceAnswerAt(')}
    ${grab('function _confluenceItemAnswer(')}
    ${grab('function renderSetupPanel(')}
    ${line('const _rateTxt')}
    ${grab('function _tagLeaderboard(')}
    ${grab('function _armFor(')}
    ${grab('function _runReport(')}
    ${grab('function _reportHtml(')}
    renderDisciplinePanel(); renderSetupPanel();
    // SETUP_DIMENSIONS ay naka-grupo na, at wala na ang key na property —
    // hinahanap na sa label sa lahat ng grupo. (Walang backtick dito: nasa
    // loob tayo ng template literal, at isasara niyon ang buong harness.)
    const findDim = label => {
      for(const g of SETUP_DIMENSIONS){ const d = g.dims.find(x => x.label === label); if(d) return d; }
      throw new Error('walang dimension na "' + label + '"');
    };
    return { EM_MIN_N, EM_MIN_GAP, TRADE_REPORTS, SETUP_DIMENSIONS,
             disc: _disciplineStats(FILTERED),
             summary: _disciplineSummary(FILTERED, _disciplineStats(FILTERED)),
             board: () => _tagLeaderboard(FILTERED),
             ask: id => _runReport(TRADE_REPORTS.find(q => q.id === id), FILTERED),
             setup: label => { const d = findDim(label); return _setupStats(_sxFiltered(d.label), d.of, d.order); },
             // Ang cross-filter, pinipindot nang totoo. Nagre-render ulit ang
             // panel sa loob ng toggle at dumadaan sa document stub, kaya ang
             // OUT.setupEdgeBody sa labas ay ang mismong makikita sa screen.
             // (Hindi mababasa dito ang OUT — wala siya sa sandbox scope.)
             click: (label, value) => { toggleSetupFilter(label, value); },
             clearFilters: () => { clearSetupFilters(); },
             filters: () => JSON.parse(JSON.stringify(SX_FILTERS)) };
  `)(...Object.values(scope), trades);
}

let id = 0;
const mk = o => ({ position_id:'P'+(++id), symbol:'BTC/USD', unfollowed_rules:'',
  win_loss:'Win', profit_loss:100, fee:0, account:'Upscale Trade 5K',
  pattern_type:'15 mins HL', session:'London', trade_setup:'Bounce Play',
  post_be_result:'N/A', post_cutloss_result:'N/A', ...o });
const many = (n,o) => Array.from({length:n}, () => mk(o));

console.log('1. ANG DISCIPLINE — NAKA-GRUPO SA RULES\n');
let api = run([
  ...many(8, { unfollowed_rules:'Lack of Confluence', win_loss:'Loss', profit_loss:-200 }),
  ...many(5, { unfollowed_rules:'Non-BnB Setup',      win_loss:'Loss', profit_loss:-150 }),
  ...many(4, { unfollowed_rules:'Revenge Trade',      win_loss:'Loss', profit_loss:-120 }),
  ...many(3, { unfollowed_rules:'Moved Stop Loss',    win_loss:'Loss', profit_loss:-90 }),
  ...many(20,{ unfollowed_rules:'Rules Followed',     win_loss:'Win',  profit_loss:250 }),
]);
api.disc.forEach(r => console.log('   ' + r.name.padEnd(34) + String(r.n).padStart(3) +
  ' trades  ' + String(r.losses).padStart(3) + ' talo'));
check('apat na rule', api.disc.length, 4);
check('pinakamaraming talo muna', api.disc[0].name, 'Follow the confluence checklist');
check('nagsanib ang 8 + 5', api.disc[0].n, 13);
check('may zero na rule pa rin', api.disc.some(r => r.n === 0), true);
check('nakalista ang mga tag', api.disc[0].tags.length, 3);
check('kasama ang zero na tag',
  api.disc.find(r => r.name === 'Do not touch an open trade').tags.some(([,n]) => n === 0), true);

console.log('\n   Isang trade, dalawang tag sa IISANG rule — isang bilang:');
api = run(many(6, { unfollowed_rules:'Lack of Confluence, Non-BnB Setup', win_loss:'Loss', profit_loss:-100 }));
check('anim, hindi labindalawa', api.disc[0].n, 6);

console.log('\n2. ANG BREAKEVEN REPORT\n');
/* Isang desisyon — hinayaan ang stop — at dalawang paraan kung paano ito
   nauwi. Walang kailangang pangalawang panig: ang tanong na "dapat ba akong
   maglipat sa BE" ay nasasagot ng mismong bilang ng beses na tama at mali ang
   hindi paglipat. */
let api2 = run([
  ...many(3,  { unfollowed_rules:"Would Have BE'd Out",    win_loss:'Win'  }),
  ...many(11, { unfollowed_rules:'No BE at Prev High/Low', win_loss:'Loss' }),
]);
let a = api2.ask('be');
console.log('   ' + a.arms[0].label + ': ' + a.arms[0].good + ' tama, ' + a.arms[0].bad + ' mali');
console.log('   -> ' + a.verdict.txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
check('isang arm lang', a.arms.length, 1);
check('3 tama', a.arms[0].good, 3);
check('11 mali', a.arms[0].bad, 11);
check('sinasabing magsimula nang maglipat', /Start moving the stop to entry/.test(a.verdict.txt), true);
check('pula ang hatol', a.verdict.tone, 'bad');

console.log('\n   Kapag mas madalas tama ang paghayaan:');
api2 = run([
  ...many(12, { unfollowed_rules:"Would Have BE'd Out",    win_loss:'Win'  }),
  ...many(2,  { unfollowed_rules:'No BE at Prev High/Low', win_loss:'Loss' }),
]);
a = api2.ask('be');
console.log('   -> ' + a.verdict.txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
check('sinasabing panatilihin', /Keep leaving the stop where it is/.test(a.verdict.txt), true);
check('berde', a.verdict.tone, 'good');

// Ang "BE'd at Prev High/Low" ay wala na — retirado. Hindi ito dapat
// makapasok sa report kahit may lumang trade pa na may hawak nito.
api2 = run(many(9, { unfollowed_rules:"BE'd at Prev High/Low", win_loss:'Win' }));
a = api2.ask('be');
check('hindi binibilang ang retiradong tag', a.total, 0);

console.log('\n3. ANG INVALIDATION — DALAWANG HIWALAY NA TANONG\n');
/* Isang eksperimento ito noon na may dalawang panig, at ang hatol ay
   naghihintay ng dalawang panig na may laman bago magsalita. Sa totoong datos
   niya — 13 na paghawak, zero na pagputol — nagsasabi ito ng "tag the other
   side" habang may malinaw nang 3-of-13 sa harap nito.

   Magkaibang tanong naman talaga sila: ang "dapat ba akong humawak" ay
   nasasagot ng sariling 13 nito, at hindi nito kailangang hintayin ang isang
   pagputol na maaaring hindi na mangyari. */
const say = x => x.verdict.txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

api2 = run([
  ...many(2,  { unfollowed_rules:'Held Through Invalidation',     win_loss:'Win'  }),
  ...many(10, { unfollowed_rules:'Ego Hold Despite Invalidation', win_loss:'Loss' }),
  ...many(9,  { unfollowed_rules:'Cut on Invalidation',           win_loss:'Loss' }),
  ...many(1,  { unfollowed_rules:'Cut Too Early',                 win_loss:'Loss' }),
]);
let hold = api2.ask('inval-hold'), cut = api2.ask('inval-cut');
console.log('   paghawak : ' + say(hold));
console.log('   pagputol : ' + say(cut));
check('isang panig ang paghawak', hold.arms.length, 1);
check('isang panig ang pagputol', cut.arms.length, 1);
check('paghawak: 2 tama sa 12', hold.arms[0].good + '/' + hold.arms[0].n, '2/12');
check('pagputol: 9 tama sa 10', cut.arms[0].good + '/' + cut.arms[0].n, '9/10');
check('sinasabing itigil ang paghawak', /Stop holding through invalidation/.test(hold.verdict.txt), true);
check('pula ang paghawak', hold.verdict.tone, 'bad');
check('sinasabing ipagpatuloy ang pagputol', /Keep cutting when the setup breaks/.test(cut.verdict.txt), true);
check('berde ang pagputol', cut.verdict.tone, 'good');

console.log('\n   Hindi apektado ng dami ng isa ang hatol sa isa:');
/* 40 beses siyang humawak at 18 lang ang tama; 4 beses siyang nag-cut at 3 ang
   tama. Dating naglalaban sila sa iisang hatol. Ngayon ay hiwalay: ang bawat
   isa ay sinusukat laban sa SARILING tama-at-mali, hindi laban sa isa't isa. */
api2 = run([
  ...many(18, { unfollowed_rules:'Held Through Invalidation',     win_loss:'Win'  }),
  ...many(22, { unfollowed_rules:'Ego Hold Despite Invalidation', win_loss:'Loss' }),
  ...many(3,  { unfollowed_rules:'Cut on Invalidation',           win_loss:'Loss' }),
  ...many(1,  { unfollowed_rules:'Cut Too Early',                 win_loss:'Loss' }),
]);
hold = api2.ask('inval-hold'); cut = api2.ask('inval-cut');
console.log('   paghawak : ' + hold.arms[0].good + '/' + hold.arms[0].n + '  -> ' + say(hold));
console.log('   pagputol : ' + cut.arms[0].good + '/' + cut.arms[0].n + '  -> ' + say(cut));
check('mas marami ang humawak', hold.arms[0].n > cut.arms[0].n, true);
check('pula pa rin ang paghawak (18 sa 40)', hold.verdict.tone, 'bad');
/* Apat lang ang pagputol at lima ang minimum, kaya naghihintay pa ito. Ito ang
   TUNAY na epekto ng paghihiwalay, at mas tapat: dating pinagsama ang 44 sa
   isang bilang, kaya ang apat na pagputol ay nakakahiram ng sample ng
   paghawak at nagmumukhang sapat. Ang bawat tanong ay may sariling ebidensya
   na ngayon, at ang kulang ay sinasabing kulang. */
check('naghihintay pa ang pagputol (4 lang)', cut.verdict.tone, 'wait');
check('at sinasabi nitong kulang pa', /Only 4 trades so far/.test(cut.verdict.txt), true);

console.log('\n   Ang eksaktong datos niya — 3 tama, 10 mali, walang pagputol:');
api2 = run([
  ...many(3,  { unfollowed_rules:'Held Through Invalidation',     win_loss:'Win'  }),
  ...many(10, { unfollowed_rules:'Ego Hold Despite Invalidation', win_loss:'Loss' }),
]);
hold = api2.ask('inval-hold'); cut = api2.ask('inval-cut');
console.log('   paghawak : ' + say(hold));
console.log('   pagputol : ' + say(cut));
check('may malinaw nang hatol', hold.verdict.tone, 'bad');
check('sinasabi ang bilang', /10 of 13/.test(hold.verdict.txt), true);
/* Ito mismo ang lumalabas noon sa 13 na trade. Kung babalik, bumalik ang bug. */
check('WALA nang "Tag the other side"', /Tag the other side/.test(hold.verdict.txt), false);
check('ang pagputol ay tahimik na naghihintay', cut.verdict.tone, 'wait');
check('at sinasabi nitong wala pa', /Nothing tagged yet/.test(cut.verdict.txt), true);

console.log('\n4. ANG EXIT TYPE REPORT — galing sa column, hindi sa tag\n');
api2 = run([
  ...many(9, { exit_type:'Manual Early TP - Valid',   win_loss:'Loss' }),
  ...many(2, { exit_type:'Manual Early TP - Invalid', win_loss:'Win'  }),
]);
a = api2.ask('exit');
console.log('   ' + a.arms[0].good + ' tama, ' + a.arms[0].bad + ' mali');
console.log('   -> ' + a.verdict.txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
check('binabasa ang exit_type', a.arms[0].n, 11);
check('9 valid', a.arms[0].good, 9);
check('2 invalid', a.arms[0].bad, 2);
check('sinasabing ituloy', /Keep taking the manual exit/.test(a.verdict.txt), true);

console.log('\n   Kapag mas madalas maling mag-exit nang maaga:');
api2 = run([
  ...many(2, { exit_type:'Manual Early TP - Valid',   win_loss:'Loss' }),
  ...many(9, { exit_type:'Manual Early TP - Invalid', win_loss:'Win'  }),
]);
a = api2.ask('exit');
check('sinasabing itigil', /Stop closing early/.test(a.verdict.txt), true);
check('pula', a.verdict.tone, 'bad');

console.log('\n   Ang ibang exit type ay hindi binibilang:');
api2 = run([
  ...many(30, { exit_type:'TP Hit', win_loss:'Win' }),
  ...many(20, { exit_type:'SL Hit', win_loss:'Loss' }),
]);
a = api2.ask('exit');
check('zero, hindi 50', a.total, 0);
check('sinasabing wala pa', /Nothing tagged yet/.test(a.verdict.txt), true);

console.log('\n   Ang teksto ng bawat binti ay nananatili:');
api2 = run([
  ...many(9, { exit_type:'Manual Early TP - Valid',   win_loss:'Loss' }),
  ...many(2, { exit_type:'Manual Early TP - Invalid', win_loss:'Win'  }),
]);
// Ang bilang at ang salita ay nakaupo sa parehong pangalan sa loob ng
// _runReport — kung isasabay ang spread, mapapatungan ng numero ang `.txt`
// at magiging blangko ang bawat binti.
check('may salita ang mabuting binti',
  /would have hit your stop/.test(OUT.disciplineBody), true);
check('may salita ang masamang binti',
  /would have hit take profit/.test(OUT.disciplineBody), true);

console.log('\n4b. ANG LEADERBOARD NG TAGS — ano ang natatalo\n');
/* Ang RENDER ay rules lang ngayon, kaya ang breach ang kailangang may sapat na
   trade para may hatol. Ang _tagLeaderboard mismo ay ibinabalik pa rin ang
   lahat — ang pagsala ay nasa panel, at 'yon ang sinusuri ng dalawang check sa
   ilalim: nasa listahan ang breach, wala ang observation. */
api2 = run([
  ...many(3,  { unfollowed_rules:'Held Through Invalidation', win_loss:'Win'  }),
  ...many(10, { unfollowed_rules:'Held Through Invalidation', win_loss:'Loss' }),
  ...many(2,  { unfollowed_rules:'Revenge Trade',             win_loss:'Win'  }),
  ...many(9,  { unfollowed_rules:'Revenge Trade',             win_loss:'Loss' }),
  ...many(20, { unfollowed_rules:'Rules Followed',            win_loss:'Win'  }),
]);
const board = api2.board();
board.forEach(r => console.log('   ' + r.tag.padEnd(30) + String(r.n).padStart(3) + ' trades  ' +
  String(r.losses).padStart(3) + ' talo  ' + (r.rate === null ? '—' : Math.round(r.rate) + '%')));
check('pinakamaraming talo muna', board[0].tag, 'Held Through Invalidation');
check('hindi kasama ang "Rules Followed"',
  board.some(r => r.tag === 'Rules Followed'), false);
check('minarkahan ang breach', board.find(r => r.tag === 'Revenge Trade').kind, 'breach');
check('observation ang isa pa', board[0].kind, 'observation');
check('may delta laban sa sariling average', board[0].delta < 0, true);
check('lumalabas sa HTML', /cut this out/.test(OUT.disciplineBody), true);
/* Ang layunin ay HINDI "walang observation kahit saan" — may sariling
   talahanayan na sila ngayon sa ikatlong seksyon, dahil PITO lang sa kanila ang
   nasasagot ng tatlong tanong at ang natitira ay walang kinalalagyan.

   Ang layunin ay walang observation na TUMATAGAS sa listahan ng RULES, dahil
   doon ang bawat hilera ay isang bagay na sinira mo. Kaya ang UNANG dx-tbl lang
   ang sinusuri — iyon ang rules. Ang buong panel ang sinusuri noon, kaya
   nagreklamo ito sa isang bagay na tama. */
{
  const afterFirst = OUT.disciplineBody.slice(
    OUT.disciplineBody.indexOf('<table class="dx-tbl">'));
  const rulesTable = afterFirst.slice(0, afterFirst.indexOf('</table>'));
  check('walang observation sa listahan ng RULES',
    /Held Through Invalidation<\/td>/.test(rulesTable), false);
  check('nasa sariling talahanayan sila',
    /Held Through Invalidation<\/td>/.test(OUT.disciplineBody), true);
}

console.log('\n5. ANG PATTERN / SESSION / CONFLUENCE\n');
// 15 mins HL: 14 panalo sa 20 = 70%. 4 Hour HL: 3 sa 3 = 100% pero manipis.
// Dapat 15 mins HL pa rin ang nangunguna kahit mas mababa ang tunay nitong
// win rate — 'yon mismo ang trabaho ng shrinkage.
api = run([
  ...many(14, { pattern_type:'15 mins HL', session:'London',   win_loss:'Win' }),
  ...many(6,  { pattern_type:'15 mins HL', session:'London',   win_loss:'Loss' }),
  ...many(15, { pattern_type:'5 mins LH',  session:'New York', win_loss:'Loss' }),
  ...many(3,  { pattern_type:'4 Hour HL',  session:'Asia',     win_loss:'Win' }),
]);
const pat = api.setup('Pattern');
pat.forEach(r => console.log('   ' + r.name.padEnd(14) + String(r.n).padStart(3) + '  ' +
  Math.round(r.rate) + '% panalo   shown ' + r.shown.toFixed(2)));
check('tatlong pattern', pat.length, 3);
check('hindi nangunguna ang 3-trade', pat[0].name, '15 mins HL');
check('nasa huli ang manipis', pat[pat.length-1].name, '4 Hour HL');
check('tunay pa rin ang mataas na win rate', pat.find(r=>r.name==='4 Hour HL').rate > pat[0].rate, true);
const ses = api.setup('Session');
check('may session', ses.length, 3);
check('may headline', /sx-headline/.test(OUT.setupEdgeBody), true);

console.log('\n   Ang confluence bands:');
api = run([
  ...many(10, { _cfl:{ state:'pass' }, profit_loss:200, win_loss:'Win' }),
  ...many(8,  { _cfl:{ state:'near' }, profit_loss:-50, win_loss:'Loss' }),
  ...many(6,  { _cfl:{ state:'fail' }, profit_loss:-180, win_loss:'Loss' }),
]);
const cf = api.setup('Confluence band');
cf.forEach(r => console.log('   ' + r.name.padEnd(18) + String(r.n).padStart(3) + '  ' +
  (r.ret>=0?'+':'−') + Math.abs(r.ret).toFixed(2) + '%'));
check('tatlong banda', cf.length, 3);
check('nangunguna ang pasado', cf[0].name, 'Passed the bar');
check('huli ang bagsak', cf[cf.length-1].name, 'Well under');

console.log('\n6. ANG PANEL MISMO\n');
// Kailangan ng fixture na may laman ang DALAWANG grupo ng eksperimento —
// ang nauna ay puro confluence lang, kaya walang eksperimentong lumalabas.
run([
  ...many(8, { unfollowed_rules:'Chased Extended Move', win_loss:'Loss', profit_loss:-150 }),
  ...many(9, { unfollowed_rules:'No BE at Prev High/Low', profit_loss:200 }),
  ...many(7, { unfollowed_rules:"BE'd at Prev High/Low", profit_loss:-40 }),
  ...many(20,{ unfollowed_rules:'Rules Followed', profit_loss:120 }),
]);
// Tatlo na: nadagdag ang "What happened in the trade" — ang mga observation
// tag na na-rank, na dating kinukuwenta pero hindi ipinapakita kahit saan.
check('may limang seksyon', (OUT.disciplineBody.match(/dx-half"/g)||[]).length, 5);
check('may pangalan ang listahan ng rules', /Rules you break most/.test(OUT.disciplineBody), true);
check('may seksyon ng report', /Three questions worth settling/.test(OUT.disciplineBody), true);
check('nandiyan ang tanong sa BE', /should I move my stop to entry/.test(OUT.disciplineBody), true);
check('nandiyan ang tanong sa invalidation', /When the setup invalidates, should I cut/.test(OUT.disciplineBody), true);
check('nandiyan ang tanong sa manual exit', /close a trade by hand/.test(OUT.disciplineBody), true);
check('may legend ang setup panel', /sx-legend/.test(OUT.setupEdgeBody), true);
// Ang grupo na walang laman ay hindi kumukuha ng espasyo.
run(many(10, { unfollowed_rules:'Rules Followed', profit_loss:100 }));
check('walang eksperimento -> walang grupo', /Before you enter/.test(OUT.disciplineBody), false);
check('   may paliwanag sa halip', /Nothing tagged yet/.test(OUT.disciplineBody), true);
check('walang trade -> paliwanag', (run([]), /No trades in view/.test(OUT.disciplineBody)), true);

console.log('\n7. WALA NANG EDGE MAP\n');
['renderEdgeMap','_emDimensions','_emFindings','EM_FILTERS','toggleEdgeFilter'].forEach(n => {
  check('wala na ang ' + n, new RegExp('(?<![\\w])' + n + '(?![\\w])').test(js), false);
});
const css = require('fs').readFileSync(__ROOT + '/css/style.css','utf8');
check('wala nang .em-* na CSS', /\.em-/.test(css), false);
const html = require('fs').readFileSync(__ROOT + '/dashboard.html','utf8');
check('wala na ang edgeMapBody', /edgeMapBody/.test(html), false);
check('may disciplineBody', /id="disciplineBody"/.test(html), true);
check('may setupEdgeBody', /id="setupEdgeBody"/.test(html), true);
check('may panel-info na discipline', /discipline: \['Discipline/.test(js), true);
check('may panel-info na setupedge', /setupedge: \['Pattern/.test(js), true);

console.log('\n8. ANG ISANG-TINGIN NA SUMMARY\n');
// Ang reklamo: masyadong maraming babasahin bago malaman kung ok ba o hindi.
// Kaya ang unang bagay sa panel ay dapat isang hatol, at ang mga listahan ay
// dapat nasa likod ng disclosure — hindi bukas agad.
api = run([
  ...many(30, { unfollowed_rules:'Rules Followed', win_loss:'Win', profit_loss:250 }),
  ...many(2,  { unfollowed_rules:'Revenge Trade',  win_loss:'Loss', profit_loss:-400 }),
]);
console.log('   hatol: ' + api.summary.state.txt + '  (' + Math.round(api.summary.rate) + '%)');
console.log('   pinakamahal: ' + (api.summary.worst ? api.summary.worst.name : '—'));
check('mataas ang rate -> maganda ang hatol', api.summary.state.tone, 'good');
check('30 sa 32 ang malinis', api.summary.tagged - api.summary.breached, 30);
check('natukoy ang pinakamahal na rule', api.summary.worst.name, 'Do not trade on emotion');
check('nasa unahan ang summary', /dx-summary/.test(OUT.disciplineBody), true);
// Wala nang <details>: apat na report ang panel ngayon at lahat sila ay
// nararapat makita agad. Ang pagkakasunod lang ang mahalaga — buod, tapos ang
// tatlong tanong, tapos ang listahan ng rules.
// Table na ang tatlong tanong — Question | What your tags say | Suggestion.
check('nauuna ang summary sa mga report',
  OUT.disciplineBody.indexOf('dx-summary') < OUT.disciplineBody.indexOf('rp-tbl'), true);
check('nauuna ang mga report sa listahan ng rules',
  OUT.disciplineBody.indexOf('rp-tbl') < OUT.disciplineBody.indexOf('Rules you break most'), true);
check('tatlong hanay', /<th>Question<\/th><th>What your tags say<\/th><th>Suggestion<\/th>/.test(OUT.disciplineBody), true);
/* Apat na: hinati ang invalidation sa "dapat ba akong humawak" at "dapat ba
   akong pumutol". Magkaibang tanong sila at magkaibang lunas, at ang
   pagsasama sa kanila ay pumipigil sa panig na may datos na magsalita. */
/* Walo na. Ang stop width, at ang tatlong tanong na walang kapareha —
   Chased Extended Move, Traded Into Key Level, Entered Without Confirmation.
   Ang bilang na ito ay bantay lamang: kapag may naidagdag na tanong at hindi
   ito nagbago, ibig sabihin hindi ito umaabot sa panel. */
check('walong hilera', (OUT.disciplineBody.match(/<td class="rp-q"/g) || []).length, 8);
check('wala nang naka-collapse', /<details/.test(OUT.disciplineBody), false);

console.log('\n   Kapag palpak ang disiplina:');
api = run([
  ...many(4,  { unfollowed_rules:'Rules Followed', win_loss:'Win', profit_loss:100 }),
  ...many(16, { unfollowed_rules:'Revenge Trade',  win_loss:'Loss', profit_loss:-300 }),
]);
console.log('   hatol: ' + api.summary.state.txt + '  (' + Math.round(api.summary.rate) + '%)');
check('mababang rate -> pulang hatol', api.summary.state.tone, 'bad');

console.log('\n   Walang tag:');
api = run(many(10, { unfollowed_rules:'' }));
check('walang rate', api.summary.rate, 'null');
check('naghihintay na hatol', api.summary.state.tone, 'wait');
check('hindi umiiyak sa walang laman', /Tick the tags as you journal/.test(OUT.disciplineBody), true);

console.log('\n   Ang porsyento — may piso na ngayon at may kabuuan:');
api = run([
  ...many(8,  { unfollowed_rules:'Entered Without Confirmation', win_loss:'Loss', profit_loss:-120 }),
  // Kailangan ng tag na kabilang sa isa sa dalawang tanong — kung hindi,
  // walang arm na may bilang na maipapakita at walang sinusukat ang test.
  ...many(6,  { unfollowed_rules:'Held Through Invalidation', win_loss:'Loss', profit_loss:-90 }),
  ...many(20, { unfollowed_rules:'Rules Followed', win_loss:'Win', profit_loss:180 }),
]);
// Ang hatol ay pangungusap na ngayon, hindi dalawang arm na may malaking
// numero. Ang hinahanap: sinasabi nito ang panalo KADA BILANG, hindi porsyento
// lang at lalong hindi piso.
/* Ang "N of M right" ay galing sa sangang naghahambing ng dalawang panig, na
   wala na — isang panig lang ang bawat tanong ngayon, at "was right/wrong N of
   M times" ang sinasabi nito. Ang hinahanap pa rin ay iisa: bilang, hindi
   porsyento at lalong hindi piso. */
check('may bilang ang bawat panig',
  /was (right|wrong) \d+ of \d+ times/.test(OUT.disciplineBody), true);
check('sinasabi kung alin ang hindi pa naka-tag', /never tagged/.test(OUT.disciplineBody), true);
check('may hatol na hanay', /<td class="rp-s">/.test(OUT.disciplineBody), true);
// Ang mahigpit na panuntunan: walang dolyar na simbolo kahit saan sa panel.
check('walang piso kahit saan sa panel', /\$/.test(OUT.disciplineBody), false);
check('walang piso sa setup panel', /\$/.test(OUT.setupEdgeBody), false);

console.log('\n9. ANG DRILLDOWN SA SETUP PANEL\n');
api = run(many(10, { pattern_type:'15 mins HL' }));
const dims = api.SETUP_DIMENSIONS;
console.log('   ' + dims.map(g => g.group + ' (' + g.dims.length + ')').join('\n   '));
/* Apat na grupo na ngayon, naka-ayos sa PROSESO — hindi sa uri ng field.
   Nakaupo ka, may nakita ka, tinakbo mo ang checklist, pumindot ka. Ang
   pagbabasa mula kaliwa pakanan ay pagsunod sa mismong dinaanan mo. */
check('apat na grupo', dims.length, 4);
check('labing-apat na dimension', dims.reduce((s,g) => s + g.dims.length, 0), 14);
check('may Sequence na card', dims.some(g => g.dims.some(d => d.label === 'Sequence')), true);
check('naka-numero ang mga grupo',
  dims.every((g, i) => g.group.startsWith((i + 1) + ' · ')), true);

// Ang grupo 3 ay dapat sumunod sa SARILING pagkakasunod ng checklist niya sa
// CONFLUENCE_SETUPS: top timeframe, tapos divergence, tapos sequence. Ang
// band ay huli — kabuuan 'yon ng mga nasa itaas nito, hindi katabi nila.
const step3 = dims[2].dims.map(d => d.label);
console.log('   grupo 3: ' + step3.join(' -> '));
check('HTF bias muna — tanong 1 sa bawat checklist', step3[0], 'HTF bias');
check('Divergence bago ang Sequence', step3.indexOf('Divergence') < step3.indexOf('Sequence'), true);
check('huli ang Confluence band', step3[step3.length - 1], 'Confluence band');

// At ang proseso mismo: ang Session ay bago ang Pattern, ang Pattern ay bago
// ang checklist, ang checklist ay bago ang entry.
const flat = dims.flatMap(g => g.dims.map(d => d.label));
const before = (a, b) => flat.indexOf(a) < flat.indexOf(b);
check('Session bago ang Pattern', before('Session', 'Pattern'), true);
check('Pattern bago ang HTF bias', before('Pattern', 'HTF bias'), true);
check('checklist bago ang Entry trigger', before('Confluence band', 'Entry trigger'), true);
check('huli ang Execution TF', flat[flat.length - 1], 'Execution TF');
// Ang pangalan ng grupo ay isang banda na ngayon na may numerong chip — ang
// 11px na kupas na linya ay nababasa bilang caption sa bloke SA ITAAS nito.
check('may banda ang grupo', /class="grp-head"/.test(OUT.setupEdgeBody), true);
check('may numerong chip', /<span class="grp-n">1<\/span>/.test(OUT.setupEdgeBody), true);
check('hiwalay ang numero sa pamagat',
  /<h4 class="grp-t">Before you sit down<\/h4>/.test(OUT.setupEdgeBody), true);
// Isang banda kada grupong may laman — nilalaktawan ang grupong walang
// kahit isang card, kaya dalawa lang ito sa fixture na ito.
const bands = (OUT.setupEdgeBody.match(/class="grp-head"/g) || []).length;
const groups = (OUT.setupEdgeBody.match(/class="sx-group"/g) || []).length;
check('isang banda kada grupo', bands, groups);
check('may laman ang mga grupo', bands >= 2, true);
check('ipinapaliwanag ang "Met"', /means the answer scored/.test(OUT.setupEdgeBody), true);

console.log('\n10. PANGUNGUSAP, HINDI BAR\n');
api = run([
  ...many(9,  { unfollowed_rules:'Revenge Trade',      win_loss:'Loss' }),
  ...many(4,  { unfollowed_rules:'Lack of Confluence', win_loss:'Loss' }),
  ...many(2,  { unfollowed_rules:'Lack of Confluence', win_loss:'Win'  }),
  ...many(25, { unfollowed_rules:'Rules Followed',     win_loss:'Win'  }),
]);
[...OUT.disciplineBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)
  .forEach(m => console.log('   | ' + m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()));
check('table na, hindi talata', /dx-tbl/.test(OUT.disciplineBody), true);
check('walang mahabang pangungusap sa listahan', /dx-f-txt/.test(OUT.disciplineBody), false);
// Ang listahan ay per-TAG na ngayon, hindi per rule-group. Ang "Revenge Trade"
// ang may pinakamaraming talo dito, kaya dapat siya ang nauuna at dapat siya
// ang tinutukoy ng summary card sa itaas.
check('nauuna ang pinakamaraming talo',
  OUT.disciplineBody.indexOf('Revenge Trade') <
    OUT.disciplineBody.indexOf('Lack of Confluence'), true);
check('minarkahan ang breach na tag', /dx-breach/.test(OUT.disciplineBody), true);
check('may buong detalye sa hover', /title="[^"]*won, [^"]*lost/.test(OUT.disciplineBody), true);
check('may column header', /<th class="n">Trades<\/th>/.test(OUT.disciplineBody), true);
check('may hatol na dalawang salita', /<td class="v">cut this out<\/td>/.test(OUT.disciplineBody), true);
check('wala nang bar', /dx-r-bar/.test(OUT.disciplineBody), false);
check('wala nang dalawang arm', /dx-arms/.test(OUT.disciplineBody), false);
check('isang row bawat tag', (OUT.disciplineBody.match(/<tr[^>]*title=/g)||[]).length > 0, true);

console.log('\n11. CROSS-FILTER SA SETUP PANEL\n');
api = run([
  ...many(10, { session:'London',   pattern_type:'15 mins HL', win_loss:'Win'  }),
  ...many(6,  { session:'London',   pattern_type:'5 mins LH',  win_loss:'Loss' }),
  ...many(8,  { session:'New York', pattern_type:'15 mins HL', win_loss:'Loss' }),
]);
check('walang filter sa simula', JSON.stringify(api.filters()), '{}');
let pat0 = api.setup('Pattern');
console.log('   bago pindutin: 15 mins HL = ' + pat0.find(r=>r.name==='15 mins HL').n + ' trades');

api.click('Session', 'London');
check('naitala ang filter', api.filters().Session, 'London');
const pat1 = api.setup('Pattern');
console.log('   pagkapindot ng London: 15 mins HL = ' + pat1.find(r=>r.name==='15 mins HL').n + ' trades');
check('nag-filter ang IBANG card', pat1.find(r=>r.name==='15 mins HL').n, 10);
check('nawala ang di-London na row', pat1.length, 2);

// Ang pinindot na card ay HINDI nagfi-filter sa sarili — kung hindi, isang row
// na lang ang matitira at hindi na siya mapapalitan ng New York.
const ses1 = api.setup('Session');
check('buo pa rin ang pinindot na card', ses1.length, 2);
check('nandiyan pa rin ang New York', ses1.some(r => r.name === 'New York'), true);

check('may chip sa taas', /sx-chips/.test(OUT.setupEdgeBody), true);
check('nakasulat ang bilang sa chip', /16 trades/.test(OUT.setupEdgeBody), true);
check('may markang naka-select na row', /sx-row on/.test(OUT.setupEdgeBody), true);

console.log('\n   Pindot ulit sa parehong row — dapat bumalik:');
api.click('Session', 'London');
check('nawala ang filter', JSON.stringify(api.filters()), '{}');
check('bumalik ang lahat', api.setup('Pattern').find(r=>r.name==='15 mins HL').n, 18);
check('wala nang chip', /sx-chips/.test(OUT.setupEdgeBody), false);

console.log('\n   Dalawang filter nang sabay:');
api.click('Session', 'London');
api.click('Pattern', '15 mins HL');
check('dalawang naka-filter', Object.keys(api.filters()).length, 2);
check('pinagsama ang dalawa', api.setup('Day').length >= 0, true);
const sesBoth = api.setup('Session');
check('hindi sinasarili ng Session ang sariling filter',
  sesBoth.find(r => r.name === 'London').n, 10);
api.clearFilters();
check('nalinis lahat', JSON.stringify(api.filters()), '{}');

console.log('\n   Ang "H&S" — totoong chart pattern na may ampersand:');
// Kapag hindi na-escape ang &, hahanapin ng browser ang entity sa gitna ng
// argumento at hindi na tatama ang value sa naka-imbak na filter.
api = run([
  ...many(7, { chart_pattern:'H&S',        win_loss:'Loss' }),
  ...many(9, { chart_pattern:'Double Top', win_loss:'Win'  }),
]);
const row = OUT.setupEdgeBody.match(/onclick="toggleSetupFilter\(([^)]*H[^)]*S[^)]*)\)"/);
console.log('   onclick -> toggleSetupFilter(' + (row ? row[1] : '???') + ')');
check('naka-escape ang ampersand', /&amp;quot;H&amp;amp;S&amp;quot;|&quot;H&amp;S&quot;/.test(OUT.setupEdgeBody), true);
check('walang hubad na & sa loob ng onclick',
  /onclick="[^"]*[^p;]&(?!amp;|quot;|#39;|lt;)/.test(OUT.setupEdgeBody), false);
// At ang mahalaga: tumatama pa rin ito sa tunay na value kapag pinindot.
api.click('Chart pattern', 'H&S');
check('tumama ang filter sa H&S', api.filters()['Chart pattern'], 'H&S');
check('7 trades ang natira', api.setup('Pattern').reduce((s,r) => s + r.n, 0), 7);
api.clearFilters();

console.log('\n   Hindi nagagalaw ang Discipline panel:');
api = run([
  ...many(10, { session:'London',   pattern_type:'15 mins HL', win_loss:'Win'  }),
  ...many(8,  { session:'New York', pattern_type:'15 mins HL', win_loss:'Loss' }),
]);
const discBefore = OUT.disciplineBody;
api.click('Session', 'London');
check('ang Discipline ay hindi nagbago', OUT.disciplineBody === discBefore, true);
api.clearFilters();

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
