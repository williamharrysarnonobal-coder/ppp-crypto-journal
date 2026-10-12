const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
    // Ang Year overview. Ang pinaka-madaling masira dito ay ang mini grid: ang
// unang araw ng buwan ay dapat tumapat sa TAMANG column, at ang bilang ng
// kahon ay dapat eksakto sa bilang ng araw — kasama ang Pebrero ng leap year.
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

/* Ang mga bagong bahagi ng Year overview — ang journey band at ang bilang ng
   rules kept sa bawat month card — isinusulat NANG ISANG BESES.

   Tatlong new Function ang meron sa file na ito, at ang paglalagay ng listahan
   sa tatlo ay ang mismong pagkakamaling paulit-ulit ko sa CSS: ayusin ang isa,
   kalimutan ang dalawa. Isang pinagmumulan, tatlong gamit. */
const EXTRA = `
  ${fn('_yearJourneyStreak')}
  ${fn('_yearJourney')}
  ${fn('_yearJourneyHtml')}
  ${(() => {
    /* Ang buong rehiyon ng tag machinery sa isang hiwa, hindi isa-isa.

       Sinubukan ko munang kunin ang bawat piraso nang hiwalay at nabigo ito:
       ang _TAG_SENTINEL_SET ay nakabuo mula sa TAG_SENTINELS, na hindi ko
       kinuha, kaya ReferenceError. Ang isang listahan ng piraso ay isang
       listahang kailangang panatilihin — at ang dependency na idadagdag bukas
       ay hindi ko na maaalala.

       Isang hiwa mula sa unang deklarasyon hanggang sa huli: kung may
       idadagdag doon, kasama na ito nang kusa. */
    // Mula sa listahan ng mga tag: ang _tagKind ay bumabasa na rito.
    const a = js.indexOf('const UNFOLLOWED_RULES_OPTIONS = [');
    const b = js.indexOf('const _brokenRuleTags = ');
    if(a < 0 || b < 0) throw new Error('hindi mahanap ang tag machinery');
    return js.slice(a, js.indexOf('\n', b));
  })()}
  ${(js.match(/const WIN_RATE_STRONG[^\n]*/) || [''])[0]}
  ${(js.match(/const WR_MARGIN_STRONG[^\n]*/) || [''])[0]}
  ${fn('_winRateTint')}
  ${fn('_breakevenWinRate')}
  ${fn('_winRateTintRR')}
  ${fn('_winRateWhy')}
  ${(js.match(/const RULES_KEPT_STRONG[^\n]*/) || [''])[0]}
  ${fn('_rulesKeptTint')}
  ${fn('_rulesKeptClass')}
`;

let OUT = '', LABEL = '';
const els = {
  yearOverviewBody: { set innerHTML(v){ OUT = v; } },
  yearOverviewLabel: { set textContent(v){ LABEL = v; } },
  accountFilter: { value: 'all' },
  yearFilter: { value: '' },
};
const doc = { getElementById: id => els[id] || null };

function render(all, year, accountValue){
  els.accountFilter.value = accountValue || 'all';
  OUT = ''; LABEL = '';
  new Function('document', 'ALL_TRADES', 'netPnl', 'escapeHtml', 'fmtMoney',
               'fmtNum', '_isWin', '_isLoss', 'PROFILE_DATA', 'YEAR', '_askAmt', `
    ${js.match(/const _isBE = [^\n]*/)[0]}
    ${js.match(/const SALARY_DEFAULTS = \{[\s\S]*?\n\}/)[0]}
    /* Kinuha nang buo mula sa dashboard.js, hindi ginaya. Sa Node ay walang
       localStorage, kaya ang try/catch sa loob ng _realMoneyOnly ay nahuhuli ang
       ReferenceError at nagbabalik ng false — "naka-off ang Real money", na
       siyang estadong sinusuri ng sim na ito. Kung magbabago ang kahulugan ng
       pagsala doon, dito rin ito magbabago sa halip na tahimik na maiwan. */
    ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
    ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
    ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
    ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
    ${fn('_salarySettings')}
    ${fn('_salMoney')}
    ${/const _GOAL_TROPHY = `[\s\S]*?`;/.exec(js)[0]}
    ${fn('_dayKeyUTC')}
    ${fn('_tagArmStats')}
    ${fn('_winRateOf')}
    let YEAR_OVERVIEW = YEAR;
    ${fn('_yearOverviewPool')}
    ${fn('_yearGoalStrip')}
    ${fn('_goalTone')}
    ${fn('_yearGoalBar')}
    ${fn('_yearMiniGrid')}
    ${EXTRA}
    ${fn('renderYearOverview')}
    renderYearOverview();
  `)(doc, all, t => (t.profit_loss || 0) - (t.fee || 0),
     s => String(s ?? ''),
     n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2),
     (n, d) => Number(n).toFixed(d),
     t => t.win_loss === 'Win', t => t.win_loss === 'Loss',
     { salary_settings: { monthly_salary: 8000, aed_per_usd: 3.6725 } }, year,
     n => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
  return OUT;
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) + got + (ok ? '' : '   <-- ' + want));
};

