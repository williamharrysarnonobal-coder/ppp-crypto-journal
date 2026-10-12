const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Post-Cutloss Result: ang bagong column. Kaparehong hugis ng Post-BE Result
// pero nakasabit sa Exit Type = "Cut Loss" imbes na Win/Loss = Breakeven.
// Ang tanong na sinasagot nito: sulit ba ang pag-cut ko ng talo?
const fs = require('fs');
const PATH = __ROOT + '/js/dashboard.js';
const js = fs.readFileSync(PATH, 'utf8');

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function line(p){ const i = js.indexOf(p); if(i<0) throw new Error('missing: '+p);
  return js.slice(i, js.indexOf('\n', i)); }
function arrBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
function objBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// ---------- 1. Nakarehistro ba ang column sa lahat ng listahan? ----------
console.log('1. NASA LAHAT BA NG LISTAHAN ANG COLUMN?\n');
const FIELD_OPTIONS = new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')();
check('may options', JSON.stringify(FIELD_OPTIONS.post_cutloss_result),
  '["TP After Cutloss","SL After Cutloss","N/A"]');
check('kaparehong bilang ng Post-BE',
  FIELD_OPTIONS.post_cutloss_result.length, FIELD_OPTIONS.post_be_result.length);
check('may N/A', FIELD_OPTIONS.post_cutloss_result.includes('N/A'), true);
check('"Cut Loss" ay isang Exit Type', FIELD_OPTIONS.exit_type.includes('Cut Loss'), true);

// Tunay na i-eval ang bawat listahan — huwag maghanap ng teksto. Ang unang
// bersyon nito ay naghanap ng "},\n  {key:" at bumagsak sa \r\n ng Windows
// gayong tama naman ang code: isang pagkakamali sa test, hindi sa app.
const listHas = (name, key, field) => {
  const arr = new Function('FIELD_OPTIONS','UNFOLLOWED_RULES_OPTIONS','NO_TRADE_REASONS',
    'NO_TRADE_REASON_GROUPS','PAPER_OUTCOMES','PAPER_OUTCOME_GROUPS',
    arrBlock(name) + ' return ' + name + ';')(FIELD_OPTIONS, [], [], [], [], []);
  const hit = arr.find(e => (field ? e[field] : e) === key);
  return { found: !!hit, entry: hit, after: arr[arr.indexOf(hit) + 1] };
};
let L = listHas('ALL_DRAWER_FIELDS', 'post_cutloss_result', 'key');
check('ALL_DRAWER_FIELDS (drawer field)', L.found, true);
check('  select widget', L.entry.widget, 'select');
check('  editable', L.entry.editable, true);
check('  nakakabit sa tamang options', L.entry.options === FIELD_OPTIONS.post_cutloss_result, true);
check('  label', L.entry.label, 'Post-Cutloss Result');

L = listHas('ALL_JOURNAL_COLUMNS', 'post_cutloss_result', 'key');
check('ALL_JOURNAL_COLUMNS (column sa table)', L.found, true);
L = listHas('OPTIONS_FIELD_META', 'post_cutloss_result', 'key');
check('OPTIONS_FIELD_META (Options editor)', L.found, true);

// Katabi ng Post-BE sa bawat listahan — magkapatid sila, dapat magkasunod.
['ALL_DRAWER_FIELDS','ALL_JOURNAL_COLUMNS','OPTIONS_FIELD_META'].forEach(n => {
  const be = listHas(n, 'post_be_result', 'key');
  check('  katabi ng Post-BE sa ' + n, be.after && be.after.key, 'post_cutloss_result');
});

check('Discipline group sa drawer',
  js.includes("'exit_type','post_be_result','post_cutloss_result'"), true);
check('normalizeTrade', js.includes('post_cutloss_result: r.post_cutloss_result || ""'), true);

const VALIDATED = new Function(arrBlock('JOURNAL_VALIDATED_KEYS') + ' return JOURNAL_VALIDATED_KEYS;')();
check('nasa JOURNAL_VALIDATED_KEYS', VALIDATED.includes('post_cutloss_result'), true);

// ---------- 2. Ang validation ----------
console.log('\n2. NAHUHULI BA ANG MALING SAGOT?\n');
const vScope = {
  FIELD_OPTIONS,
  UNFOLLOWED_RULES_OPTIONS: new Function(arrBlock('UNFOLLOWED_RULES_OPTIONS') +
    ' return UNFOLLOWED_RULES_OPTIONS;')(),
  ALL_DRAWER_FIELDS: [{key:'post_cutloss_result', label:'Post-Cutloss Result'},
                      {key:'post_be_result', label:'Post-BE Result'},
                      {key:'exit_type', label:'Exit Type'}],
  CONFLUENCE_SETUPS: {},
  _confluenceScoreFor: () => null,
  DEFAULT_MIN_CONFLUENCE_PCT: 60,
  TRADING_ACCOUNTS: [],
  _postBEApplies: new Function(grab('const _postBEApplies') + '; return _postBEApplies;')(),
  ...require('./tag-core').API,
  _staleConfluenceItems: () => [],
  _confluenceScoreFor: () => null,
  DEFAULT_MIN_CONFLUENCE_PCT: 60,
};
const invalid = new Function(...Object.keys(vScope), `
  ${arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${grab('const _isBlankish')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  return _journalInvalidFields;
`)(...Object.values(vScope));

