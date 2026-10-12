const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The count beside each value must be what you'd actually get if you picked
// it — so it has to ignore that chip while honouring every other filter.
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

const D = (y,m,d) => new Date(y,m,d);
const RAW_TRADES = [
  { position_id:'A', pattern_type:'15 mins HL', trade_type:'Long',  account:'50K', unfollowed_rules:'Moved Stop Loss', close_date:D(2026,7,1) },
  { position_id:'B', pattern_type:'15 mins HL', trade_type:'Long',  account:'5K',  unfollowed_rules:'Moved Stop Loss, Ignored Trend', close_date:D(2026,7,2) },
  { position_id:'C', pattern_type:'5 mins HL',  trade_type:'Long',  account:'50K', unfollowed_rules:'Ignored Trend', close_date:D(2026,7,3) },
  { position_id:'D', pattern_type:'5 mins HL',  trade_type:'Short', account:'50K', unfollowed_rules:'', close_date:D(2026,7,4) },
  { position_id:'E', pattern_type:'1 hour HL',  trade_type:'Short', account:'5K',  unfollowed_rules:'', close_date:D(2025,10,1) },
];

const els = {
  // Blangko ang saklaw ng petsa: Year/Month ang sinusuri rito.
  journalDateFrom: { value: '' }, journalDateTo: { value: '' }, journalSearch:{value:''}, journalYearFilter:{value:'all'}, journalMonthFilter:{value:'all'} };

const api = new Function('document','RAW_TRADES', `
  let JOURNAL_BLANK_FILTER = null, JOURNAL_INCOMPLETE_ONLY = false, JOURNAL_INVALID_ONLY = false;
  const _journalInvalidFields = () => [];
  let JOURNAL_ACTIVE_FILTERS = [];
  const _journalMissingFields = () => [];
  // Tunay lamang ang binabasa ng bawat listahan ng Trade Journals ngayon —
  // ang paper trade ay may sariling pahina.
  const _rowVal = (r, k) => r[k];
  ${fnBody('_realRawTrades')}
  ${/const JOURNAL_MULTI_KEYS = new Set\(\[[^\]]*\]\);/.exec(js)[0]}
  ${fnBody('_journalFilterValues')}
  ${fnBody('_journalRowDate')}
  ${fnBody('_journalDateRange')}
  ${fnBody('getFilteredJournalRows')}
  ${fnBody('_journalValueCounts')}
  return {
    counts: _journalValueCounts,
    set: (arr) => { JOURNAL_ACTIVE_FILTERS = arr; },
    rows: () => getFilteredJournalRows().map(r => r.position_id).join(',') || '(none)'
  };
`)({ getElementById: id => els[id] || null }, RAW_TRADES);

const show = (key) => {
  const { counts, total } = api.counts(key);
  console.log('      Any'.padEnd(28) + total);
  Object.keys(counts).sort().forEach(v => console.log('      ' + v.padEnd(22) + counts[v]));
};

console.log('trades: A,B=15m HL  C,D=5m HL  E=1h HL   |  A,B,C=Long  D,E=Short');
console.log('        A,C,D=50K   B,E=5K              |  A,B=Moved Stop Loss  B,C=Ignored Trend\n');

console.log('=== no other filters — Pattern Type list');
api.set([{key:'pattern_type', value:'all'}]);
show('pattern_type');

console.log('\n=== with Trade Type = Long already on');
api.set([{key:'trade_type', value:'Long'}, {key:'pattern_type', value:'all'}]);
console.log('   showing now: ' + api.rows());
console.log('   Pattern Type counts (should exclude D and E):');
show('pattern_type');

console.log('\n=== the chip being opened is ignored in its own counts');
api.set([{key:'trade_type', value:'Long'}, {key:'pattern_type', value:'5 mins HL'}]);
console.log('   showing now: ' + api.rows() + '   (Pattern pinned to 5 mins HL)');
console.log('   opening the Pattern list still offers the others:');
show('pattern_type');

console.log('\n=== a value with nothing behind it shows 0');
api.set([{key:'account', value:'5K'}, {key:'pattern_type', value:'all'}]);
console.log('   showing now: ' + api.rows());
show('pattern_type');
console.log('   ^ 5 mins HL is 0 — no 5-minute trades on the 5K account');

console.log('\n=== the comma-list field counts by membership');
api.set([{key:'unfollowed_rules', value:'all'}]);
show('unfollowed_rules');
console.log('   ^ B is counted under both rules it broke');
