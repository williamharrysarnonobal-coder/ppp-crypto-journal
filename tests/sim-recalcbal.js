const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* MULING KUWENTAHIN ANG BALANSE MULA SA MGA TRADE.

   Manwal ang balanse nang sadya — ang broker ang awtoridad, at hindi lahat ng
   trade ay laging naitatala. Pero napatungan ito ng lumang auto-advance:
   nireset nito ang balanse sa laki ng account at nabura ang tunay na numero,
   at wala nang paraan para makuha iyon pabalik maliban sa Upscale mismo.

   Sa ganoong sandali, ang journal ang tanging natitirang tala. Ito ang
   nagbabalik noon — pero ipinapakita muna bago isulat, at hindi ito
   nagse-save nang mag-isa. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const html = fs.readFileSync(ROOT + '/dashboard.html', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');

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

const run = ({ name, size, trades, accounts }) => {
  const els = {
    accName:  { value: name },
    accSize:  { value: size == null ? '' : String(size) },
    accBalance: { value: '' },
    accRecalcNote: { textContent: '', innerHTML: '' },
  };
  const fn = new Function('document', 'ALL_TRADES', 'TRADING_ACCOUNTS',
    fnBody('netPnl') + fnBody('recalcBalanceFromJournal') +
    ' return recalcBalanceFromJournal;')
    ({ getElementById: id => els[id] || null }, trades, accounts || []);
  fn();
  return { bal: els.accBalance.value,
           note: (els.accRecalcNote.innerHTML || els.accRecalcNote.textContent || '')
                   .replace(/<[^>]+>/g, '') };
};

const T = (pl, fee) => ({ account:'Upscale Trade 5K', close_date:new Date('2026-08-01'),
                          profit_loss:pl, fee:fee || 0 });

console.log('1. ANG KASO NIYA — nireset sa 5,000, 33 trades\n');
let r = run({ name:'Upscale Trade 5K', size:5000,
  trades:[ ...Array(20).fill(0).map(() => T(60, 2)),
           ...Array(13).fill(0).map(() => T(-40, 2)) ] });
// 20 x 58 = 1160 ; 13 x -42 = -546 ; 5000 + 614 = 5614
console.log('   ' + r.note);
ok('napupunan ang kahon', r.bal === '5614.00', r.bal);
ok('sinasabi ang bilang ng trade', /33 closed trades/.test(r.note));
ok('sinasabi ang panimula at ang pinagbago', /5,000/.test(r.note) && /614/.test(r.note));
ok('sinasabing tingnan ang prop firm', /prop firm/i.test(r.note));

console.log('\n2. BINABAWAS ANG FEE\n');
r = run({ name:'A', size:1000, trades:[
  { account:'A', close_date:new Date(), profit_loss:100, fee:25 } ] });
ok('1000 + (100 - 25) = 1075', r.bal === '1075.00', r.bal);

console.log('\n3. ANG PHASE START BALANCE ANG NANANAIG\n');
/* Kung nasa gitna ka ng isang phase, ang panimula ay ang balanse noong
   nagsimula iyon — hindi ang laki ng account. */
r = run({ name:'A', size:5000, trades:[
    { account:'A', close_date:new Date(), profit_loss:200, fee:0 } ],
  accounts:[{ account_name:'A', account_size:5000, phase_start_balance:5250 }] });
ok('5250 + 200 = 5450', r.bal === '5450.00', r.bal);

console.log('\n4. HINDI NAGSUSULAT KUNG WALANG MASUSULAT\n');
r = run({ name:'', size:5000, trades:[] });
ok('walang pangalan -> hindi napupunan', r.bal === '', '"' + r.bal + '"');
ok('at sinasabi kung bakit', /name/i.test(r.note), r.note);

r = run({ name:'Wala Pa', size:5000, trades:[] });
ok('walang trade -> hindi napupunan', r.bal === '', '"' + r.bal + '"');
ok('at sinasabi kung bakit', /No closed trades/.test(r.note), r.note);

console.log('\n5. IBANG ACCOUNT — hindi dapat kasama\n');
r = run({ name:'Upscale Trade 5K', size:5000, trades:[
  T(100), { account:'Upscale Trade 50K', close_date:new Date(), profit_loss:9999, fee:0 } ] });
ok('5000 + 100 lang', r.bal === '5100.00', r.bal);

console.log('\n6. ANG BUKAS PANG TRADE — hindi pa ito pera\n');
r = run({ name:'A', size:1000, trades:[
  { account:'A', close_date:new Date(), profit_loss:50, fee:0 },
  { account:'A', close_date:null, profit_loss:9999, fee:0 } ] });
ok('1050, hindi 11049', r.bal === '1050.00', r.bal);

console.log('\n7. NAKA-WIRE BA?\n');
ok('may pindutan sa modal', /recalcBalanceFromJournal\(\)/.test(html));
ok('katabi ng Current Balance',
   html.indexOf('id="accBalance"') < html.indexOf('accRecalcNote'));
ok('may kulay sa CSS', /\.acct-recalc-btn\{/.test(css));
/* Hindi ito nagse-save nang mag-isa — ang kahon lang ang napupunan, at siya
   pa rin ang pipindot ng Save. Kung magsusulat ito nang diretso, isa na naman
   itong app na nagpapasya para sa kanya. */
const body = fnBody('recalcBalanceFromJournal');
ok('walang fetch', !/fetch\(/.test(body));
ok('walang PATCH', !/PATCH/.test(body));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
