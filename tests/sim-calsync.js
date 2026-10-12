const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Filter and calendar have to point at the same month, in both directions.
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

const D = (y, m, d) => new Date(y, m, d);
const ALL_TRADES = [
  { position_id:'A', account:'5K', close_date: D(2026, 6, 2) },   // Jul
  { position_id:'B', account:'5K', close_date: D(2026, 7, 17) },  // Aug
  { position_id:'C', account:'5K', close_date: D(2026, 7, 19) },  // Aug
  { position_id:'D', account:'5K', close_date: D(2026, 8, 1) },   // Sep
];

const mkSel = () => {
  const o = { _v: '', options: [] };
  Object.defineProperty(o, 'innerHTML', {
    get(){ return o._h || ''; },
    set(v){ o._h = v; o.options = [...String(v).matchAll(/value="([^"]*)"/g)].map(m => ({ value: m[1] })); }
  });
  Object.defineProperty(o, 'value', { get(){ return o._v; }, set(v){ o._v = v; } });
  return o;
};
const els = { yearFilter: mkSel(), monthFilter: mkSel(), accountFilter: { value:'all' },
              tradeCountLabel: { textContent:'' } };

const api = new Function('document', 'ALL_TRADES', `
  let FILTERED = [], calMonth = new Date(2026, 8, 1);   // calendar starts on September
  ${/const MONTH_NAMES = \[[^\]]*\];/.exec(js)[0]}
  ${fnBody('populateDashPeriodFilters')}
  ${fnBody('_renderDashMonthOptions')}
  const renderCalendar = () => {};
  function applyFilters(){
    const year = document.getElementById('yearFilter')?.value ?? 'all';
    const month = document.getElementById('monthFilter')?.value ?? 'all';
    const acct = document.getElementById('accountFilter').value;
    if(month !== 'all'){
      const yr = year !== 'all' ? Number(year) : calMonth.getFullYear();
      calMonth = new Date(yr, Number(month), 1);
    }else if(year !== 'all' && calMonth.getFullYear() !== Number(year)){
      calMonth = new Date(Number(year), calMonth.getMonth(), 1);
    }
    FILTERED = ALL_TRADES.filter(t => {
      if(acct !== 'all' && t.account !== acct) return false;
      if(year === 'all' && month === 'all') return true;
      if(!t.close_date) return false;
      if(year !== 'all' && t.close_date.getFullYear() !== Number(year)) return false;
      if(month !== 'all' && t.close_date.getMonth() !== Number(month)) return false;
      return true;
    });
  }
  ${fnBody('shiftMonth')}
  return {
    populate: populateDashPeriodFilters, apply: applyFilters, shift: shiftMonth,
    cal: () => calMonth.getFullYear() + '-' + String(calMonth.getMonth()+1).padStart(2,'0'),
    seen: () => FILTERED.map(t => t.position_id).join(',') || '(none)'
  };
`)({ getElementById: id => els[id] }, ALL_TRADES);

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const state = () => '   filter=' + (els.yearFilter.value + '/' +
  (els.monthFilter.value === 'all' ? 'All months' : MN[Number(els.monthFilter.value)])).padEnd(16) +
  'calendar=' + api.cal() + '   showing=' + api.seen();

api.populate();
console.log('calendar starts on 2026-09, filter defaults to the current year\n');
api.apply();
console.log('=== on load'); console.log(state());

console.log('\n=== pick August in the filter — calendar must follow');
els.monthFilter.value = '7'; api.apply();
console.log(state());
console.log('   ' + (api.cal() === '2026-08' ? 'PASS' : 'FAIL — calendar did not move'));

console.log('\n=== press the calendar arrow forward — filter must follow');
api.shift(1);
console.log(state());
console.log('   ' + (api.cal() === '2026-09' && els.monthFilter.value === '8' ? 'PASS — both on September' : 'FAIL'));

console.log('\n=== arrows skip months with no data (Sep -> back -> Aug -> back -> Jul)');
els.monthFilter.value = '8'; api.apply();       // September
api.shift(-1); console.log(state());
api.shift(-1); console.log(state());
const skipped = api.cal() === '2026-07' && els.monthFilter.value === '6';
console.log('   ' + (skipped ? 'PASS — landed on July, the previous month WITH trades' : 'FAIL'));

console.log('\n=== at the earliest month, the arrow does nothing');
const before2 = api.cal() + '/' + els.monthFilter.value;
api.shift(-1);
console.log(state());
console.log('   ' + (api.cal() + '/' + els.monthFilter.value === before2 ? 'PASS — held still' : 'FAIL — moved off the list'));

console.log('\n=== All months: arrows browse freely, nothing gets filtered away');
els.monthFilter.value = 'all'; api.apply();
const before = api.seen();
api.shift(1);
console.log(state());
console.log('   ' + (api.seen() === before ? 'PASS — trade list unchanged' : 'FAIL'));
