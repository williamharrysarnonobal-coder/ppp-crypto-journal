// Paste from exchange: both ticket layouts must read entry, TP and SL.
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
const grab = name => {
  const i = js.indexOf(`function ${name}(`);
  if(i < 0) throw new Error('missing ' + name);
  let depth = 0, j = js.indexOf('{', i);
  for(let k = j; k < js.length; k++){ if(js[k] === '{') depth++; else if(js[k] === '}' && --depth === 0) return js.slice(i, k + 1); }
};
const api = new Function(`${grab('_parseTicketColumns')}\n${grab('parsePositionTicket')}\nreturn { parsePositionTicket };`)();
let fail = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if(!ok) fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label.padEnd(44) + JSON.stringify(got));
};
const pick = r => ({ entry: r.entry, tp: r.tp, sl: r.sl, direction: r.direction });

// Template 1 (the original): label then its value.
check('original layout', pick(api.parsePositionTicket(
  'Entry price\n64808.053\nPROFIT LEVEL\nTicks\n129046828\nPrice\n64937.100\nSTOP LEVEL\nTicks\n613470749\nPrice\n64746.706')),
  { entry: 64808.053, tp: 64937.1, sl: 64746.706, direction: 'Long' });

// Template 2 (M1 laptop): all labels, then all values; a garbled tick count.
check('labels-then-values layout (Long)', pick(api.parsePositionTicket(
  'Entry price\nLeverage\nPROFIT LEVEL\nTicks\nPrice\nSTOP LEVEL\nTicks\nPrice\n82154.02\n10000.0\n1697915\n83851.93\n7342335!\n81419.78')),
  { entry: 82154.02, tp: 83851.93, sl: 81419.78, direction: 'Long' });

check('labels-then-values layout (Short)', pick(api.parsePositionTicket(
  'Entry price\nLeverage\nPROFIT LEVEL\nTicks\nPrice\nSTOP LEVEL\nTicks\nPrice\n82154.02\n10000.0\n1697915\n81000.50\n7342335\n82900.10')),
  { entry: 82154.02, tp: 81000.5, sl: 82900.1, direction: 'Short' });

console.log(fail ? `\n${fail} FAIL` : '\nlahat pumasa');
process.exit(fail ? 1 : 0);
