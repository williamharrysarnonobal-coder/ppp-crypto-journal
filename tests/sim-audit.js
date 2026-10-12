// Ang tanong: "check mo nga lahat ng data kung ok na at tama na ba."
//
// Hindi ko mababasa ang database mula rito, kaya ito ang sinusubok: kaya bang
// MAKITA ng mga tsek ang bawat klase ng sira? Isang tsek na hindi kayang
// pumutok ay mas masahol pa sa walang tsek — nagsasabi siyang malinis ang
// datos gayong hindi pala.
//
// Ang trade ay dumadaan sa normalizeTrade BAGO ang anumang tsek, kaya doon
// nagsisimula ang lahat dito. Ang lumang sim ay nagpapakain ng hilaw na object
// at kaya hindi nito nahuli ang butas.
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
const objBlock = n => {
  const i = js.indexOf('const ' + n);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
};

const ACCOUNTS = [
  { account_name:'Upscale Trade 5K',  account_size:5000 },
  { account_name:'Upscale Trade 50K', account_size:50000 },
];

const REQ = new Function(core.arrBlock('JOURNAL_REQUIRED_KEYS') + ' return JOURNAL_REQUIRED_KEYS;')();
const ALL_FIELDS = REQ.concat(['unfollowed_rules','post_be_result','post_cutloss_result','account'])
  .map(k => ({ key:k, label:k.replace(/_/g,' ') }));

const API = new Function('TRADING_ACCOUNTS','FIELD_OPTIONS',
  'CONFLUENCE_SETUPS','DRAWER_FIELDS','ALL_DRAWER_FIELDS','_staleConfluenceItems','_confluenceScoreFor','DEFAULT_MIN_CONFLUENCE_PCT',
  'computeSession','computeDayOfWeek', `
  ${core.SRC}
  ${core.arrBlock('JOURNAL_REQUIRED_KEYS')}
  ${core.arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab('const _isBlankish')}
  ${grab('const _postBEApplies')}
  ${grab('const _num =')};
  ${grab('function normalizeTrade(')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  ${grab('function _journalMissingFields(')}
  return { normalizeTrade, _journalInvalidFields, _journalMissingFields, _isBlankish };
`)(ACCOUNTS,
   new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')(),
   {}, ALL_FIELDS, ALL_FIELDS,
   () => [], () => null, 60, () => 'London', () => 'Monday');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// Isang trade na buo — ang batayan.
const GOOD = {
  symbol:'BTC/USD', open_date:'2026-08-10T09:00:00Z', close_date:'2026-08-10T11:00:00Z',
  win_loss:'Win', profit_loss:250, account:'Upscale Trade 5K', session:'London',
  trade_type:'Long', trade_setup:'Bounce Play', pattern_type:'15 mins HL',
  execution_tf:'5 min', aof_phase:'IC', rules_followed:'Yes',
  unfollowed_rules:'Rules Followed', exit_type:'TP Hit', post_be_result:'N/A',
  post_cutloss_result:'N/A',
};
const audit = raw => {
  const t = API.normalizeTrade(raw);
  return { missing: API._journalMissingFields(t), invalid: API._journalInvalidFields(t) };
};

console.log('BATAYAN — buong trade, dapat walang reklamo\n');
const base = audit(GOOD);
check('walang missing', base.missing.join(', ') || '(wala)', '(wala)');
check('walang invalid', base.invalid.map(b=>b.label).join(', ') || '(wala)', '(wala)');

console.log('\n1. KAYA BANG MAHULI ANG BAWAT BLANGKONG REQUIRED COLUMN?\n');
console.log('   (dumadaan sa normalizeTrade, gaya ng totoong app)\n');
// Tatlo ang SINADYANG pinupunan ng normalizeTrade mula sa ibang column, kaya
// hindi sila kailanman magiging blangko. Sinuri isa-isa — hindi sila butas:
//
//   close_date   -> bumabagsak sa open_date. Ang trade na bukas pa ay walang
//                   close date, at hindi 'yon kulang na datos.
//   session      -> hinahango ng computeSession sa oras ng open_date. Kaya
//                   nga tinanggal ang pag-edit nito nang manual.
//   profit_loss  -> nagiging 0. Hindi ito matatanggal: ang 0 ay TOTOONG halaga
//                   para sa breakeven, kaya walang paraang ipagkaiba ang
//                   "walang laman" sa "zero". Nahuhuli naman ito ng win_loss.
const DERIVED = { close_date:'galing sa open_date', session:'galing sa oras ng open_date',
                  profit_loss:'nagiging 0 — tunay na halaga para sa breakeven' };
