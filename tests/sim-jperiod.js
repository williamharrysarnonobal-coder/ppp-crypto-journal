const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Year + Month on the journal toolbar, stacking with the chips.
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
  { position_id:'A', pattern_type:'15 mins HL', close_date: D(2025,10,5) },
  { position_id:'B', pattern_type:'5 mins HL',  close_date: D(2026,6,2)  },
  { position_id:'C', pattern_type:'15 mins HL', close_date: D(2026,7,17) },
  { position_id:'D', pattern_type:'15 mins HL', close_date: D(2026,7,19) },
  { position_id:'E', pattern_type:'5 mins HL',  close_date: D(2026,8,1)  },
  { position_id:'F', pattern_type:'5 mins HL',  close_date: null         },
];

const mkSel = () => {
  const o = { _v:'', options:[] };
  Object.defineProperty(o, 'innerHTML', { get(){return o._h||'';},
    set(v){ o._h = v; o.options = [...String(v).matchAll(/value="([^"]*)"/g)].map(m=>({value:m[1]})); } });
  Object.defineProperty(o, 'value', { get(){return o._v;}, set(v){o._v=v;} });
  return o;
};
const els = {
  // Blangko ang saklaw ng petsa: Year/Month ang sinusuri rito.
  journalDateFrom: { value: '' }, journalDateTo: { value: '' }, journalYearFilter: mkSel(), journalMonthFilter: mkSel(), journalSearch:{value:''} };

const api = new Function('document','RAW_TRADES', `
  let JOURNAL_BLANK_FILTER = null, JOURNAL_INCOMPLETE_ONLY = false, JOURNAL_INVALID_ONLY = false;
  const _journalInvalidFields = () => [];
  let JOURNAL_ACTIVE_FILTERS = [];
  const _journalMissingFields = () => [];
  // Tunay lamang — tingnan ang _realRawTrades sa dashboard.js.
  const _rowVal = (r, k) => r[k];
  ${fnBody('_realRawTrades')}
  ${/const MONTH_NAMES = \[[^\]]*\];/.exec(js)[0]}
  ${/const JOURNAL_MULTI_KEYS = new Set\(\[[^\]]*\]\);/.exec(js)[0]}
  ${fnBody('_journalTradeYears')}
  ${fnBody('populateJournalPeriodFilters')}
  ${fnBody('_renderJournalMonthOptions')}
  ${fnBody('_journalRowDate')}
  ${fnBody('_journalDateRange')}
  ${fnBody('getFilteredJournalRows')}
  return {
    populate: populateJournalPeriodFilters,
    months: _renderJournalMonthOptions,
    chip: (k,v) => { JOURNAL_ACTIVE_FILTERS = [{key:k, value:v}]; },
    noChips: () => { JOURNAL_ACTIVE_FILTERS = []; },
    rows: getFilteredJournalRows
  };
`)({ getElementById: id => els[id] || null }, RAW_TRADES);

const ids = () => api.rows().map(t => t.position_id).join(',') || '(none)';
const opts = el => el.options.map(o => o.value).join(',');

api.populate();
console.log('trades: A=Nov2025 B=Jul2026 C,D=Aug2026 E=Sep2026 F=no close date\n');
console.log('=== on load');
console.log('   years  : ' + opts(els.journalYearFilter));
console.log('   months : ' + opts(els.journalMonthFilter));
console.log('   showing: ' + ids() + '   (everything, F included)');

const t = (label, expect) => {
  const got = ids();
  console.log('   ' + label.padEnd(38) + got.padEnd(10) + (got === expect ? 'ok' : 'FAIL want ' + expect));
};

console.log('\n=== year only');
els.journalYearFilter.value = '2026'; api.months();
t('Year 2026', 'E,D,C,B');

console.log('\n=== months follow the year');
console.log('   months for 2026 : ' + opts(els.journalMonthFilter));
els.journalYearFilter.value = '2025'; api.months();
console.log('   months for 2025 : ' + opts(els.journalMonthFilter));

console.log('\n=== year + month');
els.journalYearFilter.value = '2026'; api.months();
els.journalMonthFilter.value = '7';
t('August 2026', 'D,C');

console.log('\n=== stacks with a chip');
api.chip('pattern_type', '15 mins HL');
t('August 2026 + Pattern 15 mins HL', 'D,C');
api.chip('pattern_type', '5 mins HL');
t('August 2026 + Pattern 5 mins HL', '(none)');

console.log('\n=== a trade with no close date is excluded from any period');
api.noChips();
els.journalMonthFilter.value = 'all';
t('Year 2026, all months', 'E,D,C,B');
els.journalYearFilter.value = 'all'; api.months(); els.journalMonthFilter.value = 'all';
// Expected strings are in CLOSE-DATE DESCENDING order, which is how
// getFilteredJournalRows sorts: E(Sep) D(Aug19) C(Aug17) B(Jul) A(Nov25),
// then anything without a close date.
t('All years, all months', 'E,D,C,B,A,F');
