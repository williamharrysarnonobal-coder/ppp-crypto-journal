const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang Salary goal sa loob ng Calendar box, pinapatakbo sa tunay na function.
// Ang mahalagang mapatunayan: tama ang bilang ng natitirang trading day (dito
// nanggagaling ang "magkano kada araw"), at hindi nagsisinungaling ang bar
// kapag lugi ang buwan o kapag may naka-filter.
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
function objBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1) + ';'; }
  }
}

let OUT = '';
const scope = {
  document: { getElementById: id => id === 'calGoalBar' ? { set innerHTML(v){ OUT = v; } } : null },
  netPnl: t => (t.profit_loss || 0) - (t.fee || 0),
};

let ALL = [], FILT = [], PROF = {};
function render(monthTrades, y, m, opts){
  OUT = '';
  ALL = opts.all; FILT = opts.filtered || opts.all; PROF = opts.profile;
  new Function('document', 'netPnl', 'escapeHtml', 'ALL_TRADES', 'FILTERED', 'PROFILE_DATA',
               'monthTrades', 'y', 'm', `
    ${objBlock('SALARY_DEFAULTS')}
    ${fn('_salarySettings')}
    ${fn('_salMoney')}
    ${/const _GOAL_TROPHY = `[\s\S]*?`;/.exec(js)[0]}
    ${fn('_tradingDaysLeft')}
    ${fn('_goalTone')}
    ${fn('_renderCalGoal')}
    _renderCalGoal(monthTrades, y, m);
  `)(scope.document, scope.netPnl,
     s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
       .replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
     ALL, FILT, PROF, monthTrades, y, m);
  return OUT;
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) + got + (ok ? '' : '   <-- ' + want));
};
// Ang pangungusap ay lumipat sa title attribute — doon na ito basahin.
const note = html => {
  const m = html.match(/title="([^"]*)"/);
  if(!m) return '';
  return m[1].replace(/&#10;|\\n/g, ' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"')
             .replace(/\s+/g, ' ').trim();
};
const tone = html => (html.match(/class="cal-goal (\w+)"/) || [,'(wala)'])[1];

// 8,000 AED sa 3.6725 = $2,178.35 kada buwan.
const PROFILE = { salary_settings: { monthly_salary: 8000, aed_per_usd: 3.6725 } };
const T = (pl, dateStr) => ({ profit_loss: pl, fee: 0, close_date: new Date(dateStr) });

// Kasaysayan: Lunes hanggang Biyernes lang ang naka-close.
const HIST = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05']
  .map((d, i) => T(10, d + 'T12:00:00Z'));
console.log('Mga araw na tinatrade (mula sa kasaysayan): ' +
  [...new Set(HIST.map(t => t.close_date.getDay()))].sort().join(','));

