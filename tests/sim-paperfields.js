const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG PAPER TRADE AY ISANG SETUP NA HINDI NANGYARI.

   "hindi ko naman talaga napasok yun eh so wala akong full details like open
   date close date account... wala din akong quantity leverage rr"

   Tama siya, at ang drawer ay nagtatanong ng lahat ng iyon. Dalawang bagay ang
   sinusuri dito:

     1. NAWAWALA ba ang mga field na walang sagot — hindi lang blangko kundi
        wala talaga. Ang isang form na nagtatanong ng hindi masasagot ay
        mukhang sira, at ang blangkong column ay mukhang nawawalang datos
        gayong wala talagang datos doon kailanman.

     2. NANDOON ba ang mga field na MERON siyang sagot — entry, TP, SL,
        symbol, setup — at ang dalawang bago: bakit at ano sana ang nangyari. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + ' = \\[').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '[') d++;
    else if(js[j] === ']'){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
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

// Ang totoong grupo, hindi isang gawa-gawa — ito ang sinusuri sa ibaba.
const GROUPS = new Function(arrBlock('NO_TRADE_REASON_GROUPS') + ' return NO_TRADE_REASON_GROUPS;')();
const OUT_GROUPS = new Function(arrBlock('PAPER_OUTCOME_GROUPS') + ' return PAPER_OUTCOME_GROUPS;')();
const FIELDS = new Function('FIELD_OPTIONS','UNFOLLOWED_RULES_OPTIONS','NO_TRADE_REASONS',
  'NO_TRADE_REASON_GROUPS','PAPER_OUTCOMES','PAPER_OUTCOME_GROUPS',
  arrBlock('ALL_DRAWER_FIELDS') + ' return ALL_DRAWER_FIELDS;')(
  new Proxy({}, { get: () => [] }), [], GROUPS.flatMap(g => g.items), GROUPS,
  OUT_GROUPS.flatMap(g => g.items), OUT_GROUPS);

/* Ang mismong pagsala ng drawer, kinuha bilang teksto para hindi ako gumawa ng
   pangalawang bersyon nito na maaaring hindi sumang-ayon sa una. */
const filterLine = /DRAWER_FIELDS\.filter\(f => _drawerIsPaper\(row\) \? !f\.realOnly : !f\.paperOnly\)/.test(js);
check('iisang pagsala, dalawang direksyon', filterLine, true);

const forPaper = FIELDS.filter(f => !f.realOnly).map(f => f.key);
const forReal  = FIELDS.filter(f => !f.paperOnly).map(f => f.key);

console.log('\n1. WALA SA PAPER TRADE — dahil hindi ito nangyari\n');
/* Ang bawat isa rito ay may dahilan kung bakit imposible, hindi lang
   "hindi kailangan". */
const impossible = {
  close_date:   'walang nagsara — walang bumukas',
  duration:     'walang haba ang hindi nangyari',
  close_price:  'walang presyong pinagsarhan',
  profit_loss:  'walang perang nakuha o nawala',
  pnl_percent:  'porsyento ng wala',
  fee:          'walang binayarang bayad',
  position_size:'walang binili',
  leverage:     'walang hiniram',
  account:      'hindi ito pumasok sa kahit anong account',
  account_type: 'wala rin',
  risk_amount:  'kailangan ng quantity, na wala',
  win_loss:     'ang outcome nito ay paper_outcome',
  rules_followed:      'walang trade na masisira',
  unfollowed_rules:    'wala rin',
  exit_type:           'walang paglabas',
  post_be_result:      'walang BE na naabot',
  post_cutloss_result: 'walang cutloss',
};
const stillThere = Object.keys(impossible).filter(k => forPaper.includes(k));
Object.entries(impossible).forEach(([k, why]) =>
  console.log('  ' + (forPaper.includes(k) ? 'NANDOON PA ' : 'wala na    ') + k.padEnd(21) + why));
check('lahat ng imposible ay nawala', stillThere.join(', ') || 'wala', 'wala');

console.log('\n2. NANDOON PA — dahil may sagot siya rito\n');
const needed = ['symbol','open_date','entry_price','tp_price','sl_price',
                'trade_type','trade_setup','pattern_type','execution_tf','aof_phase',
                'session','notes','link','no_trade_reason','paper_outcome','planned_rr'];
const missing = needed.filter(k => !forPaper.includes(k));
needed.forEach(k => console.log('  ' + (forPaper.includes(k) ? 'meron ' : 'NAWALA') + ' ' + k));
check('bawat masasagot ay nandoon', missing.join(', ') || 'lahat', 'lahat');

console.log('\n3. HINDI NASIRA ANG TUNAY NA TRADE\n');
// Ang tunay na journal ay dapat may LAHAT pa rin maliban sa dalawang paper-only.
['close_date','account','position_size','leverage','win_loss','unfollowed_rules','profit_loss']
  .forEach(k => check('nandoon pa rin sa tunay: ' + k, forReal.includes(k), true));
['no_trade_reason','paper_outcome','planned_rr']
  .forEach(k => check('wala sa tunay: ' + k, forReal.includes(k), false));

console.log('\n4. ANG RR NG PLANO\n');
const rr = new Function(fnBody('_plannedRR') + ' return _plannedRR;')();
// Long: entry 100, TP 130, SL 90 -> 30/10 = 3
check('long', rr({ entry_price:100, tp_price:130, sl_price:90 }), 3);
// Short: entry 100, TP 70, SL 110 -> 30/10 = 3
check('short', rr({ entry_price:100, tp_price:70, sl_price:110 }), 3);
check('kulang ang TP -> null', rr({ entry_price:100, sl_price:90 }), null);
check('SL sa entry -> null, hindi Infinity', rr({ entry_price:100, tp_price:130, sl_price:100 }), null);
check('teksto na numero ay ayos', rr({ entry_price:'100', tp_price:'130', sl_price:'90' }), 3);
// Ang zero ay isang tunay na presyo at hindi "wala" — pero ang zero na SL ay
// isang placeholder at magbibigay ng napakalaking RR. Sinusuri ko kung ano ang
// tunay na ginagawa nito para walang sorpresa.
console.log('     SL na zero -> ' + rr({ entry_price:100, tp_price:130, sl_price:0 }));

console.log('\n5. ANG LIMANG OUTCOME\n');
const OUT = new Function(arrBlock('PAPER_OUTCOMES') + ' return PAPER_OUTCOMES;')();
console.log('     ' + OUT.join(' · '));
check('anim sila', OUT.length, 6);
// Sariling pagpipilian na ito, hindi na isang kombinasyong dapat tandaan.
check('may "Stopped out then hit TP"',
  OUT.includes('Stopped out then hit TP'), true);
check('may BE', OUT.some(o => /BE/.test(o)), true);
check('may cutloss', OUT.some(o => /cut loss/i.test(o)), true);
check('hiwalay ang "Never filled"', OUT.includes('Never filled'), true);
/* Ang "Not checked yet" ay ang KAWALAN ng sagot, hindi isang sagot. May
   pindutang Clear ang listahan para doon. */
check('ang "Not checked yet" ay hindi pagpipilian',
  OUT.includes('Not checked yet'), false);
{
  const inG = new Set(OUT_GROUPS.flatMap(g => g.items));
  check('bawat sagot ay may grupo', OUT.filter(o => !inG.has(o)).join(', ') || 'wala', 'wala');
  check('tatlong grupo ng outcome', OUT_GROUPS.length, 3);
  check('may kind bawat grupo', OUT_GROUPS.every(g => g.kind), true);
}

console.log('\n5b. WALANG KUWIT SA ANUMANG PAGPIPILIAN\n');
/* ANG BITAG NA HULING NAHULOG AKO.

   Ang bawat maramihang field ay iniimbak na comma-joined — ang outcome, ang
   dahilan, ang trade tags, ang chart pattern. Ang pagpipiliang may KUWIT sa
   pangalan ay nahahati sa dalawa sa pagbasa, at hindi na ito kailanman
   makakabalik sa sarili nito.

   Nangyari ito sa "Stopped out, then hit TP": nagawa ko ito, na-save nang
   maayos, at nagbalik bilang "Stopped out" at "then hit TP" — dalawang
   pagpipiliang wala sa anumang listahan. Ang hatol ay naging "unknown" at
   tahimik sana ito kung hindi ko sinusuri ang uri.

   Isang panuntunan para sa lahat, magpakailanman. */
{
  const lists = {
    PAPER_OUTCOMES: OUT,
    NO_TRADE_REASONS: GROUPS.flatMap(g => g.items),
    UNFOLLOWED_RULES_OPTIONS: new Function(
      arrBlock('UNFOLLOWED_RULES_OPTIONS') + ' return UNFOLLOWED_RULES_OPTIONS;')(),
  };
  // Ang chart pattern ay comma-joined din — nasa loob ito ng CONFLUENCE_SETUPS.
  const pats = [...new Set([...js.matchAll(/patterns:\s*\[([^\]]*)\]/g)]
    .flatMap(m => m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''))))]
    .filter(Boolean);
  lists['chart patterns'] = pats;

  let dirty = [];
  Object.entries(lists).forEach(([name, arr]) => {
    const bad = (arr || []).filter(o => String(o).includes(','));
    console.log('  ' + name.padEnd(26) + (arr || []).length + ' na pagpipilian' +
      (bad.length ? '   MAY KUWIT: ' + bad.join(' | ') : ''));
    bad.forEach(b => dirty.push(name + ': ' + b));
  });
  check('walang pagpipiliang may kuwit', dirty.join(' · ') || 'wala', 'wala');
}

