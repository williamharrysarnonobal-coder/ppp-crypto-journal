const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Chart pattern lists: swapped to match every other setup's convention, and
// a value saved under the OLD lists must stay visible so it can be corrected.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function constBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function grab(marker){
  const i = js.indexOf(marker);
  if (i < 0) throw new Error('missing: ' + marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const CS = new Function(constBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();
// Maraming pattern na ngayon ang isang trade, kaya ang _confluencePatternChoices
// ay tumatawag na ng _patternList — kailangan itong isama sa scope.
const choices = new Function(
  grab('function _patternList(') +
  grab('function _confluencePatternChoices(') + ' return _confluencePatternChoices;')();

const BULL = ['Double Bottom','Triple Bottom','Inverse H&S'];
const BEAR = ['Double Top','Triple Top','H&S'];
/* Ang FVG ay walang direksyon — pareho itong lumalabas sa itaas at sa ibaba,
   kaya nasa DALAWANG panig ito at hindi nito sinisira ang panuntunan sa ibaba:
   walang bearish na pangalan sa Long, walang bullish sa Short. */
// Ang tatlong FVG fill (#33) ay walang direksyon din, kaya nasa dalawang panig.
const NEUTRAL = ['FVG','FVG + Fib','FVG - Partial Fill','FVG - Half Fill','FVG - Full Fill',
                 'Fib .382','Fib .5','Fib .618','SnR Flip'];
const N = NEUTRAL.length;

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(46) + got + (ok ? '' : '   <-- ' + want));
};

/* Ang Creation ay sumusunod na rin sa parehong panuntunan. Reaction Area ang
   `patterns` nito noon — mali iyon: sa talahanayan niya, ang Reaction ay isang
   TANONG na may sariling select, at ang Chart Pattern ay hiwalay na hilera na
   may parehong listahan ng ibang setup. Wala nang natatangi rito. */
const isCreation = k => /Creation$/.test(k);

console.log('Bawat setup: bullish ba ang pattern sa Long, bearish sa Short?\n');
Object.keys(CS).forEach(key => {
  const [dir] = key.split('|');
  const pats = CS[key].patterns;
  const want = (dir === 'Long' ? BULL : BEAR).concat(NEUTRAL);
  const ok = String(pats) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + key.padEnd(34) + pats.join(', '));
});
/* Ang mahalagang panuntunan, sinusuri nang hiwalay: kahit anong idagdag pa sa
   listahan, hindi dapat makalusot ang isang bearish na pangalan sa isang Long
   na setup. Ito ang proteksyong madaling mawala kapag "inayos" ang assertion
   sa itaas sa pamamagitan ng pagluluwag nito. */
const wrongSide = Object.keys(CS).filter(key => {
  const [dir] = key.split('|');
  const forbidden = dir === 'Long' ? BEAR : BULL;
  return CS[key].patterns.some(p => forbidden.includes(p));
});
check('walang pattern na mali ang panig', wrongSide.join(', ') || 'wala', 'wala');
check('nasa lahat ang FVG',
  Object.keys(CS).filter(k => CS[k].patterns.includes('FVG')).length,
  Object.keys(CS).length);
check('buong NEUTRAL sa lahat',
  Object.keys(CS).filter(k => NEUTRAL.every(n => CS[k].patterns.includes(n))).length,
  Object.keys(CS).length);
/* Ang Reaction Area ay isang TANONG na ngayon, hindi ang listahan ng chart
   pattern. Kung babalik ito sa `patterns`, mawawala ang siyam na hugis at
   walang magsasabi nito. */
check('may Reaction na select ang bawat Creation',
  Object.keys(CS).filter(isCreation).every(k =>
    CS[k].items.some(it => it.tag === 'Reaction' && Array.isArray(it.select)
                        && it.select.length === 5 && it.allGood)), true);

console.log('\nAng dating naka-save na pattern ay nananatiling nakikita');
const longInval = CS['Long|30 mins Invalidation Play'];
const stored = 'Double Top';   // picked under the OLD, reversed list
console.log('  Long Invalidation, naka-save: "' + stored + '" (mula sa lumang listahan)');
const withStored = choices(longInval, stored);
console.log('  mga chip: None, ' + withStored.join(', '));
check('kasama pa rin ang lumang halaga', withStored.includes(stored), true);
check('nasa dulo ito, hindi nakahalo', withStored[withStored.length-1], stored);
check('bilang ng chip', withStored.length, BULL.length + N + 1);

console.log('\n  Matapos pumili ng tama:');
const afterFix = choices(longInval, 'Double Bottom');
console.log('  mga chip: None, ' + afterFix.join(', '));
check('nawala na ang lumang halaga', afterFix.includes(stored), false);
check('bumalik sa tama ang bilang', afterFix.length, BULL.length + N);

console.log('\n  Walang naka-save pa:');
check('walang dagdag kapag walang naka-save', choices(longInval, null).length, BULL.length + N);
check('hindi apektado ang normal na setup', choices(CS['Long|5 mins HL'], 'Double Bottom').length, BULL.length + N);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
