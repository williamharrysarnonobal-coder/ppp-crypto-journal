const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Year + Month filter: does it pick the right trades, and does the month list
// follow the chosen year?
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

const D = (y, m, d) => new Date(y, m, d);
const ALL_TRADES = [
  { position_id:'A', account:'5K',  close_date: D(2025, 10, 5) },
  { position_id:'B', account:'10K', close_date: D(2026, 6, 2) },
  { position_id:'C', account:'5K',  close_date: D(2026, 7, 17) },
  { position_id:'D', account:'50K', close_date: D(2026, 7, 19) },
  { position_id:'E', account:'5K',  close_date: D(2026, 8, 1) },
  { position_id:'F', account:'5K',  close_date: null },
];

const els = {
  // A freshly parsed <select> with no <option> children has value '' — not
  // 'all'. Starting the mock at 'all' hid what the first load actually does.
  yearFilter:  { value:'', innerHTML:'', options:[] },
  monthFilter: { value:'', innerHTML:'', options:[] },
  accountFilter:{ value:'all' },
  tradeCountLabel: { textContent:'' }
};
// Parse the option values back out of the innerHTML the code writes.
const refreshOptions = (el) => {
  el.options = [...String(el.innerHTML).matchAll(/value="([^"]*)"/g)].map(m => ({ value:m[1] }));
};
Object.values(els).forEach(e => {
  if (!('innerHTML' in e)) return;
  let raw = '';
  Object.defineProperty(e, 'innerHTML', {
    get: () => raw,
    set: (v) => { raw = v; refreshOptions(e); }
  });
});

const noop = () => {};
const api = new Function('document', 'ALL_TRADES', `
  let FILTERED = [];
  ${/const MONTH_NAMES = \[[^\]]*\];/.exec(js)[0]}
  ${fnBody('populateDashPeriodFilters')}
  ${fnBody('_renderDashMonthOptions')}
  ${fnBody('onDashYearChange').replace('applyFilters();', '')}
  function applyFilters(){
    const year = document.getElementById('yearFilter')?.value ?? 'all';
    const month = document.getElementById('monthFilter')?.value ?? 'all';
    const acct = document.getElementById('accountFilter').value;
    FILTERED = ALL_TRADES.filter(t => {
      if(acct !== 'all' && t.account !== acct) return false;
      if(year === 'all' && month === 'all') return true;
      if(!t.close_date) return false;
      if(year !== 'all' && t.close_date.getFullYear() !== Number(year)) return false;
      if(month !== 'all' && t.close_date.getMonth() !== Number(month)) return false;
      return true;
    });
    return FILTERED;
  }
  return { populate: populateDashPeriodFilters, months: _renderDashMonthOptions, apply: applyFilters };
`)({ getElementById: id => els[id] }, ALL_TRADES);

const ids = arr => arr.map(t => t.position_id).join(',') || '(none)';
const opts = el => el.options.map(o => o.value).join(',');

console.log('trades: A=Nov2025  B=Jul2026  C=Aug2026  D=Aug2026  E=Sep2026  F=no close date\n');

api.populate();
console.log('=== on load');
console.log('   year options  : ' + opts(els.yearFilter));
console.log('   year selected : ' + els.yearFilter.value + '   (current year if present)');
console.log('   month options : ' + opts(els.monthFilter));
console.log('   showing       : ' + ids(api.apply()));

console.log('\n=== pick August 2026');
els.monthFilter.value = '7';
console.log('   showing : ' + ids(api.apply()) + '   (expect C,D)');

console.log('\n=== switch year to 2025 — month list must follow');
els.yearFilter.value = '2025';
api.months();
// All twelve months are always listed now, so the chosen month survives a year
// change: August 2026 -> August 2025, which is empty. Deliberate — the month
// label carries a "·" when it has no trades, and the calendar shows the same
// empty month rather than drifting to a different one.
console.log('   month options : ' + opts(els.monthFilter) + '   (all twelve, always)');
console.log('   month kept    : ' + els.monthFilter.value + '   (August, now in 2025)');
console.log('   showing       : ' + ids(api.apply()) + '   (empty — 2025 has no August trades)');
els.monthFilter.value = '10';
console.log('   pick November : ' + ids(api.apply()) + '   (expect A)');

console.log('\n=== All years + All months');
els.yearFilter.value = 'all'; api.months(); els.monthFilter.value = 'all';
console.log('   showing : ' + ids(api.apply()) + '   (expect everything, F included)');

console.log('\n=== a month with no close date is excluded, not silently kept');
els.yearFilter.value = '2026'; api.months(); els.monthFilter.value = '7';
const got = api.apply();
console.log('   showing : ' + ids(got) + '   F present? ' + (got.some(t => t.position_id === 'F') ? 'YES <-- wrong' : 'no  ok'));

console.log('\n=== account filter still stacks');
els.monthFilter.value = 'all'; els.accountFilter.value = '5K';
console.log('   2026 + 5K : ' + ids(api.apply()) + '   (expect C,E)');
