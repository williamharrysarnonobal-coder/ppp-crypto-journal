const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG +FILTER NG PAPER TRADE JOURNAL.

   Parehong hugis ng Trade Journals, sariling estado. Ang paghahati ng isang
   listahan sa dalawang pahina ay nangangahulugang ang pagpili sa isa ay
   tahimik na sumasala sa isa pa — at magkaiba ang column nila: walang
   Profit/Loss ang paper, walang "Why you did not take it" ang tunay. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const html = fs.readFileSync(ROOT + '/dashboard.html', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };

const P = (id, extra) => ({ position_id:id, is_paper:true, symbol:'BTC', ...extra });
const RAW_TRADES = [
  P('P1', { trade_type:'Long',  pattern_type:'5 mins HL',
            no_trade_reason:'Already extended — missed the entry', paper_outcome:'Hit TP' }),
  P('P2', { trade_type:'Short', pattern_type:'5 mins LH',
            no_trade_reason:'Scared after a losing streak', paper_outcome:'Hit SL' }),
  P('P3', { trade_type:'Long',  pattern_type:'1 hour HL',
            no_trade_reason:'Already extended — missed the entry',
            paper_outcome:'Stopped out then hit TP, Hit TP' }),
  P('P4', { trade_type:'Long',  pattern_type:'5 mins HL',
            no_trade_reason:'Asleep or at work', paper_outcome:'Never filled' }),
  // Tunay — hindi dapat lumitaw kahit saan dito.
  { position_id:'R1', is_paper:false, symbol:'BTC', trade_type:'Long',
    pattern_type:'5 mins HL', profit_loss:100 },
];

const els = { paperSearch:{ value:'' } };
const api = new Function('document', 'RAW_TRADES', `
  let PAPER_ACTIVE_FILTERS = [];
  // Walang open_date ang mga row dito, kaya '' ang ibinabalik ng dalawa.
  const computeSession = r => '';
  const computeDayOfWeek = r => '';
  ${block => ''}
  ${/const PAPER_MULTI_KEYS = new Set\(\[[\s\S]*?\]\);/.exec(js)[0]}
  ${fnBody('_paperRawTrades')}
  ${fnBody('_paperFilterValues')}
  ${fnBody('getFilteredPaperRows')}
  ${fnBody('_paperValueCounts')}
  return {
    rows: () => getFilteredPaperRows().map(r => r.position_id).join(',') || '(wala)',
    values: _paperFilterValues,
    counts: _paperValueCounts,
    set: a => { PAPER_ACTIVE_FILTERS = a; },
    paperOnly: () => _paperRawTrades().map(r => r.position_id).join(',')
  };
`)({ getElementById: id => els[id] || null }, RAW_TRADES);

console.log('1. PAPER LAMANG ANG PINAGMUMULAN\n');
ok('hindi kasama ang tunay na trade', api.paperOnly() === 'P1,P2,P3,P4', api.paperOnly());
api.set([]);
ok('walang filter -> lahat ng paper', api.rows() === 'P1,P2,P3,P4', api.rows());

console.log('\n2. ANG MGA HALAGANG INAALOK\n');
console.log('   trade_type      : ' + api.values('trade_type').join(', '));
console.log('   no_trade_reason : ' + api.values('no_trade_reason').join(' | '));
console.log('   paper_outcome   : ' + api.values('paper_outcome').join(' | '));
ok('walang inuulit sa dahilan', api.values('no_trade_reason').length === 3,
   api.values('no_trade_reason').length + '');
/* Comma-joined ang kahihinatnan. Kung hindi ito hahatiin, ang "Stopped out
   then hit TP, Hit TP" ay magiging sarili nitong pagpipilian at wala ni isa
   ang makakahanap ng tama. */
ok('hinahati ang comma-joined na kahihinatnan',
   api.values('paper_outcome').includes('Stopped out then hit TP') &&
   api.values('paper_outcome').includes('Hit TP'),
   api.values('paper_outcome').join(' | '));
ok('walang "Stopped out then hit TP, Hit TP" na buo',
   !api.values('paper_outcome').some(v => v.includes(',')));

