const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The parser fills 12 columns. Some of the remaining 20 are DERIVED from the
// dates at read time — run the real compute* functions to see which.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name) {
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const f = new Function(`
  ${fnBody('computeObjective')}
  ${fnBody('computeDuration')}
  ${fnBody('computeSession')}
  ${js.slice(js.indexOf('const SESSION_WINDOWS'), js.indexOf('\n};', js.indexOf('const SESSION_WINDOWS')) + 3)}
  ${fnBody('_tzOffsetHours')}
  ${fnBody('_sessionUtcWindow')}
  ${fnBody('computeDayOfWeek')}
  return { computeObjective, computeDuration, computeSession, computeDayOfWeek };
`)();

const row = { open_date: '2026-08-19T15:53:30', close_date: '2026-08-19T18:17:07' };

console.log('Galing sa petsa lang, walang tinipa:\n');
console.log('   duration    : ' + f.computeDuration(row));
console.log('   objective   : ' + f.computeObjective(row) + '   (2.4 oras, wala pang 3)');
console.log('   day_of_week : ' + f.computeDayOfWeek(row));
console.log('   session     : ' + f.computeSession(row) + '   (bukas 15:53 lokal)');

console.log('\nBabala sa session/day: lokal na oras ng device ang gamit.');
const d = new Date(row.open_date);
console.log('   oras na nabasa dito: ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0'));
console.log('   TZ ng makinang ito : ' + Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('   Walang timezone sa string, kaya sinusundan nito ang device.');
console.log('   Sa ibang timezone, ibang session ang lalabas sa parehong trade.');
