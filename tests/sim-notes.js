const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// A note added with "Add Note" goes into notes_log. Everything that shows
// "the notes" must read both places.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name) {
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const api = new Function(`
  const fmtMoney = (n) => '$' + n;
  const computeObjective = () => 'Intraday';
  const computeDuration = () => '4 hours';
  ${fnBody('_allNotesText')}
  ${fnBody('computeTradeSummary')}
  ${fnBody('computeTradeSummaryPlain')}
  return { notes:_allNotesText, summary:computeTradeSummary, plain:computeTradeSummaryPlain };
`)();

const cases = [
  ['nothing at all', {}],
  ['only the plain notes field', { notes: 'Galing sa Easy Add.' }],
  ['only an added note (the bug)', { notes_log: [{ ts: '2026-08-19T04:12:00Z', text: 'Dagdag ko ito after.' }] }],
  ['both', { notes: 'Galing sa Easy Add.', notes_log: [{ ts: '2026-08-19T04:12:00Z', text: 'Dagdag ko ito after.' }] }],
  ['two added notes', { notes_log: [
    { ts: '2026-08-19T04:12:00Z', text: 'Una.' },
    { ts: '2026-08-19T05:30:00Z', text: 'Pangalawa.' }] }],
];

console.log('=== Notes block');
cases.forEach(([l, row]) => {
  const out = api.notes(row).replace(/<br>/g, ' | ');
  console.log('   ' + l.padEnd(30) + out);
});

console.log('\n=== does it reach Trade Summary?');
const withLog = { symbol: 'BTC/USD', notes_log: [{ ts: '2026-08-19T04:12:00Z', text: 'Dagdag ko ito after.' }] };
const inSummary = api.summary(withLog).includes('Dagdag ko ito after.');
const inCopy = api.plain(withLog).includes('Dagdag ko ito after.');
console.log('   summary contains the added note : ' + (inSummary ? 'yes  OK' : 'NO  FAIL'));
console.log('   copy button text contains it    : ' + (inCopy ? 'yes  OK' : 'NO  FAIL'));

const noneCase = api.notes({}) === '—';
console.log('\n' + (inSummary && inCopy && noneCase ? 'ALL CHECKS PASSED' : 'SOMETHING FAILED'));