const keysOf = r => invalid(r).map(b => b.key);
check('tanggap ang tamang sagot sa Cut Loss',
  keysOf({ exit_type:'Cut Loss', post_cutloss_result:'SL After Cutloss' }).length, 0);
check('tanggap ang N/A sa hindi Cut Loss',
  keysOf({ exit_type:'TP Hit', post_cutloss_result:'N/A' }).length, 0);
check('tanggap ang blangko',
  keysOf({ exit_type:'Cut Loss', post_cutloss_result:'' }).length, 0);
check('BAWAL: sagot sa trade na hindi cut',
  keysOf({ exit_type:'TP Hit', post_cutloss_result:'TP After Cutloss' })
    .includes('post_cutloss_result'), true);
check('BAWAL: halagang wala sa listahan',
  keysOf({ exit_type:'Cut Loss', post_cutloss_result:'Good Cut' })
    .includes('post_cutloss_result'), true);
const msg = invalid({ exit_type:'SL Hit', post_cutloss_result:'SL After Cutloss' })[0].value;
console.log('   sinasabi ng babala: "' + msg + '"');
check('binabanggit ang Exit Type sa babala', /but Exit Type is SL Hit/.test(msg), true);
// Ang katumbas nito sa Post-BE ay TINANGGAL, at tama lang: hindi magkasalungat
// ang "BE Hit" + "TP After BE". Hindi sinasabi ng Post-BE Result kung paano
// natapos ang trade — sinasabi nito kung ano ang ginawa ng presyo pagkaalis mo.
// Tingnan ang sim-postbe.js.
check('WALANG babala sa BE Hit + TP After BE',
  keysOf({ exit_type:'BE Hit', post_be_result:'TP After BE' }).length, 0);

// ---------- 3. Kailan ito hinihingi ----------
console.log('\n3. KAILAN ITO HINIHINGI NG JOURNAL?\n');
const mScope = {
  DRAWER_FIELDS: [{key:'post_cutloss_result'},{key:'post_be_result'},
                  {key:'exit_type'},{key:'unfollowed_rules'}],
  ALL_DRAWER_FIELDS: vScope.ALL_DRAWER_FIELDS.concat([{key:'unfollowed_rules', label:'Unfollowed Rules'}]),
  JOURNAL_REQUIRED_KEYS: [],
  _postBEApplies: new Function(grab('const _postBEApplies') + ' return _postBEApplies;')(),
};
const missing = new Function(...Object.keys(mScope), `
  ${grab('const _isBlankish')};
  ${grab('function _journalMissingFields(')}
  return _journalMissingFields;
`)(...Object.values(mScope));

check('HINIHINGI: Cut Loss na walang sagot',
  missing({ exit_type:'Cut Loss' }).includes('Post-Cutloss Result'), true);
check('hindi na hinihingi kapag sinagot',
  missing({ exit_type:'Cut Loss', post_cutloss_result:'SL After Cutloss' })
    .includes('Post-Cutloss Result'), false);
check('N/A ay sagot din',
  missing({ exit_type:'Cut Loss', post_cutloss_result:'N/A' })
    .includes('Post-Cutloss Result'), false);
check('hindi hinihingi sa TP Hit',
  missing({ exit_type:'TP Hit' }).includes('Post-Cutloss Result'), false);
check('hindi hinihingi sa blangkong Exit Type',
  missing({ exit_type:'' }).includes('Post-Cutloss Result'), false);
// Nakatago ang field => hindi nangungulit, gaya ng Post-BE
const missingHidden = new Function(...Object.keys(mScope), `
  ${grab('const _isBlankish')};
  ${grab('function _journalMissingFields(')}
  return _journalMissingFields;
`)(...Object.values({ ...mScope, DRAWER_FIELDS: [{key:'exit_type'}] }));
check('tahimik kapag itinago ang field',
  missingHidden({ exit_type:'Cut Loss' }).includes('Post-Cutloss Result'), false);