let blind = [];
REQ.forEach(k => {
  const r = audit({ ...GOOD, [k]: '' });
  const seen = r.missing.length > 0 || r.invalid.length > 0;
  const derived = Object.prototype.hasOwnProperty.call(DERIVED, k);
  if(!seen && !derived) blind.push(k);
  const mark = seen ? 'ok   ' : (derived ? 'hango' : 'BULAG');
  console.log('   ' + mark + ' ' + k.padEnd(15) + '-> ' +
    (r.missing.join(', ') || r.invalid.map(b=>b.label).join(', ') ||
     (derived ? DERIVED[k] : '(WALANG BABALA)')));
});
check('walang column na nakakalusot nang hindi sinasadya', blind.join(', ') || '(wala)', '(wala)');
// Isa-isa, para makita kung alin ang pumapalya kung sakali.
Object.keys(DERIVED).forEach(k => {
  const t2 = API.normalizeTrade({ ...GOOD, [k]: '' });
  const filled = k === 'profit_loss' ? t2[k] === 0 : !API._isBlankish(t2[k]);
  check('napupunan ang ' + k, filled, true);
});

console.log('\n   WALANG NaN kahit anong basura ang laman ng numero:');
// `'' != null` ay TRUE, kaya nakakalusot ang empty string sa lumang guard at
// nagiging NaN — tapos nilalason nito ang bawat kabuuang dinadaanan niya.
[['walang laman', ''], ['espasyo', '   '], ['teksto', 'abc'], ['null', null], ['wala', undefined]]
  .forEach(([label, v]) => {
    const t2 = API.normalizeTrade({ ...GOOD, profit_loss:v, fee:v });
    const ok = t2.profit_loss === 0 && t2.fee === 0;
    if(!ok) fail++;
    console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + ('profit_loss = ' + label).padEnd(28) +
      '-> ' + JSON.stringify(t2.profit_loss));
  });
[['presyo na walang laman', ''], ['presyo na teksto', 'x']].forEach(([label, v]) => {
  const t2 = API.normalizeTrade({ ...GOOD, entry_price:v, sl_price:v, position_size:v, rr:v });
  const ok = [t2.entry_price, t2.sl_price, t2.position_size, t2.rr].every(x => x === null);
  if(!ok) fail++;
  console.log('   ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(28) + '-> ' +
    JSON.stringify([t2.entry_price, t2.sl_price, t2.position_size, t2.rr]));
});
check('ang tunay na numero ay dumadaan',
  API.normalizeTrade({ ...GOOD, profit_loss:'250.75' }).profit_loss, 250.75);
check('ang negatibo ay dumadaan',
  API.normalizeTrade({ ...GOOD, profit_loss:-120 }).profit_loss, -120);
check('ang zero ay nananatiling zero',
  API.normalizeTrade({ ...GOOD, profit_loss:0 }).profit_loss, 0);

console.log('\n   Ang mga placeholder na isinusulat ng normalizeTrade:');
check('"Unspecified" ay blangko', API._isBlankish('Unspecified'), true);
check('"—" ay blangko', API._isBlankish('—'), true);
check('espasyo ay blangko', API._isBlankish('   '), true);
check('tunay na halaga ay hindi', API._isBlankish('Bounce Play'), false);
check('zero ay hindi blangko', API._isBlankish(0), false);

console.log('\n2. ANG ACCOUNT\n');
// Ang "Demo" ay HINDI row sa trading_accounts — nasa FIELD_OPTIONS lang siya,
// walang laki at walang prop-firm rules, at hindi naman kailangan. Pero totoo
// ang mga trade doon. Ang unang bersyon ng tsek na ito ay tumitingin lang sa
// trading_accounts, kaya tinawag niyang sira ang bawat isa sa kanila.
const demo = audit({ ...GOOD, account:'Demo' });
console.log('   Demo -> ' + (demo.invalid.map(b => b.label + ' = ' + b.value).join(' | ') || '(walang babala)'));
check('ang Demo ay TANGGAP', demo.invalid.some(b => b.key === 'account'), false);
const ghost = audit({ ...GOOD, account:'Upscale Trade 999K' });
console.log('   account na di-kilala -> ' + (ghost.invalid.map(b => b.value).join(' | ') || '(wala)'));
check('ang tunay na di-kilala ay nahuhuli', ghost.invalid.some(b => b.key === 'account'), true);
check('ang buhay na account ay tahimik',
  audit({ ...GOOD, account:'Upscale Trade 50K' }).invalid.some(b => b.key === 'account'), false);

// Dating may _emReturnPct dito: netPnl / account_size. Ang trade sa account na
// wala nang laki (halimbawa Demo) ay tahimik na nawawala sa ranking — kaya may
// babala na sa itaas. Pero tanggal na mismo ang sukat na 'yon: hindi na
// maikukumpara ang piso sa magkaibang account size, kaya BILANG ng trade na
// ang basehan ng dalawang panel. Ito na ang bagong panuntunan, at dapat
// walang makasingit na pera pabalik.
console.log('\n   Walang pera sa dalawang panel — bilang ng trade lang:');
const panelSrc = (() => {
  const a = js.indexOf('function _tagArmStats(');
  const b = js.indexOf('/* Findings');
  return js.slice(a, b);
})();
[['fmtMoney','pagpapakita ng piso'], ['netPnl','kabuuang piso'],
 ['account_size','laki ng account'], ['TRADING_ACCOUNTS','talaan ng account'],
 ['_emReturnPct','lumang return-on-account']].forEach(([needle, label]) => {
  check('walang ' + label.padEnd(26), new RegExp('\\b' + needle + '\\b').test(panelSrc), false);
});

