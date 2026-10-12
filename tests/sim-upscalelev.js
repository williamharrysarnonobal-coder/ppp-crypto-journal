const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG LEVERAGE SA UPSCALE CARD.

   "bakit ba hindi na ankukuha yung leverage ngayon sa add journal... Diba
   kasama naman yun sa template from upscale"

   Tama siya. Ang unang linya ng position card ay "LONG x1" — direksyon AT
   leverage. Ang parser ay kumukuha lang ng direksyon, dahil walang leverage
   na column ang journal noon. Nang idagdag ko ang column, hindi ko kinabit
   ang parser dito — kaya kailangan pa niyang isulat nang kamay ang isang
   bagay na nasa mismong idinikit niya.

   Ang mismong parser ang pinapatakbo dito, hindi isang kopya. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + got + (ok ? '' : '   <-- ' + want));
};

const parse = new Function(fnBody('_parseExchangeDateTime') +
  fnBody('parseUpscaleEasyAddText') + ' return parseUpscaleEasyAddText;')();

// Ang tunay niyang position card.
const card = lev => [
  'BTC/USD', 'LONG ' + lev, '', '0.6204', 'BTC', '', '39,983.4', 'USD', '',
  'Pnl: 591.36 USD', 'Fee: 6.44465', '', 'Avg: $64,447.7', 'Close: $65,400.9', '',
  'CLOSED', '', '19.08.26', '18:17:07'].join('\n');

console.log('1. ANG LEVERAGE MULA SA UNANG LINYA\n');
[['x1', 1], ['x3', 3], ['x12.5', 12.5], ['X5', 5], ['x 2', 2]].forEach(([txt, want]) => {
  const out = parse(card(txt));
  check('"LONG ' + txt + '"', out.leverage, want);
});

console.log('\n2. HINDI NASIRA ANG DIREKSYON\n');
check('LONG x1  -> Long',  parse(card('x1')).trade_type, 'Long');
check('SHORT x5 -> Short', parse(card('x1').replace('LONG x1', 'SHORT x5')).trade_type, 'Short');
check('at ang leverage nito', parse(card('x1').replace('LONG x1', 'SHORT x5')).leverage, 5);

console.log('\n3. WALANG LEVERAGE SA LINYA\n');
/* Ang spot ay walang "x". Wala dapat itong leverage — at HINDI 1, dahil ang
   1x ay isang sagot at ang wala ay hindi. */
const noLev = parse(card('').replace('LONG ', 'LONG'));
check('walang x -> walang leverage',
  noLev.leverage === undefined ? '(wala)' : String(noLev.leverage), '(wala)');
check('pero may direksyon pa rin', noLev.trade_type, 'Long');

console.log('\n4. HINDI NAGUGULO NG IBANG LINYA\n');
/* May ibang linya sa card na may "x" — dapat ang UNANG linya lang ang
   binabasa para sa leverage, hindi kung saan-saan. */
const out = parse(card('x3'));
check('leverage', out.leverage, 3);
check('symbol pa rin', out.symbol, 'BTC/USD');
check('p&l pa rin', out.profit_loss, 591.36);
check('fee pa rin', out.fee, 6.44465);
check('entry pa rin', out.entry_price, 64447.7);
check('quantity pa rin', out.position_size, 0.6204);

console.log('\n' + (fail ? fail + ' FAIL' : 'kinukuha na ang leverage sa Upscale card'));
process.exit(fail ? 1 : 0);
