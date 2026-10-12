// Ang paglilinis ng listahan: alin ang paulit-ulit, at ligtas bang isinanib?
// Ang mahalaga dito ay WALANG NAWAWALANG KASAYSAYAN — ang lumang pangalan ay
// nababasa pa rin, nagiging bagong pangalan lang.
const core = require('./tag-core');
const js = core.js;
const A = core.API;

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
// grab() ay huminto sa "}" — kulang ang ";" ng const, kaya idinugtong.
const ALIASES = new Function(grab('const TAG_ALIASES') + '; return TAG_ALIASES;')();
const canon = new Function('_ruleTags','TAG_ALIASES',
  grab('function _canonicalTags(') + ' return _canonicalTags;')(A._ruleTags, ALIASES);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

console.log('ANG LISTAHAN: 21 -> ' + A.UNFOLLOWED_RULES_OPTIONS.length + '\n');
// Nadagdagan ng "Stopped Out Then Hit TP" — observation din ito, dahil
// nangyayari ito kapag TAMA ka sa direksyon at masyadong malapit ang stop.
check('24 na option', A.UNFOLLOWED_RULES_OPTIONS.length, 24);
check('13 breach', A.UNFOLLOWED_RULES_OPTIONS.filter(t => A._tagKind(t)==='breach').length, 13);
check('10 observation', A.UNFOLLOWED_RULES_OPTIONS.filter(t => A._tagKind(t)==='observation').length, 10);