console.log('\n6. ANG NANGINGIBABAW NA HATOL KAPAG MARAMI\n');
/* Ito ang pinakamahalagang bahagi ng maramihan. Kung walang pagkakasunod, ang
   setup na markado ng Hit TP AT Hit SL ay mabibilang sa DALAWANG panig. */
const kindOf = new Function(fnBody('_paperList') + fnBody('_paperOutcomeKind') +
  ' return _paperOutcomeKind;')();
const cases = [
  ['Hit TP',                          'missed', 'nakuha sana'],
  ['Hit SL',                          'saved',  'natalo sana'],
  /* "SL pero nag punta padin sa TP ko" — sariling hatol ito. Iniligtas ka pa
     rin ng pag-pass (1R), pero ang aral ay tungkol sa STOP at hindi sa basa. */
  ['Stopped out then hit TP',        'whipsaw','sariling pagpipilian — isang pindot'],
  ['Hit SL, Hit TP',                  'whipsaw','ang lumang kombinasyon, bantay pa rin'],
  ['Hit TP, Hit SL',                  'whipsaw','pareho, anuman ang pagkakasunod'],
  ['Never filled, Hit TP',            'entry',  'tumakbo nang wala ka — mali ang entry, hindi ang basa'],
  ["Would have BE'd out",             'flat',   'walang nakuha, walang nawala'],
  ['Would have cut loss',             'saved',  'naiwasan mo ang bahagyang talo'],
  ['Never filled',                    'moot',   'walang nangyari'],
  ['',                                'unknown','hindi pa tiningnan'],
];
cases.forEach(([v, want, why]) =>
  check((v || '(blangko)').padEnd(24) + why.slice(0, 22), kindOf(v), want));

