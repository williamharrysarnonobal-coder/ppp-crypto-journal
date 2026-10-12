const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Every reason _autoUnfollowedRules can produce must exist as a real option,
// or it ticks nothing. This catches the dead flag and any future one.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function grab(marker){
  const i = js.indexOf(marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const OPTIONS = new Function(arrBlock('UNFOLLOWED_RULES_OPTIONS') + ' return UNFOLLOWED_RULES_OPTIONS;')();

// Every string the auto-rule adds, read straight out of the function body.
const body = grab('function _autoUnfollowedRules(');
const added = [...body.matchAll(/reasons\.add\('([^']+)'\)/g)].map(m => m[1]);
const unique = [...new Set(added)];

console.log('Mga dahilan na kayang idagdag ng auto-rule: ' + unique.length);
let fail = 0;
unique.forEach(r => {
  const exists = OPTIONS.some(o => o === r);
  if (!exists) fail++;
  console.log('  ' + (exists ? '[x] ' : 'PATAY ') + r);
});

console.log('\nKabuuang options: ' + OPTIONS.length);
const be = OPTIONS.includes("Would Have BE'd Out");
console.log('  ' + (be ? 'ok  ' : 'FAIL') + '  nandoon pa rin ang Would Have BE\'d Out');
if (!be) fail++;
const htf = OPTIONS.includes('Against Daily Bias / HTF Bias');
console.log('  ' + (htf ? 'ok  ' : 'FAIL') + '  naidagdag na ang Against Daily Bias / HTF Bias');
if (!htf) fail++;

// Duplicates would show twice in the checklist.
const dupes = OPTIONS.filter((o,i) => OPTIONS.indexOf(o) !== i);
console.log('  ' + (dupes.length ? 'FAIL  may dobble: ' + dupes.join(', ') : 'ok    walang dobble'));
if (dupes.length) fail++;

console.log('\n' + (fail ? fail + ' FAIL' : 'walang patay na flag'));
process.exit(fail ? 1 : 0);
