const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG CREATION PLAY AT ANG CREATION PHASE.

   Ang Play ay galing sa DIREKSYON — Long -> Bounce, Short -> Rejection. Tama
   iyon para sa walong naunang setup, at mali para sa Creation: ang pagbuo ng
   isang antas ay hindi pagtalbog dito at hindi rin pagtanggi rito, long man o
   short. Ang pattern ang mas tiyak na pahayag sa dalawa, kaya ito ang nananaig.

   Dalawang daan ang dinadaanan nito at pareho silang kailangang sumang-ayon:
   ang cascade ng drawer, at ang bulk run kung saan hindi tumatakbo ang cascade
   na iyon. Doon eksaktong nawala ang leverage dati. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function constBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*([\\[{])').exec(js);
  if (!m) throw new Error('nawawala ang ' + name);
  const open = m[1], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };

const maps = new Function(
  constBlock('CREATION_PATTERNS') +
  constBlock('PATTERN_FIXED_AOF') +
  "CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_AOF[p] = 'Creation'; });" +
  constBlock('PATTERN_FIXED_SETUP') +
  "CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_SETUP[p] = 'Creation Play'; });" +
  constBlock('FIELD_OPTIONS') +
  ' return { CREATION_PATTERNS, PATTERN_FIXED_AOF, PATTERN_FIXED_SETUP, FIELD_OPTIONS };')();

console.log('1. NASA LISTAHAN BA ANG BAGONG PAGPIPILIAN?\n');
ok('may "Creation Play" sa Trade Setup',
   maps.FIELD_OPTIONS.trade_setup.includes('Creation Play'),
   maps.FIELD_OPTIONS.trade_setup.join(', '));
ok('may "Creation" sa AOF Phase',
   maps.FIELD_OPTIONS.aof_phase.includes('Creation'),
   maps.FIELD_OPTIONS.aof_phase.join(', '));
ok('hindi nasira ang mga dati',
   ['Bounce Play','Rejection Play','Invalidation Play']
     .every(v => maps.FIELD_OPTIONS.trade_setup.includes(v)));

console.log('\n2. NAKAKABIT BA ANG ANIM NA PATTERN?\n');
ok('anim ang CREATION_PATTERNS', maps.CREATION_PATTERNS.length === 6,
   maps.CREATION_PATTERNS.length + '');
maps.CREATION_PATTERNS.forEach(p => {
  ok('"' + p + '" -> Creation Play + Creation',
     maps.PATTERN_FIXED_SETUP[p] === 'Creation Play' &&
     maps.PATTERN_FIXED_AOF[p] === 'Creation');
  ok('  ...at nasa listahan ng pattern_type',
     maps.FIELD_OPTIONS.pattern_type.includes(p));
});

console.log('\n3. WALANG IBANG PATTERN ANG NAAAPEKTUHAN\n');
const others = maps.FIELD_OPTIONS.pattern_type.filter(p => !maps.CREATION_PATTERNS.includes(p));
ok('walang ibang nakukuhanan ng Creation Play',
   others.every(p => !maps.PATTERN_FIXED_SETUP[p]),
   others.filter(p => maps.PATTERN_FIXED_SETUP[p]).join(', ') || 'wala');
ok('ang 5 mins ay 5 mins Scalping pa rin',
   maps.PATTERN_FIXED_AOF['5 mins HL'] === '5 mins Scalping');
ok('ang 1 hour HL ay walang naka-fix na AOF',
   !maps.PATTERN_FIXED_AOF['1 hour HL'], maps.PATTERN_FIXED_AOF['1 hour HL'] || 'blangko');

console.log('\n4. ANG CASCADE NG DRAWER\n');
/* Ang _setDrawerField ay bumabalik agad kapag walang halaga, kaya ang ibang
   pattern ay hindi dapat magalaw kahit tumatakbo ang parehong function. */
const fields = {};
const doc = { querySelector: sel => {
  const k = (/data-field="([^"]+)"/.exec(sel) || [, null])[1];
  if(!k) return null;
  return { set value(v){ fields[k] = v; }, get value(){ return fields[k]; },
           dispatchEvent(){} };
} };
const sync = new Function('document', 'Event',
  constBlock('PATTERN_EXEC_TF') +
  constBlock('CREATION_PATTERNS') +
  constBlock('PATTERN_FIXED_AOF') +
  "CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_AOF[p] = 'Creation'; });" +
  constBlock('PATTERN_FIXED_SETUP') +
  "CREATION_PATTERNS.forEach(p => { PATTERN_FIXED_SETUP[p] = 'Creation Play'; });" +
  'const _execTfFor = p => PATTERN_EXEC_TF[p] || null;' +
  fnBody('_setDrawerField') + fnBody('syncExecutionFromPattern') +
  ' return syncExecutionFromPattern;')(doc, function Event(){});

const run = p => { for(const k in fields) delete fields[k]; sync(p); return { ...fields }; };

let r = run('4H HL Creation');
console.log('   4H HL Creation -> ' + JSON.stringify(r));
ok('napupunan ang Trade Setup', r.trade_setup === 'Creation Play', r.trade_setup || 'blangko');
ok('napupunan ang AOF Phase', r.aof_phase === 'Creation', r.aof_phase || 'blangko');
ok('blangko ang exec TF (dalawa ang tama)', !r.execution_tf, r.execution_tf || 'blangko');

r = run('5 mins HL');
console.log('   5 mins HL      -> ' + JSON.stringify(r));
ok('hindi nadadamay ang 5 mins HL', !r.trade_setup, r.trade_setup || 'blangko');
ok('at may exec TF pa rin ito', r.execution_tf === '1 min', r.execution_tf || 'blangko');
ok('at 5 mins Scalping pa rin ang AOF', r.aof_phase === '5 mins Scalping', r.aof_phase);

console.log('\n5. ANG BULK RUN — walang cascade doon\n');
/* Ang pattern ay dapat unahin sa direksyon. Kung ang direksyon lang ang
   binasa, ang isang Long na Creation ay magiging "Bounce Play" — na siya
   mismong bagay na hindi ito. */
const bulk = fnBody('_bulkJournalRows');
ok('binabasa ang PATTERN_FIXED_SETUP sa bulk',
   /PATTERN_FIXED_SETUP\[patch\.pattern_type\]/.test(bulk));
const iPat = bulk.indexOf('PATTERN_FIXED_SETUP');
const iDir = bulk.indexOf('TRADE_TYPE_SETUP_MAP');
ok('nauuna ang pattern sa direksyon', iPat > -1 && iDir > -1 && iPat < iDir,
   'pattern@' + iPat + '  direksyon@' + iDir);
ok('hindi pinapatungan ang naunang sagot',
   /if\(!patch\.trade_setup && patch\.pattern_type\)/.test(bulk));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