console.log('\n   Habang hindi pa nakakarating ang accounts (async), tahimik:');
const noAcc = new Function('TRADING_ACCOUNTS','FIELD_OPTIONS',
  'CONFLUENCE_SETUPS','ALL_DRAWER_FIELDS','_staleConfluenceItems','_confluenceScoreFor','DEFAULT_MIN_CONFLUENCE_PCT', `
  ${core.SRC}
  ${core.arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab('const _isBlankish')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  return _journalInvalidFields;
`)([], new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')(),
   {}, ALL_FIELDS, () => [], () => null, 60);
check('walang maling babala sa bootup',
  noAcc({ ...GOOD, account:'Demo' }).some(b => b.key === 'account'), false);

console.log('\n3. ANG MGA KONDISYONAL\n');
const cond = [
  ['Breakeven, walang Post-BE',   { win_loss:'Breakeven', exit_type:'BE Hit', post_be_result:'' }, 'post be result'],
  ['BE Hit lang, walang Post-BE', { exit_type:'BE Hit', post_be_result:'' },                       'post be result'],
  ['Cut Loss, walang Post-Cutloss',{ exit_type:'Cut Loss', post_cutloss_result:'' },               'post cutloss result'],
  ['Rules=No, walang tag',        { rules_followed:'No', unfollowed_rules:'' },                    'unfollowed rules'],
];
cond.forEach(([label, patch, want]) => {
  const r = audit({ ...GOOD, ...patch });
  const hit = r.missing.some(m => m.toLowerCase() === want);
  if(!hit) fail++;
  console.log('   ' + (hit ? 'ok   ' : 'FAIL ') + label.padEnd(32) + '-> ' + (r.missing.join(', ') || '(wala)'));
});

console.log('\n4. ANG MGA MALING HALAGA\n');
const bad = [
  ['win_loss "Winner"',        { win_loss:'Winner' }],
  ['exit_type "Closed"',       { exit_type:'Closed' }],
  ['aof_phase "Phase 1"',      { aof_phase:'Phase 1' }],
  ['tag na "Ghost Rule"',      { rules_followed:'No', unfollowed_rules:'Ghost Rule' }],
  ['retired na "Early TP"',    { rules_followed:'No', unfollowed_rules:'Early TP' }],
  ['Post-BE sa maling trade',  { post_be_result:'TP After BE' }],
  ['Post-Cutloss sa TP Hit',   { post_cutloss_result:'SL After Cutloss' }],
];
bad.forEach(([label, patch]) => {
  const r = audit({ ...GOOD, ...patch });
  const hit = r.invalid.length > 0;
  if(!hit) fail++;
  const txt = r.invalid.map(b => b.value).join(' | ');
  console.log('   ' + (hit ? 'ok   ' : 'FAIL ') + label.padEnd(28) + '-> ' +
    (txt.length > 62 ? txt.slice(0,62) + '…' : txt || '(WALANG BABALA)'));
});

console.log('\n5. HINDI MAINGAY SA MALINIS NA DATOS\n');
const quiet = [
  ['ordinaryong panalo',        {}],
  ['talo na may dahilan',       { win_loss:'Loss', profit_loss:-120, exit_type:'SL Hit',
                                  rules_followed:'No', unfollowed_rules:'FOMO Entry' }],
  ['breakeven na sinagot',      { win_loss:'Breakeven', exit_type:'BE Hit', profit_loss:0,
                                  post_be_result:'SL After BE' }],
  ['cut loss na sinagot',       { win_loss:'Loss', profit_loss:-80, exit_type:'Cut Loss',
                                  post_cutloss_result:'SL After Cutloss' }],
  ['may observation, malinis',  { rules_followed:'Yes',
                                  unfollowed_rules:"Rules Followed, No BE at Prev High/Low" }],
];
quiet.forEach(([label, patch]) => {
  const r = audit({ ...GOOD, ...patch });
  const noisy = r.missing.length + r.invalid.length;
  if(noisy) fail++;
  console.log('   ' + (noisy ? 'FAIL ' : 'ok   ') + label.padEnd(28) + '-> ' +
    (noisy ? r.missing.concat(r.invalid.map(b=>b.label)).join(', ') : 'tahimik'));
});

console.log('\n' + (fail ? fail + ' FAIL' : 'walang sira na nakakalusot'));
process.exit(fail ? 1 : 0);
