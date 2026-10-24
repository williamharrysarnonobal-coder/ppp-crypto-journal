// Upscale Easy Add: the Windows copy AND the Mac copy of a position card must
// give the same fields. On a Mac the value sits on the line after "Close:",
// date and time share one line, and "Pnl:" can come out as "Prl:".
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\\\/g, '/');
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
const grab = n => { const i = js.indexOf('function ' + n + '('); let d = 0; for(let j = js.indexOf('{', i); j < js.length; j++){ if(js[j] === '{') d++; else if(js[j] === '}' && --d === 0) return js.slice(i, j + 1); } };
const parse = new Function(grab('_parseExchangeDateTime') + grab('parseUpscaleEasyAddText') + 'return parseUpscaleEasyAddText;')();
let fail = 0;
const ok = (l, got, want) => { const c = JSON.stringify(got) === JSON.stringify(want); if(!c) fail++; console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(30) + JSON.stringify(got) + (c ? '' : '   <-- ' + JSON.stringify(want))); };
const pick = p => ({ symbol: p.symbol, dir: p.trade_type, lev: p.leverage, entry: p.entry_price, exit: p.close_price, size: p.position_size, pnl: p.profit_loss, fee: p.fee, wl: p.win_loss, exit_type: p.exit_type, open: p.open_date, close: p.close_date });

console.log('MAC (ang idinikit niya)');
const mac = pick(parse(`฿
BTC/USD
へ
SHORT x2
0.0767
BTC
3,051.1
USD
Avg: $79,559.4
Close:
$79,820.3
Prl: -20.01 USD
---------
Fee: 0.977954
CLOSED
24.10.26 20:48:01
Close
SL
0.0767
3,051.10
Close:
79,820.3
Pnl: -20.01
Fee: 0.489777

24.10.26 20:48:01
Open position
Limit
0.0767
3,051.10
Avg: 79,559.4
Entry: 79,559.4
Pnl:
0.00
Fee: 0.488176

24.10.26 20:25:23`));
ok('symbol / direction / lev', [mac.symbol, mac.dir, mac.lev], ['BTC/USD', 'Short', 2]);
ok('entry (Avg)', mac.entry, 79559.4);
ok('exit (Close: sa susunod na linya)', mac.exit, 79820.3);
ok('size', mac.size, 0.0767);
ok('P&L (Prl:)', mac.pnl, -20.01);
ok('fee = total, hindi per-fill', mac.fee, 0.977954);
ok('Loss · SL Hit', [mac.wl, mac.exit_type], ['Loss', 'SL Hit']);
ok('open (petsa+oras iisang linya)', mac.open, '2026-10-24T20:25:23');
ok('close', mac.close, '2026-10-24T20:48:01');

console.log('\nWINDOWS (ang dating format)');
const win = pick(parse('BTC/USD\nLONG x1\n\n0.6204\nBTC\n\n39,983.4\nUSD\n\nPnl: 591.36 USD\nFee: 6.44465\n\nAvg: $64,447.7\nClose: $65,400.9\n\nCLOSED\n\n19.08.26\n18:17:07\n\nClose\nTP\n\n0.6204\n\n39,983.38\n\nClose: 65,400.9\n\nPnl: 591.36\nFee: 3.24598\n\n19.08.26\n18:17:07\n\nOpen position\nLimit\n\n0.6204\n\n39,983.38\n\nAvg: 64,447.7\nEntry: 64,447.7\n\nPnl: 0.00\nFee: 3.19867\n\n19.08.26\n15:53:30'));
ok('entry / exit', [win.entry, win.exit], [64447.7, 65400.9]);
ok('P&L / fee', [win.pnl, win.fee], [591.36, 6.44465]);
ok('Win · TP Hit', [win.wl, win.exit_type], ['Win', 'TP Hit']);
ok('open / close', [win.open, win.close], ['2026-08-19T15:53:30', '2026-08-19T18:17:07']);

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);