const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Run the real _journalMissingFields against rows with known gaps.
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

const required = /const JOURNAL_REQUIRED_KEYS = \[[\s\S]*?\];/.exec(js)[0];
const keys = [...required.matchAll(/'(\w+)'/g)].map(m => m[1]);

// Ang totoong predicate, hindi stub — dito nakasalalay ang Post-BE Result.
// Hiwa hanggang sa unang ";", hindi regex na may \n: \r\n ang linya ng Windows.
const _pbeStart = js.indexOf('const _postBEApplies');
const postBEApplies = js.slice(_pbeStart, js.indexOf(';', _pbeStart) + 1);
// _journalMissingFields ay gumagamit na ng _isBlankish para mabilang ang mga
// placeholder ('Unspecified', '—') na isinusulat ng normalizeTrade.
const _bi = js.indexOf('const _isBlankish');
const blankish = js.slice(_bi, js.indexOf('};', _bi) + 2);

const api = new Function(`
  ${required}
  ${postBEApplies}
  const ALL_DRAWER_FIELDS = ${JSON.stringify(
    [...keys, 'unfollowed_rules', 'post_be_result', 'post_cutloss_result']
      .map(k => ({ key: k, label: k.replace(/_/g, ' ') })))};
  let DRAWER_FIELDS = ALL_DRAWER_FIELDS;
  ${blankish}
  ${fnBody('_journalMissingFields')}
  return {
    check: _journalMissingFields,
    hide: (k) => { DRAWER_FIELDS = ALL_DRAWER_FIELDS.filter(f => f.key !== k); },
    all: () => { DRAWER_FIELDS = ALL_DRAWER_FIELDS; }
  };
`)();

const full = Object.fromEntries(keys.map(k => [k, 'x']));

const cases = [
  ['complete trade', { ...full, rules_followed: 'Yes' }],
  ['no setup, no AOF phase', { ...full, rules_followed: 'Yes', trade_setup: '', aof_phase: null }],
  ['rules broken but no reason given', { ...full, rules_followed: 'No', unfollowed_rules: '' }],
  ['rules broken, reason given', { ...full, rules_followed: 'No', unfollowed_rules: 'Moved Stop Loss' }],
  ['rules FOLLOWED, reason blank (normal)', { ...full, rules_followed: 'Yes', unfollowed_rules: '' }],
  ['whitespace counts as blank', { ...full, rules_followed: 'Yes', session: '   ' }],
  ['notes/link blank (should NOT warn)', { ...full, rules_followed: 'Yes', notes: '', link: '' }],
];

console.log('required fields: ' + keys.join(', ') + '\n');
cases.forEach(([label, row]) => {
  const m = api.check(row);
  console.log('   ' + label.padEnd(40) + (m.length ? m.length + ' missing: ' + m.join(', ') : 'complete'));
});

console.log('\n=== respects the form config');
api.hide('aof_phase');
const hidden = api.check({ ...full, rules_followed: 'Yes', aof_phase: '' });
console.log('   aof_phase blank but hidden in the form : ' + (hidden.length ? 'still warns  FAIL' : 'no warning  OK'));
api.all();
const shown = api.check({ ...full, rules_followed: 'Yes', aof_phase: '' });
console.log('   aof_phase blank and visible            : ' + (shown.length ? 'warns  OK' : 'silent  FAIL'));
