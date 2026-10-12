const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang "No." column.
//
// DATI: permanenteng numero na ibinibigay minsan sa paggawa at hindi na
// ginagamit muli. 148 trades pero hanggang 151 ang numero — tatlong nabura,
// tatlong butas. At magulo ang pagkakasunod dahil ang table ay naka-sort sa
// close date habang ang numero ay kung kailan mo ginawa ang entry.
//
// NGAYON: posisyon sa buong kasaysayan mo, pinakaluma = 1. Nag-aayos mag-isa.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(m){
  const i = js.indexOf(m);
  if (i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

// Isang mundo na may sarili nitong ALL_TRADES, gaya ng totoo.
function world(trades){
  const api = new Function('getTrades', `
    let ALL_TRADES = getTrades();
    let _TRADE_NO = new Map();
    ${grab('function _rebuildTradeNumbers(')}
    ${js.slice(js.indexOf('const _tradeNo ='), js.indexOf('\n', js.indexOf('const _tradeNo =')))}
    _rebuildTradeNumbers();
    return { no: r => _tradeNo(r), all: () => ALL_TRADES.map(t => [t.position_id, _tradeNo(t)]) };
  `)(() => trades);
  return api;
}

const D = (d) => new Date(2026, 7, d, 12, 0, 0).toISOString();
const mk = (id, day) => ({ position_id: id, close_date: D(day), open_date: D(day) });

console.log('1. SUNOD-SUNOD, PINAKALUMA = 1\n');
let w = world([mk('C', 12), mk('A', 10), mk('B', 11), mk('D', 13)]);
w.all().forEach(([id, n]) => console.log('   ' + id + ' -> #' + n));
check('ang pinakaluma ay #1', w.no({ position_id:'A' }), 1);
check('sunod-sunod', w.all().map(([,n]) => n).sort((a,b)=>a-b).join(','), '1,2,3,4');
check('ang pinakabago ay #4', w.no({ position_id:'D' }), 4);

console.log('\n2. ANG PROBLEMA MO — 148 trades, hanggang 151\n');
// Ginagaya: 151 na ginawa, 3 ang nabura.
const many = [];
for(let i = 1; i <= 151; i++) many.push(mk('T' + i, (i % 28) + 1));
const kept = many.filter(t => !['T40','T77','T120'].includes(t.position_id));
w = world(kept);
const nums = w.all().map(([,n]) => n);
console.log('   trades: ' + kept.length);
console.log('   pinakamataas na numero: ' + Math.max(...nums));
check('148 trades', kept.length, 148);
check('pinakamataas ay 148, hindi 151', Math.max(...nums), 148);
check('nagsisimula sa 1', Math.min(...nums), 1);
check('walang butas', new Set(nums).size, 148);
check('walang doble', nums.length, new Set(nums).size);

console.log('\n3. NAG-AAYOS PAGKATAPOS MAGBURA\n');
w = world([mk('A',10), mk('B',11), mk('C',12), mk('D',13)]);
check('bago: D ay #4', w.no({ position_id:'D' }), 4);
w = world([mk('A',10), mk('C',12), mk('D',13)]);   // binura ang B
check('matapos burahin ang B: D ay #3', w.no({ position_id:'D' }), 3);
console.log('   -> nagsasara ang butas, hindi naiiwan');

console.log('\n4. HINDI NAGBABAGO SA FILTER\n');
// Ang numero ay galing sa BUONG ALL_TRADES, hindi sa nakikitang rows.
check('mula sa buong kasaysayan, hindi sa view',
  /\[\.\.\.\(ALL_TRADES \|\| \[\]\)\]/.test(js), true);
check('hindi ginagamit ang getFilteredJournalRows',
  /_rebuildTradeNumbers[\s\S]{0,400}getFilteredJournalRows/.test(js), false);

console.log('\n5. MATATAG ANG PAGKAKASUNOD\n');
// Magkaparehong close date — hindi dapat maglipat-lipat sa bawat render.
const same = [mk('Z', 10), mk('Y', 10), mk('X', 10)];
const a1 = world(same).all().map(([id,n]) => id + n).join(',');
const a2 = world([...same].reverse()).all().map(([id,n]) => id + n).join(',');
console.log('   unang pagkakasunod : ' + a1);
console.log('   baliktad na input  : ' + a2);
check('pareho kahit baliktad ang input', a1.split(',').sort().join(','), a2.split(',').sort().join(','));

console.log('\n6. MGA GILID\n');
w = world([]);
check('walang trade', w.no({ position_id:'A' }), '');
w = world([mk('A',10), { position_id:'B' }]);   // walang petsa
check('walang petsa -> nasa dulo', w.no({ position_id:'B' }), 2);
check('may petsa -> nauuna', w.no({ position_id:'A' }), 1);
check('hindi kilalang trade', w.no({ position_id:'ZZZ' }), '');
check('walang row', w.no(null), '');

console.log('\n7. NAKA-WIRE BA?\n');
check('ginagamit ng column', /if\(key === 'no'\) return _tradeNo\(row\);/.test(js), true);
check('ginagamit ng modal title', /_tradeNo\(row\) \? ` · #\$\{_tradeNo\(row\)\}`/.test(js), true);
check('wala nang row.no', /row\.no\b/.test(js), false);
/* Apat. Lima ito noon: may moveTradeSide() na naglilipat ng trade sa pagitan ng
   dalawang journal, at ang paglipat ay nagbabago ng bilang ng tunay na trade.
   Tinanggal ang pindutang iyon — hindi na kailangan.

   Ang mas mahalagang pagsusuri ay ang nasa ibaba: bawat pagbuo ng ALL_TRADES
   ay may kasunod na rebuild. Ang bilang na ito ay isang bantay lamang na may
   napapansin kapag may bagong daan na naidagdag. */
check('tinatawag sa bawat pagbuo ng ALL_TRADES',
  // +2: ang Bulk Edit at ang bulk Confluence ng Trade Journals. +1: Save changes sa trade page.
  (js.match(/_rebuildTradeNumbers\(\);/g) || []).length, 7);
check('may kasunod na rebuild ang bawat ALL_TRADES =',
  (js.match(/ALL_TRADES = (data|RAW_TRADES)\.map\(normalizeTrade\);\r?\n\s*_rebuildTradeNumbers\(\);/g) || []).length,
  (js.match(/ALL_TRADES = (data|RAW_TRADES)\.map\(normalizeTrade\);/g) || []).length);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
