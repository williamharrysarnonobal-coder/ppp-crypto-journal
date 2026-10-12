const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Reproduce the "my edit comes back" bug and prove the guard fixes it.
// Runs the REAL _detectMovedStop / _applyMovedStopFlags.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(marker){
  const i = js.indexOf(marker);
  if (i < 0) throw new Error('missing: ' + marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function constLine(name){
  const i = js.indexOf('const ' + name + ' =');
  return js.slice(i, js.indexOf('\n', i));
}
function arrowConst(name){
  const i = js.indexOf('const ' + name + ' =');
  return js.slice(i, js.indexOf('\n', js.indexOf(';', i)));
}
function blockConst(name){
  const i = js.indexOf('const ' + name + ' =');
  return js.slice(i, js.indexOf('};', i) + 2);
}
function arrBlock(name){
  const i = js.indexOf('const ' + name + ' =');
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j + 1) + ';'; }
  }
}

const API = new Function(`
  ${constLine('MOVED_STOP_TOLERANCE')}
  ${constLine('MOVED_STOP_FLOOR_PCT')}
  ${require('./tag-core').SRC}
  ${grab('function _detectMovedStop(')}
  ${grab('function _applyMovedStopFlags(')}
  return { _detectMovedStop, _applyMovedStopFlags };
`)();

// A LONG whose close sits below its stop — the shape that trips the detector.
const base = { entry_price: 64447.7, sl_price: 64100, close_price: 63700,
               win_loss: 'Loss', exit_type: 'SL Hit' };

console.log('Halimbawang trade (Long, sara sa ilalim ng stop):');
console.log('   entry 64,447.7   stop 64,100   sara 63,700');
console.log('   natukoy na inilipat ang stop: ' + API._detectMovedStop(base));

// --- the bug: every save re-applies -------------------------------------
console.log('\nDATING ASAL — walang bantay, tumatakbo sa bawat save');
let row = { ...base, unfollowed_rules: 'Moved Stop Loss, Changing Plan', rules_followed: 'No' };
console.log('  1. binuksan mo, tinanggal ang mga tag, pinili ang Early TP');
row.unfollowed_rules = 'Early TP';
row.rules_followed = 'No';
console.log('     bago i-save : ' + row.unfollowed_rules);
API._applyMovedStopFlags(row);            // what the old code did on save
console.log('     matapos     : ' + row.unfollowed_rules);
console.log('     rules_followed: ' + row.rules_followed);
const bugged = row.unfollowed_rules.includes('Moved Stop Loss');
console.log('     ' + (bugged ? 'BUG — bumalik ang tag na tinanggal mo' : 'hindi naulit'));

console.log('\n  2. sinubukan mong markahan itong malinis');
let row2 = { ...base, unfollowed_rules: 'Rules Followed', rules_followed: 'Yes' };
API._applyMovedStopFlags(row2);
console.log('     naging      : ' + row2.unfollowed_rules);
console.log('     rules_followed: ' + row2.rules_followed + '   (bumalik sa No)');

// --- the fix: create only ------------------------------------------------
console.log('\nBAGONG ASAL — tumatakbo lang kapag drawerMode === "create"');
function collect(patch, drawerMode){
  if(drawerMode === 'create') API._applyMovedStopFlags(patch);
  return patch;
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(46) + got + (ok ? '' : '   <-- ' + want));
};

const edited = collect({ ...base, unfollowed_rules:'Early TP', rules_followed:'No' }, 'view');
check('nanatili ang edit mo', edited.unfollowed_rules, 'Early TP');
check('hindi ginalaw ang rules_followed', edited.rules_followed, 'No');

const cleaned = collect({ ...base, unfollowed_rules:'Rules Followed', rules_followed:'Yes' }, 'view');
check('nanatili ang Rules Followed', cleaned.unfollowed_rules, 'Rules Followed');
check('nanatiling Yes', cleaned.rules_followed, 'Yes');

const created = collect({ ...base, unfollowed_rules:'', rules_followed:null }, 'create');
// Hindi na kasama ang 'Changing Plan': parehong grupo sila ('Do not touch an
// open trade'), kaya dalawang beses na nasisira ang IISANG rule sa bawat
// na-detect na moved stop. Manwal na lang ang 'Changing Plan'.
check('isang tag na lang, hindi doble', created.unfollowed_rules, 'Moved Stop Loss');
check('itinatakda pa rin ang No sa create', created.rules_followed, 'No');

// A normal trade must never be touched, in either mode.
const normal = { entry_price:64447.7, sl_price:64100, close_price:65400.9,
                 unfollowed_rules:'Rules Followed', rules_followed:'Yes' };
check('hindi natutukoy ang normal na trade', API._detectMovedStop(normal), false);
const normalSaved = collect({ ...normal }, 'create');
check('hindi ginagalaw ang normal na trade', normalSaved.unfollowed_rules, 'Rules Followed');

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail || !bugged ? 1 : 0);
