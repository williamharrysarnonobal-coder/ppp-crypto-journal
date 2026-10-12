const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Ang custom na saklaw ng petsa sa Trade Journals.

   Ang Year/Month at ang saklaw ay iisang axis — ang panahon. Kung pareho
   silang gagana, ang "Agosto" na may saklaw na Marso ay magbibigay ng walang
   laman na listahan nang walang paliwanag. Ang saklaw ang nananaig, at
   nililinis ng UI ang isa kapag hinawakan ang isa.

   Pinapatakbo nito ang TUNAY na getFilteredJournalRows at ang tunay na
   _journalDateRange — hindi isang kopya ng lohika. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + (x || '')); };

const D = (y, m, d) => new Date(y, m, d, 12, 0);
const RAW_TRADES = [
  { position_id:'A', close_date: D(2026, 7, 3)  },   // Ago 3
  { position_id:'B', close_date: D(2026, 7, 15) },   // Ago 15
  { position_id:'C', close_date: D(2026, 7, 31) },   // Ago 31
  { position_id:'D', close_date: D(2026, 8, 2)  },   // Set 2
  { position_id:'E', close_date: D(2025, 10, 9) },   // Nob 2025
  // Bukas pa: walang close date, ang open date lang ang mayroon.
  { position_id:'F', close_date: null, open_date: D(2026, 7, 20) },
];

const els = {
  journalSearch: { value: '' },
  journalYearFilter: { value: 'all' },
  journalMonthFilter: { value: 'all' },
  journalDateFrom: { value: '' },
  journalDateTo: { value: '' },
};

const api = new Function('document', 'RAW_TRADES', `
  let JOURNAL_BLANK_FILTER = null, JOURNAL_INCOMPLETE_ONLY = false, JOURNAL_INVALID_ONLY = false;
  const _journalInvalidFields = () => [];
  let JOURNAL_ACTIVE_FILTERS = [];
  const _journalMissingFields = () => [];
  ${fnBody('_realRawTrades')}
  ${/const JOURNAL_MULTI_KEYS = new Set\(\[[^\]]*\]\);/.exec(js)[0]}
  ${fnBody('_journalRowDate')}
  ${fnBody('_journalDateRange')}
  ${fnBody('getFilteredJournalRows')}
  return { rows: getFilteredJournalRows, range: _journalDateRange };
`)({ getElementById: id => els[id] || null }, RAW_TRADES);

const ids = () => api.rows().map(t => t.position_id).sort().join(',') || '(wala)';
const set = (f, t) => { els.journalDateFrom.value = f; els.journalDateTo.value = t; };

console.log('A=Ago3  B=Ago15  C=Ago31  D=Set2  E=Nob2025  F=bukas pa (open Ago20)\n');

console.log('1. WALANG SAKLAW\n');
ok('lahat lumalabas', ids() === 'A,B,C,D,E,F', ids());

console.log('\n2. DALAWANG PANIG\n');
set('2026-08-01', '2026-08-31');
ok('buong Agosto', ids() === 'A,B,C,F', ids());
set('2026-08-15', '2026-08-31');
ok('Ago 15–31, kasama ang Ago 15', ids() === 'B,C,F', ids());
set('2026-08-03', '2026-08-03');
ok('iisang araw', ids() === 'A', ids());

console.log('\n3. HANGGANAN — kasama ang dalawang dulo\n');
set('2026-08-31', '2026-08-31');
ok('ang huling araw ay kasama', ids() === 'C', ids());
set('2026-08-01', '2026-08-03');
ok('ang unang araw ay kasama', ids() === 'A', ids());

console.log('\n4. ISANG PANIG LAMANG\n');
// Kasama ang F: bukas pa ito, at ang petsa ng pagpasok nito ay Ago 20.
set('2026-08-16', '');
ok('"mula noon" — walang katapusan', ids() === 'C,D,F', ids());
set('', '2026-08-03');
ok('"hanggang" — walang simula', ids() === 'A,E', ids());

console.log('\n5. BALIGTAD ANG PAGKAKALAGAY\n');
set('2026-08-31', '2026-08-01');
ok('inaayos, hindi nagpapakita ng wala', ids() === 'A,B,C,F', ids());

console.log('\n6. ANG BUKAS PANG TRADE\n');
set('2026-08-19', '2026-08-21');
ok('nakikita sa petsa ng pagpasok', ids() === 'F', ids());
/* Ang Year/Month ay itinatapon ang hilerang walang close date. Hindi ko
   binabago ang lumang gawi, pero hindi rin ako gagawa ng bago na may
   parehong butas — ang trade na bukas pa ay may petsa pa rin. */
set('', '');
els.journalYearFilter.value = '2026'; els.journalMonthFilter.value = '7';
ok('Year/Month: itinatapon ang bukas pa', ids() === 'A,B,C', ids());

console.log('\n7. HINDI SILA MAGKASABAY — ang saklaw ang nananaig\n');
set('2026-09-01', '2026-09-30');
ok('Setyembre kahit naka-Agosto ang Month', ids() === 'D', ids());
els.journalYearFilter.value = 'all'; els.journalMonthFilter.value = 'all';

console.log('\n8. WALANG LAMAN NA SAGOT, HINDI PAGBAGSAK\n');
set('2030-01-01', '2030-12-31');
ok('walang trade sa 2030', ids() === '(wala)', ids());
/* Hindi makakagawa ng basura ang <input type="date">, pero ang gawi ay dapat
   nakatakda at hindi aksidente: ang hindi mabasa ay parang walang saklaw,
   hindi isang filter na tahimik na pumapayag sa lahat. */
set('mali', '');
ok('basurang petsa = walang saklaw', api.range() === null, String(api.range()));
ok('at lahat lumalabas', ids() === 'A,B,C,D,E,F', ids());

console.log('\n9. ANG SAKLAW MISMO\n');
set('', '');
ok('null kapag walang laman ang dalawa', api.range() === null, String(api.range()));
set('2026-08-01', '');
ok('object kapag may isa', !!api.range());
// Lokal na hatinggabi, hindi UTC — isang araw ang pagkakaiba sa UTC+4.
set('2026-08-05', '2026-08-05');
const r = api.range();
ok('lokal na simula ng araw', r.from.getHours() === 0 && r.from.getDate() === 5,
   r.from.toString().slice(0, 24));
ok('lokal na katapusan ng araw', r.to.getHours() === 23 && r.to.getDate() === 5,
   r.to.toString().slice(0, 24));

console.log('\n10. NAKA-WIRE BA SA UI?\n');
ok('may kahon sa dashboard.html',
   /id="journalDateFrom"/.test(fs.readFileSync(ROOT + '/dashboard.html', 'utf8')) &&
   /id="journalDateTo"/.test(fs.readFileSync(ROOT + '/dashboard.html', 'utf8')));
ok('nililinis ng taon ang saklaw',
   /function onJournalYearChange\(\)\{[\s\S]{0,400}?journalDateFrom/.test(js));
ok('nililinis ng Clear filters ang saklaw',
   /function clearJournalFilters\(\)\{[\s\S]{0,700}?journalDateFrom/.test(js));
ok('binibilang ang saklaw sa Clear button',
   /const period =[\s\S]{0,220}_journalDateRange\(\)/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
