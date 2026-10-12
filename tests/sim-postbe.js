const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang tamang kahulugan ng Post-BE Result, na mali ang pagkakaintindi ko dati.
//
//   Hindi nito sinasabi kung PAANO natapos ang trade — sinasabi na 'yon ng
//   Exit Type. Sinasabi nito kung ANO ANG GINAWA NG PRESYO PAGKAALIS MO.
//
//   TP After BE = na-stop out ka sa BE, tapos tumuloy ang presyo sa TP.
//                 -> NAGPATALO ang BE stop.
//   SL After BE = na-stop out ka sa BE, tapos tumuloy sa dating SL mo.
//                 -> NAGLIGTAS ang BE stop.
//
// Kaya ang "Exit Type = BE Hit" + "TP After BE" ay HINDI kontradiksyon —
// ito ang pinaka-mahalagang row sa journal.
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
function stmt(start){
  const i = js.indexOf(start);
  if (i < 0) throw new Error('missing: ' + start);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1); }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// ---------- 1. Wala na ang maling babala ----------
console.log('1. ANG MALING BABALA — WALA NA\n');
const FIELD_OPTIONS = new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')();
const vScope = {
  FIELD_OPTIONS,
  UNFOLLOWED_RULES_OPTIONS: new Function(arrBlock('UNFOLLOWED_RULES_OPTIONS') +
    ' return UNFOLLOWED_RULES_OPTIONS;')(),
  ALL_DRAWER_FIELDS: [{key:'post_be_result', label:'Post-BE Result'},
                      {key:'post_cutloss_result', label:'Post-Cutloss Result'}],
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

// Ito mismo ang tatlong trade sa screenshot niya: Breakeven + BE Hit + TP After BE.
const aug14 = { win_loss:'Breakeven', exit_type:'BE Hit', post_be_result:'TP After BE' };
console.log('   Ang trade sa screenshot: Breakeven · BE Hit · TP After BE');
check('WALANG babala na', invalid(aug14).length, 0);
check('wala nang "but Exit Type says BE Hit"',
  /but Exit Type says BE Hit/.test(js), false);
check('SL After BE ay tanggap din',
  invalid({ ...aug14, post_be_result:'SL After BE' }).length, 0);
// Pero ang tunay na maling halaga ay nahuhuli pa rin
check('nahuhuli pa rin ang halagang wala sa listahan',
  invalid({ ...aug14, post_be_result:'BE' }).length, 1);
check('buhay pa ang check ng Post-Cutloss',
  invalid({ exit_type:'TP Hit', post_cutloss_result:'TP After Cutloss' }).length, 1);

// ---------- 2. Wala nang kinakathang sagot ----------
console.log('\n2. WALA NANG KINAKATHANG SAGOT\n');
check('tanggal na ang _impliedPostBE na function',
  /function _impliedPostBE\(/.test(js), false);
check('wala nang tumatawag dito', /_impliedPostBE\(\{|_impliedPostBE\(r\)|_impliedPostBE\(patch\)/.test(js), false);

const norm = new Function('r', `
  ${grab('const _postBEApplies')}
  return { post_be_result: r.post_be_result || "" };
`);
check('BE Hit na blangko -> nananatiling blangko',
  '"' + norm({ exit_type:'BE Hit', post_be_result:'' }).post_be_result + '"', '""');
check('hindi napapatungan ang tunay na sagot',
  norm({ exit_type:'BE Hit', post_be_result:'TP After BE' }).post_be_result, 'TP After BE');
check('wala nang auto-fill sa save',
  /const implied = _impliedPostBE\(patch\)/.test(js), false);

// ---------- 3. Kailan ito hinihingi ----------
console.log('\n3. KAILAN HINIHINGI ANG SAGOT?\n');
const applies = new Function(grab('const _postBEApplies') + ' return _postBEApplies;')();
check('Breakeven -> oo', applies({ win_loss:'Breakeven' }), true);
check('BE Hit -> oo (BAGO — dati kinakatha)', applies({ exit_type:'BE Hit' }), true);
check('Win + TP Hit -> hindi', applies({ win_loss:'Win', exit_type:'TP Hit' }), false);
check('Loss + SL Hit -> hindi', applies({ win_loss:'Loss', exit_type:'SL Hit' }), false);
check('walang laman -> hindi', applies({}), false);

const mScope = {
  DRAWER_FIELDS: [{key:'post_be_result'},{key:'post_cutloss_result'},{key:'exit_type'}],
  ALL_DRAWER_FIELDS: vScope.ALL_DRAWER_FIELDS,
  JOURNAL_REQUIRED_KEYS: [],
  _postBEApplies: applies,
};
const missing = new Function(...Object.keys(mScope), `
  ${grab('const _isBlankish')};
  ${grab('function _journalMissingFields(')}
  return _journalMissingFields;
`)(...Object.values(mScope));
check('HINIHINGI: BE Hit na walang sagot',
  missing({ exit_type:'BE Hit' }).includes('Post-BE Result'), true);
check('HINIHINGI: Breakeven na walang sagot',
  missing({ win_loss:'Breakeven' }).includes('Post-BE Result'), true);
check('tahimik kapag sinagot',
  missing({ exit_type:'BE Hit', post_be_result:'TP After BE' }).includes('Post-BE Result'), false);
check('tahimik sa ordinaryong panalo',
  missing({ win_loss:'Win', exit_type:'TP Hit' }).includes('Post-BE Result'), false);

// ---------- 4. Ang drawer ----------
console.log('\n4. ANG DRAWER\n');
function drawerRun(winLoss, exitType, startValue){
  const el = { value: startValue, dispatchEvent(){}, closest: () => row };
  const row = { _cls: new Set(), classList: {
    toggle(c, on){ on ? row._cls.add(c) : row._cls.delete(c); },
    remove(c){ row._cls.delete(c); }, add(c){ row._cls.add(c); } } };
  const fields = { post_be_result: el, win_loss:{value:winLoss}, exit_type:{value:exitType} };
  const scope = { document: { querySelector: s => {
    const m = /data-field="([^"]+)"/.exec(s);
    return m ? (fields[m[1]] || null) : null;
  } }, _postBEApplies: applies };
  new Function(...Object.keys(scope), `
    ${grab('function _syncPostBE(')}
    _syncPostBE();
  `)(...Object.values(scope));
  return { value: el.value, red: row._cls.has('needs-input') };
}
let r = drawerRun('Win', 'TP Hit', '');
check('Win + TP Hit -> N/A', r.value, 'N/A');
check('   hindi pula', r.red, false);
r = drawerRun('Breakeven', 'BE Hit', 'N/A');
check('Breakeven + BE Hit -> nililinis ang N/A', r.value, '');
check('   pula hanggang masagot', r.red, true);
r = drawerRun('Breakeven', 'BE Hit', 'TP After BE');
check('hindi binubura ang tunay na sagot', r.value, 'TP After BE');
check('   hindi pula', r.red, false);
// Ang bagong kaso: BE Hit pero hindi Breakeven ang Win/Loss
r = drawerRun('Loss', 'BE Hit', 'N/A');
check('BE Hit lang (hindi Breakeven) -> humihingi pa rin', r.value, '');
check('   pula', r.red, true);
r = drawerRun('Win', 'TP Hit', 'TP After BE');
check('paglipat palayo -> nagiging N/A', r.value, 'N/A');

// ---------- 5. Ang hatol sa Edge Map ----------

// Ang mga seksyong sumusubok sa Edge Map ay tinanggal — pinalitan na siya ng
// dalawang panel (Discipline & Experiments, Pattern/Session/Confluence), at
// sinusubok sila ng sim-panels.js. Ang klasipikasyon ng tag ang natitira dito.

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);