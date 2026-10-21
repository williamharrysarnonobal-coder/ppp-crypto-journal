const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* THE5ERS PASTE — ang eksaktong idinikit niya, may header at wala. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
function grab(m){
  const i = js.indexOf(m); if(i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
const parse = new Function(`
  ${grab('function _parseExchangeDateTime(')}
  ${grab('function parseThe5ersEasyAddText(')}
  return parseThe5ersEasyAddText;`)();

let fail = 0;
const ok = (l, got, want) => { const c = JSON.stringify(got) === JSON.stringify(want); if(!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(34) + JSON.stringify(got) + (c ? '' : '   <-- ' + JSON.stringify(want))); };

const withHeaders = `Side

Open Date

Close Date

Entry

Exit

Qty

Fee

Swap Fees

P&I

Status

Buy

02.10.26 12:02

02.10.26 16:31

$86,168.56

$87,132.93

0.66

-$34.31

$0

+$602.17

r Win`;
const noHeaders = withHeaders.slice(withHeaders.indexOf('Buy')).replace('r Win', '1 Win');
const tabRow = 'Buy\t02.10.26 12:02\t02.10.26 16:31\t$86,168.56\t$87,132.93\t0.66\t-$34.31\t$0\t+$602.17\t↑ Win';

const net = p => Math.round((p.profit_loss - p.fee) * 100) / 100;
[['MAY HEADER', withHeaders], ['WALANG HEADER', noHeaders], ['ISANG HILERA (TAB)', tabRow]].forEach(([name, txt]) => {
  console.log('\n' + name);
  const p = parse(txt);
  ok('Long', p.trade_type, 'Long');
  ok('open', p.open_date, '2026-10-02T12:02:00');
  ok('close', p.close_date, '2026-10-02T16:31:00');
  ok('entry', p.entry_price, 86168.56);
  ok('exit', p.close_price, 87132.93);
  ok('qty', p.position_size, 0.66);
  ok('fee (positibong gastos)', p.fee, 34.31);
  ok('net = +602.17 gaya ng The5ers', net(p), 602.17);
  ok('Win', p.win_loss, 'Win');
});

console.log('\nSELL NA TALO, MAY SWAP');
const loss = parse('Sell\n03.10.26 09:15\n03.10.26 10:40\n$88,000.00\n$88,400.00\n0.5\n-$20.00\n-$1.50\n-$221.50\n↓ Loss');
ok('Short', loss.trade_type, 'Short');
ok('fee = fee + swap', loss.fee, 21.5);
ok('net = -221.50', net(loss), -221.5);
ok('Loss', loss.win_loss, 'Loss');
ok('pnl% positibo kapag Short at bumaba? (tumaas = negatibo)', loss.pnl_percent < 0, true);

console.log('\nGOLD — ANG QTY AY LOTS (1 lot = 100 oz)');
const gold = parse('Buy\n05.10.26 16:19\n05.10.26 17:07\n$4,155.18\n$4,147.71\n0.42\n-$3.49\n$0\n-$317.23\nLoss');
ok('Long', gold.trade_type, 'Long');
ok('qty = 42 oz (0.42 lots × 100)', gold.position_size, 42);
ok('fee 3.49', gold.fee, 3.49);
ok('net = -317.23 gaya ng The5ers', net(gold), -317.23);
ok('Loss', gold.win_loss, 'Loss');
ok('risk |entry−SL| × qty ay nasa oz na', Math.round(Math.abs(4155.18 - 4148) * gold.position_size), Math.round(7.18 * 42));
ok('BTC hindi ginalaw (lot = 1)', parse(noHeaders).position_size, 0.66);

console.log('\nANG MGA IDINIKIT NIYA (may symbol sa unahan) — UAE time ang oras ng The5ers');
const btc = parse('BTCUSD\nSell\n16.10.26 20:41\n16.10.26 21:08\n$81,471.56\n$81,124.26\n2.36\n-$115.12\n$0\n+$704.51\nWin');
ok('BTC Short', btc.trade_type, 'Short');
ok('symbol BTC/USD', btc.symbol, 'BTC/USD');
ok('open 16 Oct 20:41', btc.open_date, '2026-10-16T20:41:00');
ok('close 16 Oct 21:08', btc.close_date, '2026-10-16T21:08:00');
ok('entry / exit', [btc.entry_price, btc.close_price], [81471.56, 81124.26]);
ok('qty 2.36 (BTC lot = 1)', btc.position_size, 2.36);
ok('fee 115.12', btc.fee, 115.12);
ok('net = +704.51 gaya ng The5ers', net(btc), 704.51);
ok('Win', btc.win_loss, 'Win');
const xau = parse('XAUUSD\nSell\n20.10.26 22:37\n20.10.26 23:00\n$4,122.36\n$4,126.33\n1.98\n-$16.33\n$0\n-$802.39\nLoss');
ok('XAU Short', xau.trade_type, 'Short');
ok('symbol XAU/USD', xau.symbol, 'XAU/USD');
ok('walang symbol kapag wala', parse(noHeaders).symbol, undefined);
ok('open / close', [xau.open_date, xau.close_date], ['2026-10-20T22:37:00', '2026-10-20T23:00:00']);
ok('qty = 198 oz (1.98 lots)', xau.position_size, 198);
ok('fee 16.33', xau.fee, 16.33);
ok('net = -802.39 gaya ng The5ers', net(xau), -802.39);
ok('Loss', xau.win_loss, 'Loss');

console.log('\nLEVERAGE MULA SA SETUP');
ok('kasama ang leverage sa prefill ng Journal', /leverage: s\.leverage != null/.test(js), true);

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