console.log('\n1. WALA NANG DALAWANG PANGALAN SA IISANG BAGAY\n');
check('wala na ang Entered Early', A.UNFOLLOWED_RULES_OPTIONS.includes('Entered Early'), false);
check('wala na ang No Confirmation', A.UNFOLLOWED_RULES_OPTIONS.includes('No Confirmation'), false);
check('wala na sa checklist ang Ignored Trend', A.UNFOLLOWED_RULES_OPTIONS.includes('Ignored Trend'), false);
check('wala na sa checklist ang Early TP', A.UNFOLLOWED_RULES_OPTIONS.includes('Early TP'), false);
// DATI: tahimik na tinatanggal (alias -> null). MALI 'yon: totoo lang na
// "nasa Exit Type na" kung sinasabi nga 'yon ng Exit Type. Sa trade na
// "Early TP" pero "TP Hit" ang exit, buburahin nito ang tanging tala na
// maaga ang pagkuha ng profit — tahimik, walang ipinapakita.
check('hindi tahimik na binubura', 'early tp' in ALIASES, false);
check('binibilang pa rin bilang breach', A._brokenRuleTags('Early TP').length, 1);
check('may kapalit: Entered Without Confirmation',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Entered Without Confirmation'), true);
check('nanatili at hiwalay: Against Daily Bias / HTF Bias',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Against Daily Bias / HTF Bias'), true);

console.log('\n2. NABABASA PA RIN ANG LUMANG TRADE — WALANG NAWAWALA\n');
const cases = [
  ['Entered Early',                       'Entered Without Confirmation'],
  ['No Confirmation',                     'Entered Without Confirmation'],
  ['Ignored Trend',                       'Ignored Trend'],   // retired — hindi hinuhulaan
  ['Entered Early, No Confirmation',      'Entered Without Confirmation'],
  ['Ignored Trend, Against Daily Bias / HTF Bias', 'Ignored Trend, Against Daily Bias / HTF Bias'],
  ['FOMO Entry, Entered Early',           'FOMO Entry, Entered Without Confirmation'],
  ['Early TP',                            'Early TP'],   // retired, hindi tinatanggal
  ['Early TP, Moved Stop Loss',           'Early TP, Moved Stop Loss'],
  ['Moved Stop Loss',                     'Moved Stop Loss'],
  ['Rules Followed',                      'Rules Followed'],
];
cases.forEach(([from, want]) => {
  const got = canon(from).join(', ');
  const ok = got === want;
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + from.padEnd(46) + '-> ' +
    (got || '(wala)') + (ok ? '' : '   <-- ' + (want || '(wala)')));
});

console.log('\n   Ang mahalaga: hindi nadodoble ang bilang');
check('dalawang lumang pangalan = ISANG tag',
  canon('Entered Early, No Confirmation').length, 1);
check('luma + bago = ISANG tag pa rin',
  canon('No Confirmation, Entered Without Confirmation').length, 1);
// Ang kapalit nila ay OBSERVATION na — hindi na binibilang na kasalanan.
check('at hindi na ito breach',
  A._brokenRuleTags(canon('Entered Early, No Confirmation').join(', ')).length, 0);

console.log('\n3. TUMATAKBO ITO SA PAGBASA NG TRADE\n');
check('ginagamit ng normalizeTrade',
  /unfollowed_rules: _canonicalTags\(r\.unfollowed_rules\)\.join/.test(js), true);
check('hindi ginagalaw ang database', /update trading_journal.*unfollowed/s.test(js), false);

console.log('\n4. ANG AUTO-RULES AY BAGONG PANGALAN NA\n');
check('walang lumang pangalan sa auto-rules',
  /reasons\.add\('(Entered Early|No Confirmation|Ignored Trend|Early TP)'\)/.test(js), false);
check('ginagamit ang bago',
  /reasons\.add\('Entered Without Confirmation'\)/.test(js), true);
check('at ang HTF bias',
  /reasons\.add\('Against Daily Bias \/ HTF Bias'\)/.test(js), true);

console.log('\n5. ANG DOBLENG BILANG SA MOVED STOP\n');
const flags = grab('function _applyMovedStopFlags(');
check('hindi na nagdadagdag ng Changing Plan', /'Changing Plan'/.test(flags), false);
check('nagdadagdag pa rin ng Moved Stop Loss', /'Moved Stop Loss'/.test(flags), true);
check('nasa listahan pa rin ang Changing Plan para sa manwal',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Changing Plan'), true);
// Bago: dalawang tag sa IISANG grupo -> dalawang beses na sira ang rule na 'yon
check('isang rule lang ang nasisira ng moved stop',
  [...new Set(A._brokenRuleTags('Moved Stop Loss').map(A._ruleGroupOf))].length, 1);

console.log('\n6. BAWAT BREACH AY MAY GRUPO PA RIN\n');
const grouped = A.RULE_GROUPS.flatMap(g => g.tags);
const breaches = A.UNFOLLOWED_RULES_OPTIONS.filter(t => A._tagKind(t) === 'breach');
A.RULE_GROUPS.forEach(g => console.log('   ' + g.name.padEnd(36) + g.tags.length + ' tag'));
const orphans = breaches.filter(t => !grouped.includes(t));
check('walang breach na walang grupo', orphans.join(', ') || '(wala)', '(wala)');
const ghosts = grouped.filter(t => !A.UNFOLLOWED_RULES_OPTIONS.includes(t));
check('walang grupo na tumutukoy sa wala nang tag', ghosts.join(', ') || '(wala)', '(wala)');
check('walang tag sa dalawang grupo', new Set(grouped).size, grouped.length);

console.log('\n6b. ANG HATING "IGNORED TREND"\n');
// Dalawang bagay pala ang ibig sabihin nito: (1) tumakbo na ang market pero
// umaasa pa rin ako ng isa pang leg, at (2) nasa strong S/R na pero pumasok pa
// rin ako. Hindi ito pwedeng isanib sa "Against Daily Bias" — hindi direksyon
// ang usapin. Isinanib ko 'yon noon at MALI 'yon.
check('hindi na naka-alias ang Ignored Trend', 'ignored trend' in ALIASES, false);
check('may Chased Extended Move',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Chased Extended Move'), true);
check('may Traded Into Key Level',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Traded Into Key Level'), true);
// Naging OBSERVATION na silang dalawa — hindi pa niya napagdedesisyunan na
// mali ang pumasok sa 3rd HL/LH o sa key level; sinusukat pa niya. Kaya wala
// na silang breach group, at nawala ang "Read where the move already is".
check('observation na ang Chased', A._tagKind('Chased Extended Move'), 'observation');
check('observation din ang Key Level', A._tagKind('Traded Into Key Level'), 'observation');
check('wala nang breach group para sa kanila',
  A.RULE_GROUPS.some(g => g.name === 'Read where the move already is'), false);

console.log('\n   Ang lumang tag ay HINDI nabubura:');
check('nababasa pa rin bilang breach', A._brokenRuleTags('Ignored Trend').length, 1);
check('hindi ito hinuhulaan', canon('Ignored Trend').join(', '), 'Ignored Trend');
// Ang dalawang kahalili nito ay observation na, kaya wala nang breach group
// na mapaglalagyan. Binibilang pa rin siya, at sariling pangalan ang lumalabas.
check('binibilang pa rin', A._brokenRuleTags('Ignored Trend').length, 1);
check('sariling pangalan sa card', A._ruleGroupOf('Ignored Trend'), 'Ignored Trend');
const RET = new Function(grab('const TAG_RETIRED') + '; return TAG_RETIRED;')();
check('may tagubilin', /pick "Chased Extended Move" or "Traded Into Key Level"/.test(RET['ignored trend']), true);
console.log('      -> "' + RET['ignored trend'] + '"');

console.log('\n   Early TP — may tagubilin, hindi basta nawawala:');
check('may tagubilin', /Manual Early TP - Valid/.test(RET['early tp']), true);
check('tinutukoy ang tamang column', /belongs in Exit Type/.test(RET['early tp']), true);
check('nasa rule pa rin', A._ruleGroupOf('Early TP'), 'Do not touch an open trade');
console.log('      -> "' + RET['early tp'] + '"');

console.log('\n   No Scalping Trade — tinanggal, pero binibilang pa rin:');
check('wala na sa checklist', A.UNFOLLOWED_RULES_OPTIONS.includes('No Scalping Trade'), false);
check('breach pa rin ang luma', A._brokenRuleTags('No Scalping Trade').length, 1);
check('nasa tamang rule', A._ruleGroupOf('No Scalping Trade'), 'Respect size and instrument');

console.log('\n   Nanatili ang dalawang ipinaliwanag mo:');
check('Non-BnB Setup (hindi Bread n Butter)',
  A.UNFOLLOWED_RULES_OPTIONS.includes('Non-BnB Setup'), true);
check('BTC Only (focus lang sa BTC)',
  A.UNFOLLOWED_RULES_OPTIONS.includes('BTC Only'), true);

console.log('\n6c. ANG AUTO-RULES — tama bang naka-turo?\n');
const auto = js.slice(js.indexOf('function _autoUnfollowedRules('),
                      js.indexOf('return reasons;', js.indexOf('function _autoUnfollowedRules(')));
check('MACD bias -> HTF bias',
  /includes\('no'\)\)\{\s*reasons\.add\('Against Daily Bias \/ HTF Bias'\);\s*\}/.test(auto), true);
check('walang dobleng linya',
  (auto.match(/reasons\.add\('Against Daily Bias \/ HTF Bias'\)/g) || []).length, 1);
check('divergence -> Chased Extended Move',
  /rightHand === 'yes'\)\{\s*reasons\.add\('Chased Extended Move'\)/.test(auto), true);
check('3rd/4th/5th -> Chased Extended Move',
  /lateSequence\.has\(answers\[i\]\)\) reasons\.add\('Chased Extended Move'\)/.test(auto), true);
check('walang auto-rule para sa Key Level (manwal ito)',
  /Traded Into Key Level/.test(auto), false);


// Ang mga seksyong sumusubok sa Edge Map ay tinanggal — pinalitan na siya ng
// dalawang panel (Discipline & Experiments, Pattern/Session/Confluence), at
// sinusubok sila ng sim-panels.js. Ang klasipikasyon ng tag ang natitira dito.

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);