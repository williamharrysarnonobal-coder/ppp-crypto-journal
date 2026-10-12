const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG PAPER TRADE AY HINDI DAPAT LUMALABAS SA TRADE JOURNALS.

   "yung mga nasa Paper Journal nakikita sa Trade Journals 3 trades · showing
   incomplete only"

   Ang sanhi: ang RAW_TRADES ay naglalaman ng LAHAT — tunay at paper, dahil
   iisang talahanayan sila sa database. Ang ALL_TRADES ay ang nasala nang
   bersyon, pero NORMALIZED ito. Ang mga lugar na nangangailangan ng HILAW na
   hilera ay dumiretso sa RAW_TRADES at nakuha ang paper kasama.

   Dalawang bagay ang nagawa noon, at ang pangalawa ay mas nakakainis: nakita
   niya ang paper sa talahanayan, at binilang silang lahat bilang "incomplete"
   — isang babalang hindi niya kailanman mapapatahimik, dahil ang paper trade
   ay TAMANG walang account at walang win/loss.

   Ang pagsusuring ito ay hindi tungkol sa tatlong lugar na naayos ko. Ito ay
   isang PANUNTUNAN: walang bahagi ng Trade Journals ang dapat bumasa ng
   RAW_TRADES nang tuwiran. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + got + (ok ? '' : '   <-- ' + want));
};

console.log('1. MAY IISANG PINAGMUMULAN\n');
check('may _realRawTrades()', /function _realRawTrades\(\)/.test(js), true);
check('sinasala nito ang is_paper',
  /is_paper === true \|\| r\.is_paper === 'true'/.test(js), true);
/* Ang hilaw na hilera ay maaaring may 'true' na teksto mula sa PostgREST at
   hindi laging boolean — kapareho ng ginagawa ng normalizeTrade. */
check('at ang teksto ring "true"', /r\.is_paper === 'true'/.test(js), true);

console.log('\n2. WALANG TUWIRANG RAW_TRADES SA JOURNAL\n');
/* Ang bawat function na bumubuo ng nakikita sa Trade Journals. Kung may
   babasa ng RAW_TRADES sa loob nila, babalik ang bug. */
const fns = ['getFilteredJournalRows', 'getIncompleteTrades', '_journalFilterValues',
             '_journalValueCounts', '_journalTradeYears', 'populateJournalPeriodFilters'];
fns.forEach(name => {
  const i = js.indexOf('function ' + name + '(');
  if(i < 0){ check(name + ' — umiiral', 'WALA', 'meron'); return; }
  let d = 0, body = '';
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d){ body = js.slice(i, j + 1); break; } }
  }
  // Alisin ang komento — ang paliwanag na bumabanggit ng RAW_TRADES ay hindi
  // isang pagbasa. Ito ang maling positibo na nakuha ko sa "service_role".
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const hits = (code.match(/\bRAW_TRADES\b/g) || []).length;
  check(name, hits === 0 ? 'malinis' : hits + ' na tuwirang RAW_TRADES', 'malinis');
});

console.log('\n3. ANG PAGBILANG, SA TUNAY NA HUGIS NG DATOS\n');
/* Pinapatakbo ang mismong getIncompleteTrades sa isang halo ng tunay at paper.
   Ito ang bilang na nakita niya: tatlong paper trade na "incomplete". */
function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
function arrBlock(name){
  const m = new RegExp('const ' + name + ' = \\[').exec(js);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '[') d++;
    else if(js[j] === ']'){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
/* Ang BUONG trade ay binubuo mula mismo sa REQUIRED_JOURNAL_FIELDS at hindi
   isinusulat nang kamay. Ang unang bersyon ko ay may nakasulat na listahan,
   kulang ng dalawa, at binilang ang sarili nitong "buong" trade bilang kulang —
   isang pagsusuring nabigo dahil sa fixture at hindi dahil sa code. */
const REQ = new Function(arrBlock('REQUIRED_JOURNAL_FIELDS') +
  ' return REQUIRED_JOURNAL_FIELDS;')();
const REAL = { position_id:'WEB-1', close_date:'2026-03-01' };
REQ.forEach(k => { REAL[k] = 'x'; });
const INCOMPLETE = { ...REAL, position_id:'WEB-2', [REQ[0]]: null };
const PAPER = { position_id:'WEB-3', symbol:'BTC/USD', is_paper:true,
  entry_price:1, tp_price:2, sl_price:0.5, no_trade_reason:'takot' };
console.log('     ' + REQ.length + ' na required na field: ' + REQ.join(', ').slice(0, 90));

const api = new Function('RAW_TRADES',
  arrBlock('REQUIRED_JOURNAL_FIELDS') +
  fnBody('_realRawTrades') + fnBody('getIncompleteTrades') +
  ' return { getIncompleteTrades, _realRawTrades };');

{
  const A = api([REAL, INCOMPLETE, PAPER, { ...PAPER, position_id:'WEB-4' },
                 { ...PAPER, position_id:'WEB-5', is_paper:'true' }]);
  console.log('     5 na hilera: 1 buo, 1 kulang, 3 paper');
  check('tunay lamang ang binibilang', A._realRawTrades().length, 2);
  check('isa lang ang kulang, hindi apat', A.getIncompleteTrades().length, 1);
  check('at ito ang tamang isa', A.getIncompleteTrades()[0].position_id, 'WEB-2');
}

console.log('\n' + (fail ? fail + ' FAIL' : 'malinis ang Trade Journals'));
process.exit(fail ? 1 : 0);