const T = (dateStr, pl, wl, acc) => ({
  close_date: new Date(dateStr + 'T12:00:00'), profit_loss: pl, fee: 0,
  win_loss: wl, account: acc || 'Upscale Trade 5K',
});

console.log('1. ANG MINI GRID — tumatapat ba ang araw sa tamang column?\n');
// Enero 2026 ay nagsisimula sa Huwebes (getDay 4), kaya dapat 4 na pad.
let h = render([T('2026-01-15', 100, 'Win')], 2026);
const jan = h.slice(h.indexOf('January'), h.indexOf('February'));
// Bilangin sa buong tag: ang /yo-d/ mag-isa ay tumatama rin sa container na
// class="yo-days", kaya laging sobra ng isa ang bilang.
const cells = s => (s.match(/<i class="yo-d/g) || []).length;
const pads  = s => (s.match(/<i class="yo-d pad/g) || []).length;
// Ang pad sa UNAHAN lang ang nagtatakda ng column ng unang araw — may pad din
// sa dulo ngayon para maging pantay ang lahat ng grid.
const leadPads = s => {
  // Hindi pwedeng [^p]: ang espasyo sa `class="yo-d pad"` ay tumatama rin
  // doon, kaya ang UNANG pad mismo ang natatagpuan at zero ang bilang.
  const i = s.search(/<i class="yo-d(?! pad)/);
  return ((i < 0 ? s : s.slice(0, i)).match(/<i class="yo-d pad/g) || []).length;
};
check('Enero 2026: 4 na pad sa unahan (Huwebes)', leadPads(jan), 4);
check('Enero: 31 na araw', cells(jan) - pads(jan), 31);

// Pebrero 2028 — leap year.
h = render([T('2028-02-10', 50, 'Win')], 2028);
const feb = h.slice(h.indexOf('February'), h.indexOf('March'));
check('Pebrero 2028 (leap): 29 na araw', cells(feb) - pads(feb), 29);
h = render([T('2027-02-10', 50, 'Win')], 2027);
const feb27 = h.slice(h.indexOf('February'), h.indexOf('March'));
check('Pebrero 2027: 28 na araw', cells(feb27) - pads(feb27), 28);

console.log('\n1b. PANTAY NA TAAS — laging 42 na cell\n');
// Ito ang hiling: hindi pantay ang taas ng kahon dahil apat hanggang anim na
// hanay ang kailangan ng bawat buwan. Kapag naka-fix sa anim, nasa parehong
// taas ang mga stat sa ilalim ng lahat ng labindalawang kahon.
[[2026, 'January', 'February'], [2027, 'February', 'March'],
 [2026, 'August', 'September'], [2028, 'February', 'March']].forEach(([yy, a, b]) => {
  h = render([T(yy + '-01-15', 10, 'Win')], yy);
  const seg = h.slice(h.indexOf(a), h.indexOf(b));
  check(a + ' ' + yy + ' — 42 na cell (6 hanay)', cells(seg), 42);
});
// At sa buong taon, walang kahit isang grid na iba ang laki.
h = render([T('2026-01-15', 10, 'Win')], 2026);
const perMonth = [...h.matchAll(/<div class="yo-days">([\s\S]*?)<\/div>/g)]
  .map(m => (m[1].match(/<i class="yo-d/g) || []).length);
console.log('   bilang ng cell kada buwan: ' + [...new Set(perMonth)].join(', '));
check('labindalawang grid', perMonth.length, 12);
check('iisang laki lang silang lahat', new Set(perMonth).size, 1);

console.log('\n2. LABINDALAWANG BUWAN PALAGI\n');
h = render([T('2026-03-01', 100, 'Win')], 2026);
check('12 na kahon kahit isang buwan lang may trade',
  (h.match(/class="yo-month/g) || []).length, 12);
check('walang trade -> tahimik na estilo', (h.match(/yo-month quiet/g) || []).length, 11);
check('may trade -> berde', /yo-month up/.test(h), true);

console.log('\n3. ANG MGA BILANG\n');
const YEAR = [
  T('2026-01-05',  200, 'Win'),  T('2026-01-09', -100, 'Loss'),
  T('2026-02-03',  300, 'Win'),  T('2026-02-11',  150, 'Win'),
  T('2026-03-07', -400, 'Loss'), T('2026-03-08', -250, 'Loss'),
  T('2026-04-02',    0, 'Breakeven'),
];
h = render(YEAR, 2026);
const stat = k => {
  const m = new RegExp('yo-s-k">' + k + '<\\/span><span class="yo-s-v[^>]*>([^<]*)').exec(h);
  return m ? m[1] : '(wala)';
};
['Profit','Trades','Win','Loss','BE','Win rate','Green months']
  .forEach(k => console.log('   ' + k.padEnd(14) + stat(k)));
check('kabuuang trade', stat('Trades'), 7);
check('panalo', stat('Win'), 3);
check('talo', stat('Loss'), 3);
check('breakeven', stat('BE'), 1);
check('profit', stat('Profit'), '-$100.00');
// 3 panalo sa 6 na DECIDED — hindi kasama ang lone breakeven, kagaya ng
// Calendar at ng KPI row. Dati 43% ito (3/7, kasama ang BE) at 'yon mismo ang
// dahilan kung bakit hindi tumutugma ang panel na ito sa Calendar.
check('win rate ay decided-only, gaya ng Calendar', stat('Win rate'), '50%');
check('berdeng buwan', stat('Green months'), '2 of 4');
check('pinakamahusay na buwan', /Best month <b>February<\/b> at \+\$450\.00/.test(h), true);
check('pinakamasama', /worst\s+<b>March<\/b> at -\$650\.00/.test(h), true);

console.log('\n4. HINAHATI NG TAON, HINDI NAGTATAGPO\n');
const TWO = YEAR.concat([T('2025-06-01', 9999, 'Win')]);
h = render(TWO, 2026);
check('hindi kasama ang 2025', stat('Trades'), 7);
h = render(TWO, 2025);
check('ang 2025 ay may isa', stat('Trades'), 1);
check('tama ang label', LABEL, 2025);
h = render(TWO, 2024);
check('walang taon -> paliwanag', /No closed trades in 2024/.test(h), true);

console.log('\n5. SUMUSUNOD SA ACCOUNT FILTER\n');
const MIX = [
  T('2026-01-05', 200, 'Win',  'Upscale Trade 5K'),
  T('2026-01-06', 500, 'Win',  'Upscale Trade 50K'),
  T('2026-02-06', -80, 'Loss', 'Upscale Trade 50K'),
];
h = render(MIX, 2026, 'all');
check('lahat ng account', stat('Trades'), 3);
h = render(MIX, 2026, 'Upscale Trade 5K');
check('5K lang', stat('Trades'), 1);
check('at ang profit nito', stat('Profit'), '+$200.00');

console.log('\n6. WALANG CLOSE DATE — HINDI BINIBILANG\n');
const OPEN = YEAR.concat([{ close_date: null, profit_loss: 500, fee: 0, win_loss: 'Win',
                            account: 'Upscale Trade 5K' }]);
h = render(OPEN, 2026);
check('bukas pa -> hindi kasama', stat('Trades'), 7);

console.log('\n7. NAKIKITA BA ANG MGA NUMERO?\n');
h = render(YEAR, 2026);
// Ang headline sa itaas ("Best month February...") ay banggit din ng pangalan
// ng buwan, at nauuna ito sa grid — kaya baligtad ang hiwa kung buong HTML ang
// hahanapan. Sa loob lang ng grid maghanap.
// Binabasa ang KASALUKUYANG h sa tuwing tatawagin — dating naka-const ito sa
// isang lumang render, kaya ang hinahanap sa ibaba ay nasa maling HTML.
const monthBlock = name => {
  const grid = h.slice(h.indexOf('<div class="yo-grid">'));
  const a = grid.indexOf('>' + name + '<');
  if(a < 0) return '';
  const rest = grid.slice(a);
  const b = rest.indexOf('class="yo-month', 1);
  return b < 0 ? rest : rest.slice(0, b);
};
const jan26 = monthBlock('January');
// Bawat araw ay may nakasulat na petsa, hindi lang kulay na kahon.
const printed = [...jan26.matchAll(/<i class="yo-d[^"]*"[^>]*>(\d+)<\/i>/g)].map(m => +m[1]);
console.log('   Enero: ' + printed.slice(0, 10).join(' ') + ' ... ' + printed.slice(-3).join(' '));
check('may numero ang bawat araw', printed.length, 31);
check('nagsisimula sa 1', printed[0], 1);
check('nagtatapos sa 31', printed[printed.length - 1], 31);
check('ang pad ay walang numero', /<i class="yo-d pad"><\/i>/.test(jan26), true);
check('may P&L sa hover', /title="5 — \+\$200\.00 · 1 trade"/.test(jan26), true);

console.log('\n8. KULAY NG W / L / BE\n');
// Berde ang W, pula ang L, asul ang BE — sa taas at sa bawat buwan.
check('taas: W berde',  /yo-s-k">Win<\/span><span class="yo-s-v win"/.test(h), true);
check('taas: L pula',   /yo-s-k">Loss<\/span><span class="yo-s-v loss"/.test(h), true);
check('taas: BE asul',  /yo-s-k">BE<\/span><span class="yo-s-v be"/.test(h), true);
check('buwan: W berde', /<span class="yo-c win"[^>]*>1W<\/span>/.test(jan26), true);
check('buwan: L pula',  /<span class="yo-c loss"[^>]*>1L<\/span>/.test(jan26), true);
check('buwan: BE asul', /<span class="yo-c be"[^>]*>0BE<\/span>/.test(jan26), true);

console.log('\n9. WIN RATE KADA BUWAN\n');
/* Sariling KAHON na ngayon ang RR at ang Win rate, hindi na magkasama sa
   isang hilera. Bawat isa ay .yo-p-box na may <em>pangalan</em><b>halaga</b>.
   Hinahanap ko ang halaga SA PAMAMAGITAN NG PANGALAN, hindi sa pagkakasunod,
   para hindi na masira ito sa susunod na pagpapalit ng ayos. */
const boxOf = (s, name) => {
  const re = new RegExp('<span class="yo-p-box"[^>]*(?:\\n[^>]*)*>\\s*<em>' +
                        name + '<\\/em><b>([^<]*)<\\/b>', 'i');
  const m = re.exec(s);
  return m ? m[1] : '(wala)';
};
const rateOf = mon => boxOf(monthBlock(mon), 'Win rate');
['January','February','March','April'].forEach(mo =>
  console.log('   ' + mo.padEnd(10) + rateOf(mo)));
check('Enero: 1 panalo sa 2', rateOf('January'), '50%');
check('Pebrero: 2 sa 2', rateOf('February'), '100%');
check('Marso: 0 sa 2', rateOf('March'), '0%');
// Abril ay isang breakeven lang — walang decided na trade, kaya walang rate.
check('Abril: BE lang -> walang rate', rateOf('April'), '—');
check('walang trade -> walang chips', /yo-m-foot empty/.test(h), true);
/* Ang hiniling niya: "paghiwalayin mo box ng RR and Win Rate para mas maganda
   hindi magulong tignan." Dalawang kahon kada buwan, hindi isa — kung
   pagsasamahin ulit ng kahit sino, dito ito mahuhuli. */
check('dalawang hiwalay na kahon kada buwan',
  (monthBlock('January').match(/class="yo-p-box"/g) || []).length, 2);

console.log('\n10. DAPAT PAREHO NG CALENDAR ANG WIN RATE\n');
// Ito ang bug na nakita niya: 23W 33L 7BE ay 41% sa Calendar pero 37% dito,
// dahil isinasama ng Year overview ang breakeven sa denominator. Ang buong
// app ay wins/(wins+losses); ang panel na ito lang ang sumasalungat.
const AUG = [
  ...Array.from({length:23}, (_,i) => T('2026-08-' + String((i % 28) + 1).padStart(2,'0'), 100, 'Win')),
  ...Array.from({length:33}, (_,i) => T('2026-08-' + String((i % 28) + 1).padStart(2,'0'), -50, 'Loss')),
  ...Array.from({length:7},  (_,i) => T('2026-08-' + String((i % 28) + 1).padStart(2,'0'), 0, 'Breakeven')),
];
h = render(AUG, 2026);
const calRate = Math.round(23 / (23 + 33) * 100);        // paraan ng Calendar
const withBE  = Math.round(23 / (23 + 33 + 7) * 100);     // ang lumang mali
console.log('   Calendar: ' + calRate + '%   |   kung isasama ang BE: ' + withBE + '%');
console.log('   Year overview: buwan ' + rateOf('August') + ', taon ' + stat('Win rate'));
check('kada-buwan ay tumutugma sa Calendar', rateOf('August'), calRate + '%');
check('hindi na ang lumang bilang', rateOf('August') === withBE + '%', false);
check('pati ang buong taon ay tumutugma', stat('Win rate'), calRate + '%');
// Ang W/L/BE na bilang ay nananatiling buo — 63 pa rin ang kabuuan.
check('buo pa rin ang bilang ng trade', stat('Trades'), 63);
check('nakikita pa rin ang BE', stat('BE'), 7);
check('sinasabi ng hover na hindi kasama ang BE',
  /7 breakevens are not counted, same as the Calendar/.test(h), true);

console.log('\n11. AVG RR AT GOAL SA BAWAT BUWAN\n');
// 8,000 AED / 3.6725 = $2,178.35 kada buwan ang goal sa harness na ito.
const RRY = [
  T('2026-01-05', 2500, 'Win'), T('2026-01-09',  300, 'Win'),
  T('2026-02-03',  400, 'Win'), T('2026-02-11', -100, 'Loss'),
];
RRY[0].rr = 3; RRY[1].rr = 1; RRY[2].rr = 2;   // ang ika-apat ay walang RR
h = render(RRY, 2026);
const jan11 = monthBlock('January'), feb11 = monthBlock('February');
const rrOf = s => boxOf(s, 'RR');
// Progress bar na ito ngayon, hindi chip — ang porsyento ay nasa pill.
const goalOf = s => (s.match(/<b style="--p:[^"]*">([^<]*)</) || [,'(wala)'])[1];
const goalTone = s => (s.match(/<div class="yo-bar (\w+)"/) || [,'(wala)'])[1];
console.log('   Enero   RR ' + rrOf(jan11) + '   goal ' + goalOf(jan11));
console.log('   Pebrero RR ' + rrOf(feb11) + '   goal ' + goalOf(feb11));
check('Enero: average ng 3 at 1', rrOf(jan11), '2.00');
check('Pebrero: 2 lang ang may RR, hindi zero ang wala', rrOf(feb11), '2.00');
// Naabot ang Enero, kaya WALA nang pill — nasa hover na ang porsyento.
check('walang pill ang naabot', goalOf(jan11), '(wala)');
check('nasa hover ang 129%', /title="[^"]*129%/.test(jan11) || /129%/.test(jan11), true);
check('Pebrero: $300 sa $2,178 = 14%', goalOf(feb11), '14%');

/* ANG BUWANG LUGI. Ito ang "0% padin" na nakita niya sa Year overview.

   Ang goalPct ay nakabalot dati sa Math.max(0, ...) sa mismong pinagmumulan,
   kaya ang bula, ang hover AT ang end cap ay pare-parehong nagsasabing 0% para
   sa isang buwang lugi ng daan-daang dolyar. Ang clamp ay nasa maling lugar:
   ang POSISYON lang ng bar ang dapat naka-clamp, at naka-clamp na iyon sa
   _yearGoalBar. Isang clamp, sa dulo, kung saan ito kailangan.

   Dalawang bagay ang tinitingnan: negatibo ang BILANG, at zero pa rin ang
   LAPAD — dahil walang bar na negatibo. */
{
  const LOSS = [T('2026-03-04', -400, 'Loss'), T('2026-03-09', -250, 'Loss')];
  const hl = render(LOSS, 2026);
  const mar = (() => {
    const a = hl.indexOf('March'), b = hl.indexOf('April');
    return hl.slice(a, b > a ? b : undefined);
  })();
  const pct = goalOf(mar);
  const width = (mar.match(/<i style="width:([\d.]+)%/) || [,'?'])[1];
  console.log('   Marso: -$650 sa $2,178 -> bula ' + pct + ', lapad ' + width + '%');
  check('nakikita ang negatibong bilang', /^-/.test(pct), true);
  check('pero zero pa rin ang lapad ng bar', width, '0.0');
  check('pula ang tono', goalTone(mar), 'missed');
  check('at nasa hover din ang negatibo', /title="[^"]*-\d+%/.test(mar), true);
}

// Progress bar na, kapareho ng nasa Calendar header: rail, fill, pill, trophy.
const cssTxt = fs.readFileSync(
  __ROOT + '/css/style.css', 'utf8');
console.log('   tono: Enero ' + goalTone(jan11) + ', Pebrero ' + goalTone(feb11));
check('berde ang naabot', goalTone(jan11), 'hit');
check('pula ang hindi naabot', goalTone(feb11), 'missed');
/* Ang DULO ng bar ang may hawak ng mahalaga, at nagbabago kung ano 'yon:
   trophy habang target pa, porsyento kapag naabot na. Ang panuntunang ito ay
   nailagay sa Calendar bar at sa Year bar pero NAPALAMPAS sa buwanang bar —
   kaya may trophy pa rin ang Hulyo na naabot na, at dahil wala na rin ang
   pill sa 100%, walang numerong lumalabas sa buwang panalo. */
check('porsyento ang dulo ng NAABOT na buwan',
  /<span class="yo-bar-end">129%<\/span>/.test(jan11), true);
check('wala nang trophy doon', /yo-bar-end">\s*<svg/.test(jan11), false);
check('trophy pa rin ang hindi naabot', /yo-bar-end">\s*<svg/.test(feb11), true);
// Ang tatlong bar ay dapat magkasundo sa panuntunang ito.
check('ganoon din ang Calendar at Year bar',
  (js.match(/yo-bar-end">\$\{[^}]*hit[^}]*\?/g) || []).length
  + (js.match(/cal-goal-end">\$\{done \?/g) || []).length, 3);
check('naka-clamp ang fill sa 100%', /width:100\.0%/.test(jan11), true);
check('pareho ng --gt na sistema ng Calendar',
  /\.yo-bar\.hit\{--gt:var\(--win\);\}/.test(cssTxt), true);
check('pula ang missed sa CSS', /\.yo-bar\.missed\{--gt:var\(--loss\);\}/.test(cssTxt), true);
// Labindalawang kumikislap na trophy ay 'yon mismong kurap na inalis natin sa
// header — kaya sadyang WALANG glint dito.
// Ang YEAR bar lang ang buhay — hiniling na kumislap ito. Ang labindalawang
// buwan sa ilalim ay tala at nananatiling tahimik, kaya naka-.live ang gate.
check('kumikislap ang year bar', /\.yo-bar\.live \.yo-bar-end::before\{/.test(cssTxt), true);
check('may sheen din ang fill nito', /\.yo-bar\.live i::after\{/.test(cssTxt), true);
check('hindi kumikislap ang buwanang bar',
  /\.yo-bar \.yo-bar-end::before\{/.test(cssTxt), false);

console.log('\n13. AVG TRADING DAYS — araw, hindi trade\n');
// Enero: dalawang trade sa dalawang araw. Pebrero: dalawa sa dalawang araw.
// Dalawang buwan, apat na araw -> 2.0 araw kada buwan.
const DAYS = [
  T('2026-01-05', 100, 'Win'), T('2026-01-09', 100, 'Win'),
  T('2026-02-03', 100, 'Win'), T('2026-02-11', 100, 'Win'),
];
h = render(DAYS, 2026);
console.log('   Avg trading days: ' + stat('Avg trading days'));
check('4 na araw sa 2 buwan -> 2.0', stat('Avg trading days'), '2.0');
check('wala nang "Avg trades"', /yo-s-k">Avg trades</.test(h), false);

// Dalawang trade sa IISANG araw ay isang araw pa rin.
const SAMEDAY = [
  T('2026-01-05', 100, 'Win'), T('2026-01-05', 100, 'Win'), T('2026-01-05', 100, 'Win'),
];
h = render(SAMEDAY, 2026);
check('3 trade sa 1 araw, 1 buwan -> 1.0', stat('Avg trading days'), '1.0');
check('sinasabi ng hover ang trades kada araw',
  /you took 3\.0 trades/.test(h), true);

// Ang kabuuan ng taon ay dapat pumantay sa kabuuan ng labindalawang buwan —
// dating naka-UTC ang isa at naka-local ang isa, kaya pwedeng magkaiba ng
// isa o dalawang araw ang dalawa nang walang paliwanag.
h = render(DAYS, 2026);
const monthDayChips = [...h.matchAll(/<span class="yo-c days"[^>]*>(\d+)d<\/span>/g)]
  .map(m => +m[1]).reduce((a, b) => a + b, 0);
const yearTotal = Math.round(parseFloat(stat('Avg trading days')) * 2);
console.log('   suma ng buwanang chips: ' + monthDayChips + '   kabuuan ng taon: ' + yearTotal);
check('magkatugma ang taon at ang mga buwan', monthDayChips, yearTotal);

// Ibalik ang RRY na render — ang stat() ay bumabasa sa kasalukuyang `h`, at
// ang mga sumusunod na assertion ay tungkol sa fixture na 'yon.
h = render(RRY, 2026);
console.log('\n   Sa taas ng taon:');
console.log('   Avg RR ' + stat('Avg RR') + '   Goals hit ' + stat('Goals hit'));
check('taon: average ng 3, 1, 2', stat('Avg RR'), '2.00');
check('isang buwan lang ang umabot', stat('Goals hit'), '1 of 2');
// Kalahati-o-higit ang panuntunan, kapareho ng Green months sa tabi nito.
// 1 sa 2 ay kalahati, kaya berde. Dating berde ito sa kahit isang hit lang.
const goalsCls = (h.match(/yo-s-k">Goals hit<\/span><span class="yo-s-v ([a-z]*)"/) || [,''])[1];
const greenCls = (h.match(/yo-s-k">Green months<\/span><span class="yo-s-v ([a-z]*)"/) || [,''])[1];
console.log('   Goals hit: ' + goalsCls + '   Green months: ' + greenCls);
check('1 sa 2 ay berde', goalsCls, 'win');
check('pareho ng panuntunan ng katabi nito', goalsCls, greenCls);

console.log('\n   Walang naka-set na sahod:');
els.accountFilter.value = 'all'; OUT = '';
new Function('document','ALL_TRADES','netPnl','escapeHtml','fmtMoney','fmtNum',
             '_isWin','_isLoss','PROFILE_DATA','YEAR','_askAmt', `
  ${js.match(/const _isBE = [^\n]*/)[0]}
  ${js.match(/const SALARY_DEFAULTS = \{[\s\S]*?\n\}/)[0]}
  ${fn('_salarySettings')}
  ${fn('_salMoney')}
  ${/const _GOAL_TROPHY = `[\s\S]*?`;/.exec(js)[0]}
  ${fn('_dayKeyUTC')}
  ${fn('_tagArmStats')}
  ${fn('_winRateOf')}
  let YEAR_OVERVIEW = YEAR;
  ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
  ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
  ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
  ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
  ${fn('_yearOverviewPool')}
  ${fn('_yearGoalStrip')}
  ${fn('_goalTone')}
    ${fn('_yearGoalBar')}
  ${fn('_yearMiniGrid')}
  ${fn('_goalTone')}
  ${EXTRA}
    ${fn('renderYearOverview')}
  renderYearOverview();
`)(doc, RRY, t => (t.profit_loss || 0) - (t.fee || 0), s => String(s ?? ''),
   n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2),
   (n, d) => Number(n).toFixed(d),
   t => t.win_loss === 'Win', t => t.win_loss === 'Loss', null, 2026,
   n => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
h = OUT;
check('abo ang bar kapag walang sahod', /yo-bar none/.test(h), true);
check('walang "Goals hit" na stat', /Goals hit/.test(h), false);
// Walang minintis kung wala kang binigay na numero — kaya hindi pula.
check('hindi pula ang walang sahod', /yo-bar missed/.test(h), false);
check('may dash sa pill imbes na 0%', /<b style="--p:0%">—<\/b>/.test(h), true);

console.log('\n12. ANG GOAL NG BUONG TAON\n');
// 8,000 AED / 3.6725 = $2,178.35 kada buwan, kaya $26,140.20 ang taon.
const YEAR_GOAL = 8000 / 3.6725 * 12;
console.log('   goal ng taon: $' + YEAR_GOAL.toFixed(2));

// Tatlong klase na ngayon: "yo-bar year live hit" — kunin ang huli, ang tono.
const stripOf = s => {
  const m = s.match(/<div class="yo-bar year live (\w+)"[^>]*title="([^"]*)"/);
  return m || [, '(wala)', ''];
};
const stripPct = s => (s.match(/<div class="yo-year-goal">[\s\S]*?<b style="--p:[^"]*">([^<]*)</) || [,'(wala)'])[1];

h = render([T('2026-01-05', 2800, 'Win')], 2026);
let st = stripOf(h);
console.log('   2026 ($2,800): tono ' + st[1] + ', pill ' + stripPct(h));
check('may year goal na bar', /yo-year-goal/.test(h), true);
check('may trophy ito', /yo-bar year[^>]*>[\s\S]*?yo-bar-end/.test(h), true);
check('11% ng taon', stripPct(h), Math.round(2800 / YEAR_GOAL * 100) + '%');
check('sinasabi ang target sa hover', /twelve months of salary/.test(st[2]), true);
// Huwag i-hardcode ang halaga — 26,140.23 ito, hindi .20, at ang test ang
// mali noon hindi ang code.
check('nakasulat ang halaga sa tabi',
  h.includes('of $' + YEAR_GOAL.toLocaleString(undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 })), true);

// Naabot ang buong taon — walang pill, kagaya ng buwan.
h = render([T('2026-01-05', 30000, 'Win')], 2026);
st = stripOf(h);
console.log('   2026 ($30,000): tono ' + st[1] + ', pill ' + stripPct(h));
check('berde kapag naabot ang taon', st[1], 'hit');
check('walang pill kapag naabot', stripPct(h), '(wala)');
check('nasa hover ang tunay na porsyento', /115% of it/.test(st[2]), true);

// Lugi ang taon -> pula, hindi abo.
h = render([T('2026-01-05', -500, 'Loss')], 2026);
check('pula kapag lugi ang taon', stripOf(h)[1], 'missed');

console.log('\n   Ang BILIS, para sa taon na kasalukuyan:');
// Ang 12x ay malupit tingnan sa kalagitnaan ng taon — kaya nasa hover ang
// pace. Kung Marso pa lang at may tatlong buwang sahod ka na, 25% ka sa bar
// pero 100% ang bilis mo.
const nowY = new Date().getFullYear();
const elapsed = new Date().getMonth() + 1;
const perfect = (8000 / 3.6725) * elapsed;   // eksaktong isang sahod kada buwan
h = render([T(nowY + '-01-05', perfect, 'Win')], nowY);
st = stripOf(h);
console.log('   ' + elapsed + ' buwan, perpektong takbo -> pill ' + stripPct(h));
console.log('   hover: ' + st[2].replace(/\n/g, ' | '));
/* Siyam na buwan ng perpektong takbo ay 75% ng taon, at 75% ay lampas sa 70%
   — kaya "close" (berde-ginto) na ito ngayon, hindi "now" (ginto). Ito ang
   limang antas ng kulay: ang pula ay nakalaan sa pagbaba, at ang papalapit sa
   goal ay unti-unting nagiging berde bago pa ito maabot.

   Ang bar na ito ay may sariling kopya ng lohika ng kulay hanggang ngayon —
   tatlong tono lang ang alam nito habang lima na ang tatlong iba. Ang paggamit
   ng mismong _goalTone ang nagpabago nito, at tama ang pagbabago. */
check('kasalukuyang taon -> berde-ginto, hindi pula', st[1], 'close');
check('sinasabi ng hover ang bilang ng buwan',
  new RegExp(elapsed + ' month').test(st[2]), true);
check('at ang bilis ay 100%', /finishes at 100%/.test(st[2]), true);
check('pero ang bar ay ang totoong bahagi ng taon',
  stripPct(h), Math.round(elapsed / 12 * 100) + '%');

console.log('\n   Walang naka-set na sahod:');
els.accountFilter.value = 'all'; OUT = '';
new Function('document','ALL_TRADES','netPnl','escapeHtml','fmtMoney','fmtNum',
             '_isWin','_isLoss','PROFILE_DATA','YEAR','_askAmt', `
  ${js.match(/const _isBE = [^\n]*/)[0]}
  ${js.match(/const SALARY_DEFAULTS = \{[\s\S]*?\n\}/)[0]}
  ${fn('_salarySettings')}
  ${fn('_salMoney')}
  ${/const _GOAL_TROPHY = `[\s\S]*?`;/.exec(js)[0]}
  ${fn('_dayKeyUTC')}
  ${fn('_tagArmStats')}
  ${fn('_winRateOf')}
  let YEAR_OVERVIEW = YEAR;
  ${(js.match(/const REAL_ACCOUNT_TYPES[^\n]*/) || [''])[0]}
  ${(js.match(/const _isRealMoney = [^\n]*/) || [''])[0]}
  ${(js.match(/function _realMoneyOnly\(\)\{[\s\S]*?\n\}/) || [''])[0]}
  ${(js.match(/const _countsAsMoney = [^\n]*/) || [''])[0]}
  ${fn('_yearOverviewPool')}
  ${fn('_yearGoalStrip')}
  ${fn('_goalTone')}
    ${fn('_yearGoalBar')}
  ${fn('_yearMiniGrid')}
  ${fn('_goalTone')}
  ${EXTRA}
    ${fn('renderYearOverview')}
  renderYearOverview();
`)(doc, [T('2026-01-05', 2800, 'Win')], t => (t.profit_loss || 0) - (t.fee || 0),
   s => String(s ?? ''), n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toFixed(2),
   (n, d) => Number(n).toFixed(d),
   t => t.win_loss === 'Win', t => t.win_loss === 'Loss', null, 2026,
   n => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }));
check('walang year goal na bar', /yo-year-goal/.test(OUT), false);


console.log('\n9. ANG JOURNEY BAND AT ANG RULES KEPT\n');
{
  const RK = [
    T('2026-01-05', 300, 'Win'),  T('2026-01-09', 200, 'Win'),
    T('2026-02-03', 400, 'Win'),  T('2026-02-11', 300, 'Win'),
    T('2026-03-07', 500, 'Win'),  T('2026-03-08', 200, 'Win'),
  ].map((x, i) => ({ ...x, unfollowed_rules: i < 4 ? 'Rules Followed' : 'Revenge Trade' }));
  const hh = render(RK, 2026);
  check('may journey band', /class="yo-journey/.test(hh), true);
  const line = (hh.match(/class="yo-j-line">([^<]*)</) || [,''])[1];
  console.log('   ' + line);
  check('may pangungusap ito', line.length > 30, true);
  check('may mga chip', /greet-chip/.test(hh), true);
  // Ang bilang ng rules kept kada buwan: Enero 2/2, Pebrero 2/2, Marso 0/2.
  // Sariling linya na ito ngayon, hindi chip sa hilera ng stat.
  const kept = [...hh.matchAll(/yo-f-rules[^>]*>[\s\S]*?<b>(\d+)\/(\d+)<\/b>/g)]
    .map(m => m[1] + '/' + m[2]);
  console.log('   kada buwan: ' + kept.join('  '));
  check('tatlong buwan ang may bilang', kept.length, 3);
  check('Enero 2/2', kept[0], '2/2');
  check('Marso 0/2 — dito ang paglabag', kept[2], '0/2');
  /* ANG TATLONG BANDA. Ang disiplina ay may mas mataas na pamantayan kaysa sa
     win rate: ang win rate ay hindi mo kontrolado, ang disiplina ay oo. */
  const band = pct => {
    // Isang buwan na may 10 tag at ang ibinigay na porsyento ang malinis.
    const keep = Math.round(pct / 10);
    const rows = Array.from({ length: 10 }, (_, i) =>
      ({ ...T('2026-07-0' + ((i % 9) + 1), 100, 'Win'),
         unfollowed_rules: i < keep ? 'Rules Followed' : 'Revenge Trade' }));
    const hb = render(rows, 2026);
    const seg = hb.slice(hb.indexOf('July'), hb.indexOf('August'));
    return (seg.match(/yo-f-rules (\w+)/) || [,'(wala)'])[1];
  };
  check('100% -> berde', band(100), 'win');
  check('90%  -> berde', band(90), 'win');
  check('80%  -> kahel', band(80), 'mid');
  check('70%  -> kahel', band(70), 'mid');
  check('60%  -> pula',  band(60), 'loss');
  check('30%  -> pula',  band(30), 'loss');
  // At ang label ay Proper Case na.
  check('Proper Case ang label', /<span>Rules Kept<\/span>/.test(hh), true);
  // Laging tatlong bahagi, kahit walang tatak — kung hindi, iba ang haba ng
  // linya sa card na iyon at hindi pantay-pantay ang grid.
  const parts = (noTagHtml => (noTagHtml.match(/yo-f-rules none[^>]*>([\s\S]*?)<\/div>/) || [,''])[1])
    (render([T('2026-05-05', 100, 'Win')], 2026));
  check('may tatlong bahagi kahit walang tatak',
    (parts.match(/<(span|b|i)>/g) || []).length, 3);
  // Ang buwang walang tatak ay hindi dapat magsabing 100%.
  const noTag = render([T('2026-05-05', 100, 'Win')], 2026);
  check('walang tatak -> walang bilang, hindi 100%', /yo-f-rules none/.test(noTag), true);

  /* ANG PAGKAKASUNOD sa stats row ng taon: ang Rules kept ay dapat nasa
     PAGITAN ng Win rate at ng Avg trading days. */
  const order = [...hh.matchAll(/yo-s-k">([^<]*)</g)].map(m => m[1]);
  console.log('   stats row: ' + order.join(' · '));
  const iRate = order.indexOf('Win rate');
  const iKept = order.indexOf('Rules kept');
  const iDays = order.indexOf('Avg trading days');
  check('may Rules kept sa taon', iKept >= 0, true);
  check('nasa tabi ng Win rate', iKept, iRate + 1);
  check('bago ang Avg trading days', iKept < iDays, true);
}

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);