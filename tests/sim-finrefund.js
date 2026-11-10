const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Finance Easy Add: card refund alert ("...has been refunded to your card account").
   Hindi ito nade-detect dati — purchase at salary lang ang kilala. */
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
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

const refund = new Function(fnBody('parseFinTxEasyAddRefundText') + ' return parseFinTxEasyAddRefundText;')();
const purchase = new Function(fnBody('parseFinTxEasyAddText') + ' return parseFinTxEasyAddText;')();

const SMS = 'Purchase amount of AED 12.00 at CARS TAXI on your Credit Card ending 8491 has been refunded to your card account. Avl Limit is AED 15,663.00.';
const r = refund(SMS);
ok('na-detect ang refund', !!r, JSON.stringify(r));
ok('amount 12', r && r.amount === 12);
ok('merchant CARS TAXI', r && r.merchant === 'CARS TAXI');
ok('card 8491', r && r.cardLast === '8491');
ok('hindi ito binabasa bilang purchase', purchase(SMS) === null);

const big = refund('Purchase amount of AED 1,234.50 at AMAZON.AE, DUBAI on your Credit Card ending 008491 has been refunded to your card account.');
ok('may comma at mahabang card number', big && big.amount === 1234.5 && big.cardLast === '8491' && big.merchant === 'AMAZON.AE, DUBAI');

const P = 'Purchase of AED 14.73 with Credit Card ending 8491 at GRAND EMIRATES MARKET, ABU DHABI. Avl Cr. Limit is AED 13,665.04';
ok('ang purchase alert ay hindi refund', refund(P) === null);
ok('gumagana pa rin ang purchase', !!purchase(P));

const t1 = purchase('Payment of AED 69.60 to TABBY with Credit Card ending 8491. Avl Cr. Limit is AED 15,685.32.');
ok('Payment alert: TABBY', t1 && t1.amount === 69.6 && t1.merchant === 'TABBY' && t1.cardLast === '8491', JSON.stringify(t1));
const t2 = purchase('Payment of AED 74.00 to ANTHROPIC* CLAUDE SUB with Credit Card ending 8491. Avl Cr. Limit is AED 15,754.92. Pls refer stmt for exact amt');
ok('Payment alert: ANTHROPIC* CLAUDE SUB', t2 && t2.amount === 74 && t2.merchant === 'ANTHROPIC* CLAUDE SUB' && t2.cardLast === '8491', JSON.stringify(t2));
ok('Payment alert ay hindi refund', refund('Payment of AED 69.60 to TABBY with Credit Card ending 8491. Avl Cr. Limit is AED 15,685.32.') === null);

const flow = fnBody('parseFinTxEasyAdd');
ok('Income ang refund sa Easy Add', /parseFinTxEasyAddRefundText\(raw\)[\s\S]{0,700}tx_type: 'Income'/.test(flow));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
