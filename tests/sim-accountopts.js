const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang dropdown ng Account sa drawer.
//
// Ang "Demo" ay hindi row sa My Accounts — walang laki, walang prop-firm rules,
// at hindi naman kailangan — pero totoo ang mga trade doon. Binubura ng
// syncAccountFieldOptions ang buong listahan at pinapalitan ng totoong accounts
// lang, kaya nawawala ang Demo sa dropdown.
//
// Hindi lang ito "hindi mapili". Kapag binuksan ang isang Demo trade at
// ni-save: walang katugmang <option> ang select, kaya nagiging BLANGKO ang
// value — nawawala kung saang account nangyari ang trade, tahimik, sa
// pag-edit lang.
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

const run = (accounts, trades, startOptions) => {
  const FIELD_OPTIONS = { account: startOptions.slice() };
  new Function('TRADING_ACCOUNTS','ALL_TRADES','FIELD_OPTIONS',
    grab('function syncAccountFieldOptions(') + ' syncAccountFieldOptions();'
  )(accounts, trades, FIELD_OPTIONS);
  return FIELD_OPTIONS.account;
};

const ACCTS = [
  { account_name:'Upscale Trade 5K' },
  { account_name:'Upscale Trade 10K' },
  { account_name:'Upscale Trade 50K' },
];
const LEGACY = ['10k','25k','50k','100k','200k','Demo'];

console.log('ANG SITWASYON MO\n');
const trades = [
  { account:'Upscale Trade 5K' }, { account:'Upscale Trade 50K' },
  { account:'Demo' }, { account:'Demo' }, { account:'Demo' },
];
const opts = run(ACCTS, trades, LEGACY);
console.log('   dropdown: ' + opts.join(' · ') + '\n');
check('nandoon ang Demo', opts.includes('Demo'), true);
check('nandoon ang tatlong totoong account',
  ACCTS.every(a => opts.includes(a.account_name)), true);
check('nauuna ang totoong accounts', opts.slice(0,3).join(','),
  'Upscale Trade 5K,Upscale Trade 10K,Upscale Trade 50K');
check('isang Demo lang, hindi tatlo', opts.filter(o => o === 'Demo').length, 1);
check('wala nang lumang 10k/25k na walang gumagamit', opts.includes('10k'), false);

console.log('\nANG TUNAY NA PANGANIB — pag-edit ng Demo trade\n');
// Ang <select> ay nagiging '' kapag walang <option> na tugma sa value.
const canRepresent = (options, value) => options.some(o => o === value);
console.log('   LUMA (totoong accounts lang):');
const oldOpts = ACCTS.map(a => a.account_name);
check('   kayang i-representa ang "Demo"', canRepresent(oldOpts, 'Demo'), false);
console.log('      -> mabubura ang account sa pag-save\n');
console.log('   BAGO:');
check('   kayang i-representa ang "Demo"', canRepresent(opts, 'Demo'), true);
check('   hindi mababago sa pag-save', canRepresent(opts, 'Demo'), true);

console.log('\nMGA GILID\n');
check('walang trade -> totoong accounts lang',
  run(ACCTS, [], LEGACY).join(','), 'Upscale Trade 5K,Upscale Trade 10K,Upscale Trade 50K');
check('walang account pa (async) -> hindi ginagalaw',
  run([], trades, LEGACY).join(','), LEGACY.join(','));
check('hindi kasama ang Unspecified',
  run(ACCTS, [{ account:'Unspecified' }], LEGACY).includes('Unspecified'), false);
check('hindi kasama ang blangko',
  run(ACCTS, [{ account:'' }, { account:null }], LEGACY).length, 3);
check('hindi nadodoble kahit ibang laki ng titik',
  run(ACCTS, [{ account:'upscale trade 5k' }], LEGACY).length, 3);
const many = run(ACCTS, [{ account:'Demo' },{ account:'Paper' },{ account:'Old Prop' }], LEGACY);
console.log('   tatlong lumang pangalan: ' + many.join(' · '));
check('naka-sort ang mga luma', many.slice(3).join(','), 'Demo,Old Prop,Paper');

console.log('\nHINDI NA ITO NAGBABABALA\n');
const FO = { account: opts };
const invalid = new Function('TRADING_ACCOUNTS','FIELD_OPTIONS','UNFOLLOWED_RULES_OPTIONS',
  'ALL_DRAWER_FIELDS','CONFLUENCE_SETUPS','_ruleTags','_brokenRuleTags',
  '_staleConfluenceItems','_tagRetiredNote','_postBEApplies','_confluenceScoreFor','DEFAULT_MIN_CONFLUENCE_PCT', `
  ${js.slice(js.indexOf('const JOURNAL_VALIDATED_KEYS'), js.indexOf('];', js.indexOf('const JOURNAL_VALIDATED_KEYS'))+2)}
  ${grab('const _isBlankish')}
  ${grab('function _canonicalTags(')}
  ${grab('function _deriveRulesFollowed(')}
  ${grab('function _journalInvalidFields(')}
  return _journalInvalidFields;
`)(ACCTS, FO, [], [{key:'account',label:'Account'}], {},
   () => [], () => [], () => [], () => null, () => false, () => null, 60);

const accWarn = r => invalid(r).filter(b => b.key === 'account').map(b => b.value);
check('Demo -> walang babala', accWarn({ account:'Demo' }).join('') || '(wala)', '(wala)');
check('totoong account -> walang babala',
  accWarn({ account:'Upscale Trade 5K' }).join('') || '(wala)', '(wala)');
console.log('   di-kilala -> ' + (accWarn({ account:'Upscale Trade 999K' })[0] || '(wala)'));
check('di-kilala -> may babala', accWarn({ account:'Upscale Trade 999K' }).length, 1);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
