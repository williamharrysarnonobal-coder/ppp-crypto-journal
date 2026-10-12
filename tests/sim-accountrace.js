const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Bakit wala pa rin ang "Demo" kahit tama na ang syncAccountFieldOptions.
//
// Sa initApp:
//     loadAccounts();          <- WALANG await, pinapaandar lang
//     ...
//     const data = await fetch(trades)
//     ALL_TRADES = data.map(normalizeTrade)
//
// Karera ang dalawang fetch. Maliit ang accounts table kaya halos palaging
// siya ang unang dumarating — kaya tumatakbo ang syncAccountFieldOptions()
// habang WALA PA ang ALL_TRADES. Ang kalahati nitong "panatilihin ang pangalan
// na ginagamit ng trade" ay walang matingnan, kaya nabubura pa rin ang Demo.
//
// Tama ang logic; mali ang oras.
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
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const ACCTS = [{ account_name:'Upscale Trade 10K' }, { account_name:'Upscale Trade 50K' },
               { account_name:'Upscale Trade 5K' }];
const TRADES = [{ account:'Upscale Trade 5K' }, { account:'Demo' }, { account:'Demo' }];
const LEGACY = ['10k','25k','50k','100k','200k','Demo'];

// Ginagaya ang mundo: isang FIELD_OPTIONS na binabago sa lugar, gaya ng totoo.
function world(){
  const FIELD_OPTIONS = { account: LEGACY.slice() };
  let TRADING_ACCOUNTS = [], ALL_TRADES = [];
  const sync = new Function('getState', `
    ${grab('function syncAccountFieldOptions(')}
    return () => {
      const s = getState();
      // ang function ay tumitingin sa mga global; ipapasa natin sa pamamagitan
      // ng eval scope — kaya inililipat natin sila dito bawat tawag
      TRADING_ACCOUNTS = s.TRADING_ACCOUNTS;
      ALL_TRADES = s.ALL_TRADES;
      FIELD_OPTIONS = s.FIELD_OPTIONS;
      syncAccountFieldOptions();
    };
  `);
  return { FIELD_OPTIONS,
    setAccounts: a => TRADING_ACCOUNTS = a,
    setTrades:   t => ALL_TRADES = t,
    run: () => new Function('TRADING_ACCOUNTS','ALL_TRADES','FIELD_OPTIONS',
      grab('function syncAccountFieldOptions(') + ' syncAccountFieldOptions();'
    )(TRADING_ACCOUNTS, ALL_TRADES, FIELD_OPTIONS) };
}

console.log('ANG KARERA\n');
console.log('   Kaso A — unang dumating ang ACCOUNTS (ang nangyayari sa iyo):');
let w = world();
w.setAccounts(ACCTS);            // dumating ang accounts
w.setTrades([]);                 // wala pa ang trades
w.run();                         // <- dito tumatakbo ang sync sa loadAccounts()
console.log('      dropdown: ' + w.FIELD_OPTIONS.account.join(' · '));
check('   nawawala ang Demo — ito ang bug', w.FIELD_OPTIONS.account.includes('Demo'), false);

console.log('\n   Tapos dumating ang trades... pero walang tumatawag ulit:');
w.setTrades(TRADES);
console.log('      dropdown: ' + w.FIELD_OPTIONS.account.join(' · ') + '  (hindi nagbago)');

console.log('\n   Ang AYOS — tawagin ulit pagkarating ng trades:');
w.run();
console.log('      dropdown: ' + w.FIELD_OPTIONS.account.join(' · '));
check('   bumalik ang Demo', w.FIELD_OPTIONS.account.includes('Demo'), true);
check('   isang Demo lang', w.FIELD_OPTIONS.account.filter(x => x === 'Demo').length, 1);
check('   kumpleto ang totoong accounts',
  ACCTS.every(a => w.FIELD_OPTIONS.account.includes(a.account_name)), true);

console.log('\n   Kaso B — unang dumating ang TRADES:');
let w2 = world();
w2.setTrades(TRADES);
w2.setAccounts(ACCTS);
w2.run();
console.log('      dropdown: ' + w2.FIELD_OPTIONS.account.join(' · '));
check('   tama rin', w2.FIELD_OPTIONS.account.includes('Demo'), true);

console.log('\n   Paulit-ulit na tawag ay hindi nagdodoble:');
w2.run(); w2.run(); w2.run();
console.log('      dropdown: ' + w2.FIELD_OPTIONS.account.join(' · '));
check('   apat pa rin', w2.FIELD_OPTIONS.account.length, 4);

console.log('\nNAKA-WIRE BA SA TUNAY NA CODE?\n');
/* Hindi na "ALL_TRADES = data.map(normalizeTrade)" ang anchor. Hinahati na ng
   _rebuildTradeArrays ang tunay at paper na trade, kaya iisa na lang ang lugar
   na bumubuo ng ALL_TRADES — at iyon ang bagong anchor. Sinusuri ko muna kung
   iisa nga ito, dahil kung may pangalawang tagabuo ay hindi na sapat ang
   pagsuri sa isa. */
const builders = js.split(/\r?\n/).filter(l =>
  /(^|[^.\w])ALL_TRADES\s*=[^=]/.test(l) &&        // isang assignment, hindi ==
  !/ALL_TRADES\s*=\s*\[\s*\]\s*;/.test(l));        // hindi ang deklarasyon
check('iisa lang ang bumubuo ng ALL_TRADES', builders.length, 1);
const initIdx = js.indexOf('RAW_TRADES = data;');
const after = js.slice(initIdx, initIdx + 900);
check('may sync pagkatapos ng pagbuo ng trades',
  /syncAccountFieldOptions\(\);/.test(after), true);
check('at nauuna ang pagbuo kaysa sa sync',
  after.indexOf('_rebuildTradeArrays();') < after.indexOf('syncAccountFieldOptions();'), true);
const inLoad = js.slice(js.indexOf('async function loadAccounts('), js.indexOf('const ACCOUNT_PHASE_STAGES'));
check('nandoon pa rin sa loadAccounts', /syncAccountFieldOptions\(\);/.test(inLoad), true);
check('dalawang tawag sa kabuuan',
  (js.match(/^\s*syncAccountFieldOptions\(\);/gm) || []).length, 2);
check('walang await sa loadAccounts (kaya kailangan ang pangalawa)',
  /^\s{2}loadAccounts\(\);/m.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