console.log('\n7. ANG R — AT ANG MALI NA NAHANAP KO\n');
/* Ang naiwasang SL ay IISANG R at hindi RR. Ang planned RR ay ang gantimpala;
   ang risk ay 1R sa kahulugan. Ang unang bersyon ay gumamit ng RR sa
   magkabilang panig, kaya ang isang 3R na setup na tumama sa SL ay nagsabing
   nagligtas ito sa iyo ng 3R gayong 1R lang. */
const rOf = new Function(fnBody('_plannedRR') + fnBody('_paperList') +
  fnBody('_paperOutcomeKind') + fnBody('_paperOutcomeR') + ' return _paperOutcomeR;')();
const T3 = o => ({ entry_price:100, tp_price:130, sl_price:90, paper_outcome:o }); // 3R
check('napalampas na TP -> ang buong 3R', rOf(T3('Hit TP')), 3);
check('naiwasang SL -> 1R, HINDI 3R', rOf(T3('Hit SL')), 1);
// Ang whipsaw ay 1R din: nastop ka sana, at hindi mo aabutin ang TP na iyon.
check('nastop tapos gumana -> 1R pa rin', rOf(T3('Hit SL, Hit TP')), 1);
check('ang sariling pagpipilian -> 1R din', rOf(T3('Stopped out then hit TP')), 1);
check('cutloss -> 0R, hindi ako nag-iimbento', rOf(T3('Would have cut loss')), 0);
check('BE -> 0R', rOf(T3("Would have BE'd out")), 0);
check('never filled -> 0R', rOf(T3('Never filled')), 0);
check('tumakbo nang wala ka -> 0R', rOf(T3('Never filled, Hit TP')), 0);
check('walang presyo -> 0R, hindi NaN',
  rOf({ paper_outcome:'Hit TP' }), 0);

console.log('\n8. IISANG PANIG KADA SETUP\n');
/* Ang buong panganib ng maramihan sa isang pangungusap: walang setup na
   nabibilang sa dalawang panig. */
const rows = ['Hit TP', 'Hit SL', 'Hit TP, Hit SL', 'Never filled, Hit TP',
              "Would have BE'd out", 'Would have cut loss', 'Never filled', '']
  .map(o => T3(o));
const tally = {};
rows.forEach(t => { const k = kindOf(t.paper_outcome); tally[k] = (tally[k] || 0) + 1; });
console.log('     ' + JSON.stringify(tally));
check('walo ang hilera at walo ang nabilang',
  Object.values(tally).reduce((a, b) => a + b, 0), rows.length);
