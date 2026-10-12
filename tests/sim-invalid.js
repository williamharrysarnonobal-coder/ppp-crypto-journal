const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Every column with a fixed option list is now checked. The trap this has to
// avoid: FIELD_OPTIONS.account still holds the legacy AppSheet names, so
// checking it would flag every trade in the journal.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
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
function arrBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
function arrowConst(n){ const i = js.indexOf('const '+n+' ='); return js.slice(i, js.indexOf('\n', js.indexOf(';', i))); }

const CS = new Function(objBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();
const FO = new Function(objBlock('FIELD_OPTIONS') + ' return FIELD_OPTIONS;')();

const API = new Function('CONFLUENCE_SETUPS','FIELD_OPTIONS','ALL_DRAWER_FIELDS','TRADING_ACCOUNTS','_postBEApplies','_confluenceScoreFor','DEFAULT_MIN_CONFLUENCE_PCT', `
  ${require('./tag-core').SRC}
  ${grab('function _patternList(')}
  ${arrBlock('JOURNAL_VALIDATED_KEYS')}
  ${js.slice(js.indexOf('const _isBlankish'), js.indexOf('};', js.indexOf('const _isBlankish')) + 2)}
  ${grab('function _staleConfluenceItems(')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  return { _journalInvalidFields, JOURNAL_VALIDATED_KEYS };
`)(CS, FO, [], [], new Function(grab('const _postBEApplies') + '; return _postBEApplies;')(), () => null, 60);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};
const names = bad => bad.map(b => b.key + '="' + b.value + '"').join(', ');

const clean = {
  win_loss:'Win', trade_type:'Long', trade_setup:'Bounce Play', pattern_type:'15 mins HL',
  execution_tf:'5 min', aof_phase:'IC', rules_followed:'Yes', account_type:'Evaluation',
  exit_type:'TP Hit', post_be_result:'N/A', unfollowed_rules:'Rules Followed',
  chart_pattern:'Double Bottom', account:'Upscale Trade 5K',
  session:'London', day_of_week:'Wednesday', confluence_answers:null,
};

console.log('Malinis na trade:');
check('walang reklamo', names(API._journalInvalidFields(clean)), '');

console.log('\nANG BITAG — account na hindi nasa lumang listahan:');
console.log('   FIELD_OPTIONS.account = ' + JSON.stringify(FO.account));
console.log('   ang account niya      = "Upscale Trade 5K"');
check('HINDI mina-mark ang account', names(API._journalInvalidFields(clean)).includes('account'), false);
check('wala sa validated keys', API.JOURNAL_VALIDATED_KEYS.includes('account'), false);
check('wala rin ang session', API.JOURNAL_VALIDATED_KEYS.includes('session'), false);
check('wala rin ang day_of_week', API.JOURNAL_VALIDATED_KEYS.includes('day_of_week'), false);

console.log('\nBlangko at "Unspecified" ay hindi mali:');
check('blangko', names(API._journalInvalidFields({ ...clean, aof_phase:'' })), '');
check('Unspecified', names(API._journalInvalidFields({ ...clean, pattern_type:'Unspecified',
  chart_pattern:'', confluence_answers:null })), '');

console.log('\nBawat column na may listahan:');
[
  ['win_loss','Winner'], ['trade_type','Buy'], ['trade_setup','Scalp Play'],
  ['pattern_type','10 mins HL'], ['execution_tf','2 min'], ['aof_phase','Phase 1'],
  ['rules_followed','Maybe'], ['account_type','Live'], ['exit_type','Closed'],
  ['post_be_result','Unknown'],
].forEach(([k, badVal]) => {
  const bad = API._journalInvalidFields({ ...clean, [k]: badVal, chart_pattern:'', confluence_answers:null });
  const hit = bad.some(b => b.key === k);
  if(!hit) fail++;
  console.log('   ' + (hit ? 'ok   ' : 'FAIL ') + k.padEnd(18) + '"' + badVal + '"' +
    (hit ? '  -> namarkahan' : '  -> HINDI namarkahan'));
});

console.log('\nTrade Tags — kada tag, hindi buong string:');
const mixed = API._journalInvalidFields({ ...clean,
  unfollowed_rules:'FOMO Entry, Old Renamed Rule, Moved Stop Loss', chart_pattern:'', confluence_answers:null });
const mixedTags = mixed.filter(b => b.key === 'unfollowed_rules');
check('isang tag lang ang mali', mixedTags.length, 1);
check('at iyon ang luma', mixedTags[0].value, 'Old Renamed Rule');
// Ang `clean` ay may rules_followed:'Yes' pero may FOMO Entry — bagong check
// 'yon, at tama siyang pumutok dito.
// Tinanggal na ang tsek sa Rules Followed?: sa kanya ang field, at hindi
// kayang ipagkaiba ng journal ang sinadyang sagot sa lumang halaga.
check('walang babala sa Rules Followed?',
  mixed.some(b => b.key === 'rules_followed'), false);

console.log('\nChart Pattern — ayon sa setup:');
check('bullish sa Long, ok', names(API._journalInvalidFields({ ...clean, confluence_answers:null })), '');
const wrongPat = API._journalInvalidFields({ ...clean, chart_pattern:'Double Top', confluence_answers:null });
check('bearish sa Long, mali', wrongPat.some(b => b.key === 'chart_pattern'), true);

console.log('\nConfluence — isang entry, hindi isa kada tanong:');
const seqIdx = CS['Long|15 mins HL'].items.findIndex(it => it.select);
const stale = API._journalInvalidFields({ ...clean, chart_pattern:'',
  confluence_answers: { 0:'3rd', [seqIdx]:'yes' } });
check('isang entry', stale.filter(b => b.key === 'confluence_answers').length, 1);
check('sinasabi ang bilang', /2 answers from a different checklist/.test(stale.find(b => b.key==='confluence_answers').value), true);

console.log('\nMaraming problema sa isang trade:');
const many = API._journalInvalidFields({ ...clean, win_loss:'Winner', aof_phase:'Phase 1',
  unfollowed_rules:'Ghost Rule', chart_pattern:'Double Top', confluence_answers:null });
console.log('   ' + names(many));
// Lima na: apat na maling halaga, kasama ang bagong tsek sa Rules Followed?
check('apat na naiulat', many.length, 4);
check('bawat isa ay ibang column', new Set(many.map(b => b.key)).size, 4);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