// ---------- 4. Ang auto-N/A sa drawer ----------
console.log('\n4. AUTOMATIC BANG N/A KAPAG HINDI CUT LOSS?\n');
function drawerRun(exitType, startValue, field = 'post_cutloss_result', fn = 'syncPostCutlossFromExitType'){
  const el = { value: startValue, _events: [], dispatchEvent(e){ this._events.push(e.type); },
               closest: () => row };
  const row = { _cls: new Set(), classList: {
    toggle(c, on){ on ? row._cls.add(c) : row._cls.delete(c); },
    remove(c){ row._cls.delete(c); }, add(c){ row._cls.add(c); } } };
  const scope = { document: { querySelector: s =>
    s.includes(field) ? el : null } };
  new Function(...Object.keys(scope), `
    ${grab('function ' + fn + '(')}
    ${grab('function _syncPostExitField(')}
    ${fn}(${JSON.stringify(exitType)});
  `)(...Object.values(scope));
  return { value: el.value, red: row._cls.has('needs-input') };
}
let r = drawerRun('TP Hit', '');
check('TP Hit -> N/A', r.value, 'N/A');
check('TP Hit -> hindi pula', r.red, false);
r = drawerRun('Cut Loss', 'N/A');
check('Cut Loss -> nililinis ang lumang N/A', r.value, '');
check('Cut Loss -> pula hanggang masagot', r.red, true);
r = drawerRun('Cut Loss', 'SL After Cutloss');
check('Cut Loss -> hindi binubura ang tunay na sagot', r.value, 'SL After Cutloss');
check('Cut Loss na sagot -> hindi pula', r.red, false);
r = drawerRun('SL Hit', 'TP After Cutloss');
check('paglipat palayo sa Cut Loss -> nagiging N/A', r.value, 'N/A');
check('cut loss (maliit na titik) ay Cut Loss pa rin', drawerRun('cut loss','N/A').value, '');

// ---------- 5. Post-Stop Profit: parehong hugis, Exit Type "Stop Profit" ----------
console.log('\n5. POST-STOP PROFIT\n');
const sp = (x, v) => drawerRun(x, v, 'post_stop_profit_result', 'syncPostStopProfitFromExitType');
check('TP Hit -> N/A', sp('TP Hit','').value, 'N/A');
check('Stop Profit -> nililinis ang N/A', sp('Stop Profit','N/A').value, '');
check('Stop Profit -> pula hanggang masagot', sp('Stop Profit','N/A').red, true);
check('Stop Profit -> hindi binubura ang sagot', sp('Stop Profit','TP After Stop Profit').value, 'TP After Stop Profit');
check('Cut Loss ay hindi ginagalaw ng Stop Profit', drawerRun('Stop Profit','').value, 'N/A');
check('BAWAL: sagot sa trade na hindi Stop Profit',
  keysOf({ exit_type:'TP Hit', post_stop_profit_result:'TP After Stop Profit' })
    .includes('post_stop_profit_result'), true);
check('tanggap ang tamang sagot sa Stop Profit',
  keysOf({ exit_type:'Stop Profit', post_stop_profit_result:'SL After Stop Profit' }).length, 0);
const mSP = new Function(...Object.keys(mScope), `
  ${grab('const _isBlankish')};
  ${grab('function _journalMissingFields(')}
  return _journalMissingFields;
`)(...Object.values({ ...mScope,
  DRAWER_FIELDS: mScope.DRAWER_FIELDS.concat([{key:'post_stop_profit_result'}]),
  ALL_DRAWER_FIELDS: mScope.ALL_DRAWER_FIELDS.concat([{key:'post_stop_profit_result', label:'Post-Stop Profit'}]) }));
check('HINIHINGI: Stop Profit na walang sagot',
  mSP({ exit_type:'Stop Profit' }).includes('Post-Stop Profit'), true);
check('hindi hinihingi sa TP Hit', mSP({ exit_type:'TP Hit' }).includes('Post-Stop Profit'), false);

// ---------- 5. Ang save patch ----------
console.log('\n5. HINDI BA NAKAKATAKAS ANG BLANGKO SA SAVE?\n');
const patchSrc = js.slice(js.indexOf('if(!patch.post_cutloss_result && patch.exit_type'),
                          js.indexOf('}', js.indexOf("patch.post_cutloss_result = 'N/A';")) + 1);
const applyPatch = new Function('patch', patchSrc + ' return patch;');
check('TP Hit -> N/A', applyPatch({ exit_type:'TP Hit' }).post_cutloss_result, 'N/A');
check('Cut Loss -> iniiwang blangko', applyPatch({ exit_type:'Cut Loss' }).post_cutloss_result, 'undefined');
check('blangkong exit -> iniiwan', applyPatch({}).post_cutloss_result, 'undefined');
check('hindi pinapatungan ang sagot',
  applyPatch({ exit_type:'TP Hit', post_cutloss_result:'SL After Cutloss' }).post_cutloss_result,
  'SL After Cutloss');
check('nasa dalawang landas (drawer + queue)',
  (js.match(/patch\.post_cutloss_result = 'N\/A';/g) || []).length, 2);

// ---------- 6. Ang hatol sa Edge Map ----------

// Ang mga seksyong sumusubok sa Edge Map ay tinanggal — pinalitan na siya ng
// dalawang panel (Discipline & Experiments, Pattern/Session/Confluence), at
// sinusubok sila ng sim-panels.js. Ang klasipikasyon ng tag ang natitira dito.

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);