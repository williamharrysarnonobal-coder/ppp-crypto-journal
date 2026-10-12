const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Prove auto-flagging is OFF for Invalidation Play (both directions) and
// still ON everywhere else. Runs the real _autoUnfollowedRules.
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
  if (i < 0) throw new Error('missing: ' + marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}
function numConst(name){
  const i = js.indexOf('const ' + name + ' =');
  return i < 0 ? 'const ' + name + ' = 60;' : js.slice(i, js.indexOf('\n', i));
}

const CS = new Function(constBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();
const API = new Function('CONFLUENCE_SETUPS', `
  ${numConst('DEFAULT_MIN_CONFLUENCE_PCT')}
  ${grab('function _selectCredit(')}
  ${grab('function _confluenceProgress(')}
  ${grab('function _autoUnfollowedRules(')}
  return { _autoUnfollowedRules, _confluenceProgress };
`)(CS);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(50) + got + (ok ? '' : '   <-- ' + want));
};

// The worst possible answers: everything wrong, every trap sprung.
function worstAnswers(cfg){
  const a = {};
  cfg.items.forEach((it, i) => {
    if(it.select) a[i] = '5th';        // deepest in the sequence
    else if(it.invert) a[i] = 'yes';   // a hand IS present / breakdown DID happen
    else a[i] = 'no';                  // every confirmation missing
  });
  return a;
}

console.log('Pinakamasamang sagot sa bawat setup — ilang auto-flag ang pumuputok?\n');
Object.keys(CS).forEach(key => {
  const cfg = CS[key];
  const reasons = API._autoUnfollowedRules(cfg, worstAnswers(cfg), false);
  const isInval = key.includes('Invalidation');
  const mark = isInval ? (reasons.size === 0 ? 'ok  ' : 'FAIL') : (reasons.size > 0 ? 'ok  ' : 'FAIL');
  if(mark === 'FAIL') fail++;
  console.log('  ' + mark + '  ' + key.padEnd(34) + String(reasons.size).padStart(2) + ' flag' +
    (reasons.size ? '   ' + [...reasons].slice(0,3).join(', ') + (reasons.size > 3 ? ', …' : '') : '   (patay, gaya ng gusto mo)'));
});

console.log('\nAng dalawang Invalidation, sa detalye:');
['Long|30 mins Invalidation Play','Short|30 mins Invalidation Play'].forEach(key => {
  const cfg = CS[key];
  check(key.split('|')[0] + ': noAutoRules naka-set', !!cfg.noAutoRules, true);
  check(key.split('|')[0] + ': walang flag kahit pinakamasama', API._autoUnfollowedRules(cfg, worstAnswers(cfg), false).size, 0);
  check(key.split('|')[0] + ': walang flag kahit walang sagot', API._autoUnfollowedRules(cfg, {}, false).size, 0);
});

console.log('\nHindi naapektuhan ang iba (halimbawa):');
const lh = CS['Short|15 mins LH'];
const lhReasons = API._autoUnfollowedRules(lh, worstAnswers(lh), false);
console.log('  Short|15 mins LH -> ' + [...lhReasons].join(', '));
check('may Lack of Confluence pa rin', lhReasons.has('Lack of Confluence'), true);
// 'Ignored Trend' ay isinanib na sa 'Against Daily Bias / HTF Bias' — iisa
// ang tinutukoy nila sa sistema niya: ang HTF bias ANG trend.
check('may HTF bias pa rin', lhReasons.has('Against Daily Bias / HTF Bias'), true);

console.log('\n  Tandaan: ang confluence SCORE ay kinukuwenta pa rin sa Invalidation —');
console.log('  ang naka-off ay ang pag-tik ng Unfollowed Rules, hindi ang porsyento.');
const p = API._confluenceProgress(CS['Short|30 mins Invalidation Play'].items, worstAnswers(CS['Short|30 mins Invalidation Play']), false);
console.log('  Short Invalidation, pinakamasamang sagot: ' + p.done + ' / ' + p.total);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