check('dalawa ang saved (SL at cutloss)', tally.saved, 2);
check('isa ang whipsaw (TP + SL)', tally.whipsaw, 1);
check('isa ang missed', tally.missed, 1);
check('isa ang entry', tally.entry, 1);
/* Ang mahalagang tanong ng buong seksyon: walang setup na nabibilang sa
   dalawang panig, kahit ilan pa ang nakamarka rito. */
check('iisang hatol kada setup',
  new Set(rows.map(t => kindOf(t.paper_outcome))).size <= Object.keys(tally).length, true);

console.log('\n9. NAKAGRUPO ANG LISTAHAN NG DAHILAN\n');
{
  const f = FIELDS.find(x => x.key === 'no_trade_reason');
  check('may optionGroups ang field', !!f.optionGroups, true);
  // Ang render ay dapat gumamit ng <optgroup> kapag may grupo.
  check('gumagawa ng <optgroup>', /<optgroup label="/.test(js), true);
  check('ginagamit ang g.name, hindi g.label',
    /g\.name \+ \(g\.sub/.test(js), true);
  /* Ang bawat dahilan ay dapat nasa isang grupo — kung may maiiwan sa labas,
     lalabas ito sa itaas na walang pamagat at magmumukhang aksidente. */
  const REASONS = GROUPS.flatMap(g => g.items);
  const inGroups = new Set(GROUPS.flatMap(g => g.items));
  const orphans = REASONS.filter(r => !inGroups.has(r));
  console.log('     ' + GROUPS.map(g => g.name + ' (' + g.items.length + ')').join(' · '));
  check('walang dahilang nasa labas ng grupo', orphans.join(', ') || 'wala', 'wala');
  check('apat na grupo', GROUPS.length, 4);
  check('may paliwanag ang bawat grupo', GROUPS.every(g => g.sub), true);

  /* ANG MAPA NG URI AY SA PANGALAN, HINDI SA POSISYON.

     Ang lumang bersyon ay ['felt','setup','life'][i]. Dalawang bagay ang mali
     roon at pareho silang tahimik: ang ikaapat na grupo ay undefined ang uri,
     at ang pagpapalit ng pagkakasunod ay magbabago sa kahulugan ng BAWAT
     naitalang trade. Sinusuri ko ang dalawa. */
  const KINDMAP = new Function(arrBlock('NO_TRADE_REASON_GROUPS') +
    js.slice(js.indexOf('const NO_TRADE_KIND = {}'),
             js.indexOf('const UNFOLLOWED_RULES_OPTIONS')) +
    ' return NO_TRADE_KIND;')();
  const unmapped = REASONS.filter(r => !KINDMAP[r.toLowerCase()]);
  check('bawat dahilan ay may uri', unmapped.join(', ') || 'lahat', 'lahat');
  /* Sa CODE lang, hindi sa komento. Ang unang bersyon nito ay naghanap sa
     buong file at tumama sa sarili kong paliwanag ng lumang paraan — ang
     parehong maling positibo na nakuha ko sa "service_role". Ang tanong ay
     kung TUMATAKBO pa ito, hindi kung nababanggit. */
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('hindi naka-index ang mapa',
    /\['felt','setup','life'\]\[i\]/.test(code) ? 'naka-index pa' : 'sa pangalan', 'sa pangalan');
  check('gumagamit ng g.kind', /NO_TRADE_KIND\[x\.toLowerCase\(\)\] = g\.kind/.test(code), true);
  check('may kind ang bawat grupo', GROUPS.every(g => g.kind), true);
  check('may cls ang bawat grupo', GROUPS.every(g => g.cls), true);
  check('may sariling pangungusap ang bawat grupo',
    GROUPS.every(g => typeof g.lead === 'function'), true);
  // Ang bagong grupo mismo.
  const read = GROUPS.find(g => g.kind === 'read');
  check('may grupo para sa maling timeframe', !!read, true);
  check('at ang paliwanag nito', read ? read.sub : '(wala)', 'no fault — feeds the reports');
  check('may 15m/5m na pagpipilian',
    read && read.items.some(i => /higher timeframe/.test(i)), true);
}

console.log('\n10. ANG RR AY KINUKUWENTA, WALANG DOBLENG FIELD\n');
{
  // Ang lumang "RR" ay para sa trade na nangyari; sa paper ito ay laging
  // blangko at nakakalito sa tabi ng "Planned RR".
  check('walang lumang RR sa paper', forPaper.includes('rr'), false);
  check('nandoon pa rin sa tunay na trade', forReal.includes('rr'), true);
  check('ang planned_rr ay hindi masusulatan',
    FIELDS.find(x => x.key === 'planned_rr').editable, false);
}

console.log('\n' + (fail ? fail + ' FAIL' : 'tama ang hugis ng paper trade'));
process.exit(fail ? 1 : 0);
