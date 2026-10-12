const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Drive the REAL sync functions from dashboard.js through a stub drawer and
// check the cascade lands where it should. The change events matter here, so
// the stub has to actually dispatch them.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(startMarker) {
  const i = js.indexOf(startMarker);
  if (i < 0) throw new Error('missing: ' + startMarker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function constBlock(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*[\\{\\[]');
  const m = re.exec(js);
  if (!m) throw new Error('missing const: ' + name);
  const open = js[m.index + m[0].length - 1];
  const close = open === '{' ? '}' : ']';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

// ---- stub drawer -------------------------------------------------------
let FIELDS = {};
function makeSel(key) {
  return {
    get value(){ return FIELDS[key].v; },
    set value(x){ FIELDS[key].v = x; },
    set innerHTML(_){ /* option rebuild is irrelevant to the assertions */ },
    dispatchEvent(){
      const h = FIELDS[key].onchange;
      if (h) h(FIELDS[key].v);
      return true;
    }
  };
}
const document = {
  querySelector(sel){
    const m = /\[data-field="([^"]+)"\]/.exec(sel);
    if (!m || !FIELDS[m[1]]) return null;
    return makeSel(m[1]);
  }
};
function Event(){ }

const scope = {
  document, Event,
  FIELD_OPTIONS: { pattern_type: ['5 mins HL','15 mins HL','1 hour HL','30 mins Invalidation Play','4 Hour HL',
                                  '5 mins LH','15 mins LH','1 hour LH','4 Hour LH'] },
  SAVED_SETUPS: [], drawerJournalSetupId: null,
  CONFLUENCE_SETUPS: null,
};

const src = [
  constBlock('TRADE_SETUP_PATTERN_MAP'),
  grab('function syncPatternTypeFromSetup('),
  constBlock('PATTERN_EXEC_TF'),
  /* Ang anim na Creation ay may sariling AOF at sariling Play, at pareho silang
     pinupunan ng dalawang mapa na ito. Ang PATTERN_FIXED_AOF ay hindi na isang
     literal na object — pinupunan ito ng CREATION_PATTERNS pagkatapos ideklara,
     kaya kailangan ding kunin ang listahan at ang dalawang forEach. */
  constBlock('CREATION_PATTERNS'),
  constBlock('PATTERN_FIXED_AOF'),
  'CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_AOF[p] = \'Creation\'; });',
  constBlock('PATTERN_FIXED_SETUP'),
  'CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_SETUP[p] = \'Creation Play\'; });',
  'const _execTfFor = p => PATTERN_EXEC_TF[p] || null;',
  grab('function _setDrawerField('),
  grab('function syncExecutionFromPattern('),
  constBlock('TRADE_TYPE_SETUP_MAP'),
  grab('function syncTradeSetupFromType('),
  constBlock('SEQUENCE_AOF_MAP'),
  grab('function _aofFromSequence('),
  grab('function syncAofFromLinkedSetup('),
].join('\n\n');

// Real CONFLUENCE_SETUPS, pulled whole.
scope.CONFLUENCE_SETUPS = new Function(constBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();

const API = new Function(...Object.keys(scope), src + `
  return { syncTradeSetupFromType, syncPatternTypeFromSetup, syncExecutionFromPattern,
           syncAofFromLinkedSetup, _aofFromSequence, _execTfFor, TRADE_TYPE_SETUP_MAP,
           PATTERN_FIXED_AOF };
`)(...Object.values(scope));

// ---- harness -----------------------------------------------------------
function reset(initial){
  FIELDS = {};
  ['trade_type','trade_setup','pattern_type','execution_tf','aof_phase'].forEach(k => {
    FIELDS[k] = { v: (initial && initial[k]) || '', onchange: null };
  });
  FIELDS.trade_type.onchange  = v => API.syncTradeSetupFromType(v);
  FIELDS.trade_setup.onchange = v => API.syncPatternTypeFromSetup(v);
  FIELDS.pattern_type.onchange= v => API.syncExecutionFromPattern(v);
}

let pass = 0, fail = 0;
function scenario(name, initial, answers, expect){
  reset(initial);
  // openDrawer's create-mode order, verbatim.
  if (FIELDS.trade_type.v) API.syncTradeSetupFromType(FIELDS.trade_type.v);
  if (FIELDS.trade_setup.v) API.syncPatternTypeFromSetup(FIELDS.trade_setup.v);
  if (FIELDS.pattern_type.v) API.syncExecutionFromPattern(FIELDS.pattern_type.v);
  scope.SAVED_SETUPS.length = 0;
  if (answers) {
    scope.SAVED_SETUPS.push({ id: 'S1', confluence_answers: answers });
  }
  // syncAofFromLinkedSetup closes over drawerJournalSetupId/SAVED_SETUPS from
  // the constructed scope, so rebuild it with the right binding each time.
  const fn = new Function('document','Event','CONFLUENCE_SETUPS','SAVED_SETUPS','drawerJournalSetupId',
    constBlock('PATTERN_FIXED_AOF') + constBlock('SEQUENCE_AOF_MAP') +
    grab('function _setDrawerField(') + grab('function _aofFromSequence(') +
    grab('function syncAofFromLinkedSetup(') + ' return syncAofFromLinkedSetup;'
  )(document, Event, scope.CONFLUENCE_SETUPS, scope.SAVED_SETUPS, answers ? 'S1' : null);
  fn({});

  const got = {
    trade_setup: FIELDS.trade_setup.v, pattern_type: FIELDS.pattern_type.v,
    execution_tf: FIELDS.execution_tf.v, aof_phase: FIELDS.aof_phase.v
  };
  const bad = Object.keys(expect).filter(k => got[k] !== expect[k]);
  if (bad.length) { fail++; console.log('  FAIL  ' + name); }
  else { pass++; console.log('  ok    ' + name); }
  Object.keys(expect).forEach(k => {
    const mark = got[k] === expect[k] ? ' ' : '!';
    console.log('        ' + mark + ' ' + k.padEnd(13) + (got[k] || '(blangko)') +
      (got[k] === expect[k] ? '' : '   <-- inaasahan: ' + (expect[k] || '(blangko)')));
  });
}

console.log('DRAWER CASCADE\n');

scenario('Long + 15 mins HL + Sequence 1st',
  { trade_type:'Long', pattern_type:'15 mins HL' }, {3:'1st'},
  { trade_setup:'Bounce Play', pattern_type:'15 mins HL', execution_tf:'5 min', aof_phase:'IC' });

scenario('Short + 1 hour LH + Sequence 3rd',
  { trade_type:'Short', pattern_type:'1 hour LH' }, {4:'3rd'},
  { trade_setup:'Rejection Play', pattern_type:'1 hour LH', execution_tf:'15 min', aof_phase:'LM' });

scenario('Long + 15 mins HL + Sequence 4th',
  { trade_type:'Long', pattern_type:'15 mins HL' }, {3:'4th'},
  { trade_setup:'Bounce Play', execution_tf:'5 min', aof_phase:'Extended Movement' });

scenario('5 mins HL — Scalping manalo kahit may Sequence 1st',
  { trade_type:'Long', pattern_type:'5 mins HL' }, {5:'1st'},
  { trade_setup:'Bounce Play', execution_tf:'1 min', aof_phase:'5 mins Scalping' });

scenario('Invalidation Play na pinili — hindi papalitan ng Long',
  { trade_type:'Long', trade_setup:'Invalidation Play' }, null,
  { trade_setup:'Invalidation Play', pattern_type:'30 mins Invalidation Play',
    execution_tf:'', aof_phase:'Invalidation' });

scenario('4 Hour HL — walang execution_tf',
  { trade_type:'Long', pattern_type:'4 Hour HL' }, null,
  { trade_setup:'Bounce Play', execution_tf:'', aof_phase:'' });

scenario('Walang Sequence na sagot — aof blangko',
  { trade_type:'Long', pattern_type:'15 mins HL' }, {},
  { trade_setup:'Bounce Play', execution_tf:'5 min', aof_phase:'' });

console.log('\n--- index ay hinahanap sa tag, hindi hardcode ---');
[['Long','15 mins HL',3],['Long','1 hour HL',4],['Short','5 mins LH',5]].forEach(([tt,pt,idx]) => {
  const cfg = scope.CONFLUENCE_SETUPS[tt+'|'+pt];
  const found = cfg.items.findIndex(it => it.tag === 'Sequence');
  console.log('  ' + (tt+'|'+pt).padEnd(22) + 'Sequence sa index ' + found +
    (found === idx ? '   ok' : '   <-- ' + idx + ' ang inasahan'));
});
// Prove the lookup is position-correct: feed the answer at the WRONG index.
console.log('\n  maling index (3) sa 1 hour HL na nasa 4:');
console.log('    ' + (API._aofFromSequence('Long','1 hour HL',{3:'1st'}) || '(null — tama, walang binasa)'));
console.log('  tamang index (4):');
console.log('    ' + API._aofFromSequence('Long','1 hour HL',{4:'1st'}));

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat ng ' + pass + ' pumasa'));
process.exit(fail ? 1 : 0);