console.log('\n1. NAKAMIT NA ANG GOAL\n');
let h = render([T(2500, '2026-07-10T12:00:00Z')], 2026, 6,
  { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
check('berde ang tono', tone(h), 'hit');
check('sinasabi ang sobra', /past\./.test(note(h)), true);
check('hindi lumalampas ang bar sa 100%', /width:100\.0%/.test(h), true);

// Sa 100%, wala nang hangganan na tatapatan ng pill — dadagan lang nito ang
// trophy, at 'yon ang overlap na nakita sa screen. Kaya tinatanggal ito, at
// ang porsyento ay lumilipat sa hover para hindi mawala ang "203%".
check('walang pill sa LOOB kapag naabot', /<b style="--p:/.test(h), false);
// Ang DULO ang humahawak ng mahalaga, at nagbabago kung ano 'yon: trophy
// habang target pa, porsyento kapag resulta na. Wala nang trophy kapag naabot.
check('porsyento na ang dulo', /<span class="cal-goal-end">115%<\/span>/.test(h), true);
check('wala nang trophy kapag naabot', /cal-goal-end">\s*<svg/.test(h), false);
check('nasa hover pa rin ito', /Goal reached — 115% of it/.test(note(h)), true);

console.log('\n1b. HINDI PA NAAABOT — nandiyan ang pill\n');
h = render([T(1400, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: PROFILE });
check('may pill kapag kulang pa', /<b style="--p:/.test(h), true);
check('at may porsyento ito', /<b style="--p:[^"]*">64%<\/b>/.test(h), true);

console.log('\n2. NAKARAANG BUWAN, KULANG\n');
h = render([T(1400, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
/* Dating pula ang bawat buwang hindi umabot. Ang buwang ito ay nagtapos sa
   64%, at ang 64% ay hindi kasing-sama ng 4% — pareho silang pula noon.
   May antas na ngayon: ang pula ay nakalaan sa pagbaba at sa isang saradong
   buwang wala pang 35%. */
check('ginto ang 64% na saradong buwan, hindi pula', tone(h), 'now');
check('walang bilis kada araw sa nakaraan', /a day/.test(note(h)), false);
check('sinasabi kung magkano ang kulang', /Missed by \$778/.test(note(h)), true);

console.log('\n3. NAKARAANG BUWAN, LUGI — hindi pwedeng negatibo ang bar\n');
h = render([T(-900, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
check('zero ang bar, hindi negatibo', /width:0\.0%/.test(h), true);
check('sinasabing lugi, hindi "kulang ng"', /closed \$900\.00 down/.test(note(h)), true);

console.log('\n3b. LUGI SA KASALUKUYANG BUWAN — pula agad\n');
// Dati, gold ito hanggang matapos ang buwan: pareho ang itsura ng buwang
// lugi at ng buwang nahuhuli lang. Pinapakalma ka ng kulay habang paurong
// ang account. Ngayon, pula agad.
const now3 = new Date();
h = render([T(-300, now3.toISOString())], now3.getFullYear(), now3.getMonth(),
  { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
check('pula kahit buhay pa ang buwan', tone(h), 'missed');
check('sinasabing lugi ka', /You are \$300\.00 down this month/.test(note(h)), true);
check('sinasabi pa rin ang natitirang araw', /trading day/.test(note(h)), true);
check('at kung gaano kalayo ang goal', /goal is \$2,478\.35 away/.test(note(h)), true);
check('zero ang bar', /width:0\.0%/.test(h), true);
// Hindi dapat kumikinang ang pulang buwan — ang kinang ay para sa "now" lang.
check('hindi ito "now" kaya walang kinang', /class="cal-goal now"/.test(h), false);

console.log('\n   Positibo pero kulang — gold pa rin:');
h = render([T(500, now3.toISOString())], now3.getFullYear(), now3.getMonth(),
  { all: HIST, profile: PROFILE });
// $500 sa isang $2,451 na target ay 20% — maaga pa sa buwan, kaya malabong
// ginto: pag-usad, hindi babala.
check('malabong ginto ang 20% sa buwang tumatakbo', tone(h), 'low');

console.log('\n4. FUTURE NA BUWAN\n');
h = render([], 2099, 0, { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
check('kulay abo', tone(h), 'ahead');
check('sinasabi ang bar', /bar for this month is \$2,178\.35/.test(note(h)), true);

console.log('\n5. TATLONG MAGKAIBANG "WALANG GOAL"\n');
// Ito ang bug na nakita niya: pare-parehong "goal not set" ang lumalabas sa
// tatlong ibang-ibang sitwasyon, kasama ang "hindi pa nga nababasa ang sahod".

// (a) Hindi pa dumarating ang profile — WALA tayong alam, kaya walang aangkinin.
h = render([T(500, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: null });
console.log('   walang profile   -> ' + (h.match(/>([^<]*)<\/span>/) || [,''])[1].trim());
check('hindi sinasabing "not set"', /goal not set/.test(h), false);
check('sinasabing naghihintay pa', /goal loading/.test(h), true);
check('walang bar', /cal-goal-track/.test(h), false);

// (b) Dumating ang profile, may column, pero blangko ang sahod.
h = render([T(500, '2026-07-10T12:00:00Z')], 2026, 6,
  { all: HIST, profile: { salary_settings: {} } });
console.log('   blangko sahod    -> ' + (h.match(/>([^<]*)<\/span>/) || [,''])[1].trim());
check('sinasabing hindi naka-set', /goal not set/.test(h), true);
check('sinasabi kung saan ito itatakda', /Salary vs Trading/.test(h), true);

// (c) Dumating ang profile pero WALANG salary_settings column — hindi pa
// na-run ang SQL. Dating mukhang kapareho ng (b), kahit ibang-iba ang ayos.
h = render([T(500, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: { id: 1 } });
console.log('   walang column    -> ' + (h.match(/>([^<]*)<\/span>/) || [,''])[1].trim());
check('sinasabing i-run ang SQL', /run the SQL/.test(h), true);
check('pinapangalanan ang file', /supabase_salary_goal\.sql/.test(h), true);
check('hindi ito nalilito sa (b)', /goal not set/.test(h), false);

console.log('\n6. MAY NAKA-FILTER NA ACCOUNT\n');
h = render([T(600, '2026-07-10T12:00:00Z')], 2026, 6,
  { all: HIST, filtered: HIST.slice(0, 2), profile: PROFILE });
// Inline na ang bar sa header, kaya ang babala ay isang maliit na tuldok na
// may sariling tooltip — hindi na buong linya ng teksto sa ilalim.
check('may markang tuldok', /cal-goal-flag/.test(h), true);
check('sinasabing bahagi lang', /part of your income, not all of it/.test(note(h)), true);
h = render([T(600, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: PROFILE });
check('walang tuldok kapag walang filter', /cal-goal-flag/.test(h), false);

console.log('\n7. ANG PAGBILANG NG NATITIRANG TRADING DAY\n');
const countLeft = new Function('ALL_TRADES', 'y', 'm', 'from',
  fn('_tradingDaysLeft') + ' return _tradingDaysLeft(y, m, from);');

// Agosto 2026: nagsisimula sa Sabado. Ang natitira mula Lunes Ago 24 hanggang
// Ago 31 ay 24,25,26,27,28 (Lun-Biy) tapos 31 (Lun) = 6 na araw ng trabaho.
check('Lun-Biy lang: Ago 24 -> katapusan',
  countLeft(HIST, 2026, 7, new Date(2026, 7, 24)), 6);
check('kasama ang mismong araw ngayon',
  countLeft(HIST, 2026, 7, new Date(2026, 7, 31)), 1);
// Ago 30 ay Linggo, kaya hindi ito bilang — ang Lunes Ago 31 lang ang natitira.
check('nilalaktawan ang araw na hindi niya tinatrade',
  countLeft(HIST, 2026, 7, new Date(2026, 7, 30)), 1);

// Kung nagta-trade siya tuwing Linggo, dapat mabilang ang Linggo. Ito ang
// dahilan kung bakit binabasa ito sa kasaysayan at hindi hinuhulaan.
const CRYPTO = HIST.concat([T(10, '2026-06-07T12:00:00Z')]);  // isang Linggo
console.log('   dagdag ang Linggo sa kasaysayan -> ' +
  [...new Set(CRYPTO.map(t => t.close_date.getDay()))].sort().join(','));
check('bumibilang na ang Linggo',
  countLeft(CRYPTO, 2026, 7, new Date(2026, 7, 24)), 7);

// Walang kasaysayan -> Lun-Biy ang default, hindi zero.
check('walang kasaysayan -> Lun-Biy pa rin',
  countLeft([], 2026, 7, new Date(2026, 7, 24)), 6);

console.log('\n8. KASALUKUYANG BUWAN — may bilis kada araw\n');
const now = new Date();
h = render([T(100, now.toISOString())], now.getFullYear(), now.getMonth(),
  { all: HIST, profile: PROFILE });
console.log('   ' + note(h));
// $100 ay 4% — pag-usad pa rin, at hindi ito dapat mukhang pagkabigo.
check('malabong ginto ang 4% sa buwang tumatakbo', tone(h), 'low');
check('may bilang ng natitirang araw', /trading day/.test(note(h)), true);
check('may halaga kada araw', /a day\./.test(note(h)), true);

console.log('\n9. ANG BAR AY DAPAT NAKIKITA SA HEADER\n');
// Dalawang totoong sira na nakita sa screen, hindi sa simulasyon:
//
//   (a) display:flex ang .panel h2, at walang flex:none ang .cal-goal — kaya
//       na-squeeze sa 0 ang track at ang "74%" na lang ang natira.
//   (b) may margin:0 auto 0 0 ang .panel-info-btn, kinukuha nito ang lahat ng
//       libreng espasyo sa kanan — kaya ang anumang nasa LIKOD nito ay
//       naitatapon sa kabilang dulo, dikit sa Review trades.
const cssTxt = fs.readFileSync(
  __ROOT + '/css/style.css', 'utf8');
const htmlTxt = fs.readFileSync(
  __ROOT + '/dashboard.html', 'utf8');

const calGoalRule = /\.cal-goal\{[^}]*\}/.exec(cssTxt);
check('may flex:none ang .cal-goal', /flex:\s*none/.test(calGoalRule[0]), true);

const trackRule = /\.cal-goal-track\{[^}]*\}/.exec(cssTxt);
const w = /width:\s*(\d+)px/.exec(trackRule[0]);
check('may tunay na lapad ang track', Number(w[1]) > 0, true);
check('flex:none din ang track', /flex:\s*none/.test(trackRule[0]), true);

// Ang hinihinging ayos ay:  Calendar ⓘ  Goal [bar]
// kaya PAGKATAPOS na ng ⓘ ang bar. Pero ang ⓘ ay may margin:0 auto 0 0, na
// magtatapon sa bar sa kabilang dulo — kaya sa header na ito, inililipat ang
// auto margin sa bar mismo. Kailangang magkasama ang TATLO, kung hindi ay
// babalik ang bug: nasa .cal-h2 ang h2, tinatanggal ang auto sa ⓘ, at
// ibinibigay ito sa bar.
const h2 = /<h2[^>]*>Calendar[\s\S]*?<\/h2>/.exec(htmlTxt)[0];
const posBar  = h2.indexOf('id="calGoalBar"');
const posInfo = h2.indexOf('panel-info-btn');
console.log('   sa header: ⓘ sa ' + posInfo + ', bar sa ' + posBar);
check('nasa loob ng h2 ang bar', posBar > -1, true);
check('sumusunod ang bar sa ⓘ', posBar > posInfo, true);
check('may .cal-h2 na klase ang header', /<h2 class="cal-h2">/.test(htmlTxt), true);

// ANG DALAWANG TUNAY NA SANHI, dalawang beses kong napalampas:
//
// (1) .panel h2 ay space-between. Sa apat na item, naglalagay ito ng puwang sa
//     pagitan ng BAWAT pares — kaya lumulutang ang bar palapit sa Review
//     trades kahit anong auto margin ang ilagay, dahil nagastos na ng
//     space-between ang libreng espasyo. Kailangang umatras sa flex-start.
check('umaatras sa flex-start ang header na ito',
  /\.cal-h2\{[^}]*justify-content:\s*flex-start/.test(cssTxt), true);
check('ang actions na ang itinutulak sa kanan',
  /\.cal-h2\s*>\s*\.cal-head-actions\{[^}]*margin-left:\s*auto/.test(cssTxt), true);
check('walang auto margin na natira sa ⓘ dito',
  /\.cal-h2\s*>\s*\.panel-info-btn\{[^}]*margin:\s*0[;}]/.test(cssTxt), true);
//
// (2) Ang #calGoalBar MISMO ang flex item ng h2. Ang flex:none sa .cal-goal na
//     nasa LOOB nito ay walang pinipigilan — nasisiksik pa rin ang wrapper at
//     gumuguho ang track sa halos zero, kaya ang medalyon at ang numero lang
//     ang nakikita. Ito ang eksaktong nakita sa screen, dalawang beses.
check('may flex:none ang #calGoalBar mismo',
  /\.cal-h2\s*>\s*#calGoalBar\{[^}]*flex:\s*none/.test(cssTxt), true);

// Ang porsyento ay nasa LOOB na ng track, hindi sa tabi nito.
const inside = /<span class="cal-goal-track">[\s\S]*?<b>[^<]*<\/b>[\s\S]*?<\/span>/;
h = render([T(1400, '2026-07-10T12:00:00Z')], 2026, 6, { all: HIST, profile: PROFILE });
check('may "Goal" na label', /cal-goal-label">Goal</.test(h), true);
check('walang medalyon (tinanggal na)', /cal-goal-badge/.test(h), false);
check('ipinapasa ang posisyon ng pill bilang --p', /--p:\d/.test(h), true);

console.log('\n10. ANG SLIDER — ayon sa sample\n');
const trackCss = /\.cal-goal-track\{[^}]*\}/.exec(cssTxt)[0];
const fillCss  = /\.cal-goal-track i\{[\s\S]*?\n\}/.exec(cssTxt)[0];
const pillCss  = /\.cal-goal-track b\{[\s\S]*?\n\}/.exec(cssTxt)[0];

// Ang track ay kahon, hindi linya — kailangang kasya ang tuldok at ang pill.
check('may taas ang track para sa tuldok at pill', /height:\d+px/.test(trackCss), true);
check('WALANG overflow:hidden', /overflow:\s*hidden/.test(trackCss), false);
check('ang rail ay ::before', /\.cal-goal-track::before\{/.test(cssTxt), true);
check('may tuldok sa kaliwang dulo', /\.cal-goal-track i::before\{/.test(cssTxt), true);

// ANG KABILANG DULO — trophy na, hindi bilog.
//
// Dalawang mali ang pinagdaanan nito: una, var(--rule) ang kulay — dalawang
// lilim lang ang layo sa rail mismo, kaya halos hindi makita. Pangalawa,
// translate(50%) ang transform, kaya kalahati nito ay nasa labas ng track.
// Ngayon, isang tunay na elemento na may SVG sa loob ng disc.
check('may cal-goal-end na elemento', /cal-goal-end/.test(h), true);
check('may SVG sa loob nito', /cal-goal-end">\s*<svg/.test(h), true);
check('wala nang ::after na tuldok', /\.cal-goal-track::after\{/.test(cssTxt), false);

const endCss  = /\.cal-goal-end\{[^}]*\}/.exec(cssTxt)[0];
const leftDot = /\.cal-goal-track i::before\{[^}]*\}/.exec(cssTxt)[0];
check('hindi var(--rule) ang dulo', /var\(--rule\)/.test(endCss), false);
check('nakikitang kulay ang singsing', /var\(--muted\)/.test(endCss), true);
check('nasa loob ng rail ang dulo', /transform:translateY\(-50%\)/.test(endCss), true);
check('nasa loob din ang kaliwa', /transform:translateY\(-50%\)/.test(leftDot), true);
check('walang X-shift na naglalabas sa kanila',
  /translate\((-|)\d+%,\s*-50%\)/.test(endCss + leftDot), false);
// Pupuno ang trophy kapag naabot — 'yon lang ang sandaling hindi na ito
// target kundi resulta.
check('pumupuno ang trophy kapag naabot',
  /\.cal-goal\.hit \.cal-goal-end\{[^}]*background:var\(--win\)/.test(cssTxt), true);

console.log('\n10b. ANG KISLAP SA TROPHY\n');
check('may sweep ng liwanag',
  /\.cal-goal \.cal-goal-end::before\{/.test(cssTxt), true);
check('may bituin na pumuputok',
  /\.cal-goal \.cal-goal-end::after\{/.test(cssTxt), true);
check('apat na tulis ang bituin', /clip-path:polygon\(50% 0%/.test(cssTxt), true);
check('may keyframes ang sweep', /@keyframes calGoalGlint\{/.test(cssTxt), true);
check('may keyframes ang bituin', /@keyframes calGoalSparkle\{/.test(cssTxt), true);

// Dating naka-gate sa :not(.hit) — tumitigil ito sa mismong sandaling
// dapat ipagdiwang. Hiniling na tuloy-tuloy: kumikislap sa DALAWANG estado.
check('hindi na naka-gate sa :not(.hit)',
  /:not\(\.hit\) \.cal-goal-end/.test(cssTxt), false);
check('kumikislap din ang naabot',
  /\.cal-goal \.cal-goal-end::before\{[\s\S]*?animation:calGoalGlint/.test(cssTxt), true);

// Mabagal, gaya ng hiniling. Anim na segundo pareho, at karamihan ng ikot ay
// nakatigil — sa mabilis na ikot, kumukurap ito sa gilid ng paningin.
const glint = /@keyframes calGoalGlint\{[\s\S]*?\n\}/.exec(cssTxt)[0];
check('anim na segundo ang sweep', /calGoalGlint 6s/.test(cssTxt), true);
check('anim din ang bituin', /calGoalSparkle 6s/.test(cssTxt), true);
check('may pahinga — humihinto bago matapos ang ikot',
  /28%[\s\S]*?100%\s*\{background-position:-180% 0;\}/.test(glint), true);

check('tumitigil kapag reduced-motion',
  /prefers-reduced-motion[\s\S]*?cal-goal-end::before[\s\S]{0,140}animation:none/.test(cssTxt), true);
// 20px ang disc at ~46px ang pill, kaya kailangan ng mas malaking clearance.
check('may sapat na clearance ang pill sa trophy',
  /left:clamp\(30px,[^;]*calc\(100% - 36px\)\)/.test(cssTxt), true);
check('may glow ang fill', /box-shadow:0 0 \d+px/.test(fillCss), true);

// Ang pill ay dapat manatili sa rail sa 0% at sa 100%.
check('naka-clamp ang pill sa magkabilang dulo', /left:clamp\(/.test(pillCss), true);
check('nakasentro ito sa hangganan', /translate\(-50%,-50%\)/.test(pillCss), true);

console.log('\n11. ANG KINANG — hiniling na huwag alisin\n');
/* Dating hinahanap nito ang eksaktong selector na `.cal-goal.now ... i::after{`,
   at nabigo nang maging listahan ito ng tatlo — ang selector ay may `,` na
   ngayon sa halip na `{`. Pero hindi naman ang teksto ang kailangan; ang
   kailangan ay ANG BAWAT tono ng pag-usad ay kumikinang. Iyon ang tinatanong
   nito ngayon, at mahuhuli nito ang tunay na pagkakamali: ang pagdagdag ng
   `close` habang nalilimutan ang `low`. */
['now', 'close', 'low'].forEach(t =>
  check('kumikinang ang tono na "' + t + '"',
    new RegExp('\\.cal-goal\\.' + t + ' \\.cal-goal-track i::after[,{]').test(cssTxt), true));
check('may keyframes ito', /@keyframes calGoalSheen\{/.test(cssTxt), true);
// Sariling layer pa rin: dala ng background ng fill ang kulay AT ang glow.
check('hindi hinahawakan ng sheen ang background ng fill',
  /\.cal-goal\.now \.cal-goal-track i\{/.test(cssTxt), false);
check('pumupulso rin ang pill', /@keyframes calGoalPulse\{/.test(cssTxt), true);
check('may reduced-motion na pag-atras',
  /prefers-reduced-motion[\s\S]{0,320}calGoal|prefers-reduced-motion[\s\S]{0,320}animation:none/.test(cssTxt), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