console.log('\n3. ANG PAGSALA\n');
api.set([{ key:'trade_type', value:'Long' }]);
ok('Long lang', api.rows() === 'P1,P3,P4', api.rows());
api.set([{ key:'no_trade_reason', value:'Already extended — missed the entry' }]);
ok('isang dahilan', api.rows() === 'P1,P3', api.rows());
/* Ang kasapian, hindi ang eksaktong teksto: ang P3 ay markado ng dalawa. */
api.set([{ key:'paper_outcome', value:'Hit TP' }]);
ok('kasapian sa comma-joined', api.rows() === 'P1,P3', api.rows());
api.set([{ key:'paper_outcome', value:'Stopped out then hit TP' }]);
ok('at ang kabilang bahagi nito', api.rows() === 'P3', api.rows());

console.log('\n4. NAGPAPATONG-PATONG\n');
api.set([{ key:'trade_type', value:'Long' },
         { key:'pattern_type', value:'5 mins HL' }]);
ok('dalawang filter', api.rows() === 'P1,P4', api.rows());
api.set([{ key:'trade_type', value:'Long' },
         { key:'pattern_type', value:'5 mins LH' }]);
ok('walang tugma', api.rows() === '(wala)', api.rows());

console.log('\n5. ANG BILANG KATABI NG BAWAT HALAGA\n');
/* Ang bilang ay dapat kung ILAN ANG MAKUKUHA kung pipiliin mo ito — kaya
   hindi kasama ang sariling chip nito sa pagkuwenta. Kung kasama, ang bawat
   halagang hindi pa napipili ay palaging zero at walang silbi ang listahan. */
api.set([{ key:'trade_type', value:'Long' }, { key:'pattern_type', value:'all' }]);
let c = api.counts('pattern_type');
console.log('   sa Long: ' + Object.entries(c.counts).map(([k,v]) => k+'='+v).join('  '));
ok('2 ang 5 mins HL', c.counts['5 mins HL'] === 2, String(c.counts['5 mins HL']));
ok('walang 5 mins LH', !c.counts['5 mins LH'], String(c.counts['5 mins LH']));
api.set([{ key:'trade_type', value:'Long' }, { key:'trade_type', value:'Long' }]);
c = api.counts('trade_type');
ok('hindi kasama ang sarili sa bilang nito', c.counts['Short'] === 1,
   'Short=' + c.counts['Short']);

console.log('\n6. ANG PAGHAHANAP\n');
api.set([]);
els.paperSearch.value = 'asleep';
ok('nakikita ang dahilan', api.rows() === 'P4', api.rows());
els.paperSearch.value = 'P3';
ok('nakikita ang position id', api.rows() === 'P3', api.rows());
els.paperSearch.value = '';

console.log('\n7. HIWALAY SA TRADE JOURNALS\n');
ok('sariling estado', /let PAPER_ACTIVE_FILTERS = \[\]/.test(js));
ok('hindi hinahawakan ang JOURNAL_ACTIVE_FILTERS',
   !/PAPER_ACTIVE_FILTERS[\s\S]{0,80}JOURNAL_ACTIVE_FILTERS/.test(fnBody('getFilteredPaperRows')));
/* Ang tunay-lamang na field ay walang laman sa paper — ang pag-aalok noon ay
   isang menu na walang mapipili. */
ok('tinatanggal ang realOnly sa menu',
   /\.filter\(f => !f\.realOnly && !JOURNAL_FILTER_EXCLUDE\.has\(f\.key\)\)/.test(js));

console.log('\n8. NAKA-WIRE BA SA PAHINA?\n');
ok('may + Filter na pindutan', /id="paperAddFilterBtn"/.test(html));
ok('may menu', /id="paperColumnMenu"/.test(html));
ok('may chips', /id="paperFilterChips"/.test(html));
ok('may search', /id="paperSearch"/.test(html));
ok('may Clear filters', /id="paperClearBtn"/.test(html));
ok('tinatawag ng renderPaperTable ang chips',
   /renderPaperFilterChips\(\);/.test(fnBody('renderPaperTable')));
ok('sinasala ng renderPaperTable ang hilera',
   /getFilteredPaperRows\(\)/.test(fnBody('renderPaperTable')));
ok('may bilang na "N of M"', /\$\{rows\.length\} of \$\{all\.length\}/.test(js));
ok('may sariling empty state kapag nasala nang tuluyan',
   /No paper trades match these filters/.test(js));
// Iisang listener para sa dalawa — kung hindi, mananatiling bukas ang isa.
ok('isinasara ng klik sa labas ang menu ng paper',
   /paperColumnMenu[\s\S]{0,200}_openPaperChipMenu = null/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
