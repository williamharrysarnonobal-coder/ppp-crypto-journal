const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Verify the new 30 Mins Invalidation checklist: the items themselves, that it
// no longer shares an array with 15 mins, how old answers re-map, and which
// auto-rules still fire on the new wording.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function constBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
function grab(marker){
  const i = js.indexOf(marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const CS = new Function(constBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(48) + got + (ok ? '' : '   <-- ' + want));
};

const SHORT = CS['Short|30 mins Invalidation Play'];
const LONG  = CS['Long|30 mins Invalidation Play'];

console.log('Short | 30 mins Invalidation Play');
SHORT.items.forEach((it, i) => {
  const flags = ['almost','invert','exec','retest'].filter(f => it[f]).join(' ') ||
                (it.select ? 'select' : 'yes/no');
  console.log('  ' + i + '  ' + it.tag.padEnd(28) + flags.padEnd(14) + it.text);
});

console.log('\n  bilang ng item', SHORT.items.length);
check('7 na item', SHORT.items.length, 7);
check('item 1 ay Break Zero Line', SHORT.items[1].text, '30M MACD Break Zero Line?');
check('item 1 ay HINDI inverted (Yes = Positive)', !SHORT.items[1].invert, true);
check('item 1 ay walang almost', !SHORT.items[1].almost, true);
check('Sequence nasa index 3', SHORT.items.findIndex(i => i.tag === 'Sequence'), 3);

console.log('\nHiwalay na array na sa 15 mins?');
check('Short != 15 mins LH (walang alias)', SHORT.items === CS['Short|15 mins LH'].items, false);
check('Long  != 15 mins HL (walang alias)',  LONG.items === CS['Long|15 mins HL'].items, false);

console.log('\nPaano nagma-map ang LUMANG sagot (dating naka-alias sa 15 mins LH)');
const OLD = CS['Short|15 mins LH'].items;
SHORT.items.forEach((it, i) => {
  const same = OLD[i] && OLD[i].text === it.text;
  console.log('  ' + i + '  ' + (same ? 'pareho ' : 'IBA    ') +
    (same ? it.text.slice(0,52) : (OLD[i] ? OLD[i].text.slice(0,34) + '  ->  ' + it.text.slice(0,30) : '(bago)')));
});
const changed = SHORT.items.filter((it,i) => !OLD[i] || OLD[i].text !== it.text).length;
console.log('  ' + changed + ' sa 7 ang nagbago ng kahulugan');

console.log('\nAling auto-rule ang tumutugma pa sa BAGONG wording?');
const RULE_TEXTS = [
  ['1H MACD in Bear Territory (Red Histogram)?',   'HTF bias'],
  ['1H MACD in Bull Territory (Green Histogram)?', 'HTF bias'],
  ['Did MACD cross the zero line downward when your order triggered?', 'No Confirmation / Entered Early / FOMO'],
  ['Did MACD cross the zero line upward when your order triggered?',   'No Confirmation / Entered Early / FOMO'],
  ['Right Hand Present?', 'Ignored Trend'],
  ['Left Hand Present?',  'Ignored Trend'],
];
[['Short', SHORT], ['Long', LONG]].forEach(([name, cfg]) => {
  console.log('  ' + name + ':');
  const hit = new Set();
  RULE_TEXTS.forEach(([text, rule]) => {
    if(cfg.items.some(it => it.text === text)) hit.add(rule);
  });
  ['HTF bias','No Confirmation / Entered Early / FOMO','Ignored Trend'].forEach(r =>
    console.log('     ' + (hit.has(r) ? '[x] ' : '[ ] ') + r + (hit.has(r) ? '' : '   <-- HINDI na tumutugma')));
  if(name === 'Short' && hit.has('HTF bias')) fail++;   // expected to MISS, see report
  // Salamin na ng Short ang Long (Bear Territory, Green Histogram) — hiniling
  // niya. Walang auto-rule ang Invalidation Play (noAutoRules), kaya pareho.
  if(name === 'Long' && hit.has('HTF bias')) fail++;
});
check('Long item 0 ay Bear Territory (Green Histogram)', LONG.items[0].text,
      '1H MACD in Bear Territory (Green Histogram)?');
check('Short item 0 ay Bull Territory (Red Histogram)', SHORT.items[0].text,
      '1H MACD in Bull Territory (Red Histogram)?');
check('parehong noAutoRules', !!(LONG.noAutoRules && SHORT.noAutoRules), true);

console.log('\n  Ang item 0 ng Short ay "Bull Territory (Red Histogram)" — walang');
console.log('  auto-rule na tumutugma diyan. Sinadya kong isulat ang eksaktong');
console.log('  binigay mo; tingnan ang ulat.');

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat ayon sa inaasahan'));
process.exit(fail ? 1 : 0);
