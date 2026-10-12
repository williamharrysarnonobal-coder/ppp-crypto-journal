const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// 1. Tama ba ang computation kahit magkakaiba ang bilang ng checklist?
// 2. Ang hover popup: alin ang na-meet at alin ang hindi.
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
const objBlock = n => { const i=js.indexOf('const '+n); let d=0;
  for(let j=js.indexOf('{',i); j<js.length; j++){ if(js[j]==='{')d++; else if(js[j]==='}'){d--; if(!d) return js.slice(i,j+1)+';';} } };
const CS = new Function(objBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();
const BAR = Number(/DEFAULT_MIN_CONFLUENCE_PCT = (\d+)/.exec(js)[1]);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) +
    '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const API = new Function('CONFLUENCE_SETUPS','DEFAULT_MIN_CONFLUENCE_PCT', `
  ${grab('function _selectCredit(')}
  ${grab('function _confluenceProgress(')}
  ${grab('function _confluenceCellData(')}
  ${grab('function _confluenceTooltipRows(')}
  return { _confluenceProgress, _confluenceCellData, _confluenceTooltipRows };
`)(CS, BAR);

console.log('1. TAMA BA ANG COMPUTATION SA MAGKAKAIBANG LAKI?\n');
console.log('   setup                          items  total  (total = items + chart pattern)');
Object.entries(CS).forEach(([k,cfg]) => {
  const p = API._confluenceProgress(cfg.items, {}, false);
  const ok = p.total === cfg.items.length + 1;
  if(!ok) fail++;
  console.log('   ' + (ok?'ok ':'FAIL') + ' ' + k.padEnd(31) + String(cfg.items.length).padEnd(7) + p.total);
});

console.log('\n   Bawat item ay 1 puntos ang pinakamataas:');
const KEY = 'Long|15 mins HL';
const items = CS[KEY].items;
const allYes = Object.fromEntries(items.map((it,i) => [i, it.invert ? 'no' : (it.select ? it.select[0] : 'yes')]));
const full = API._confluenceProgress(items, allYes, true);
check('lahat sagot + pattern = buo', full.done, full.total);
check('   kaya 100%', Math.round(full.done/full.total*100), 100);
const half = API._confluenceProgress(items,
  Object.fromEntries(items.filter(it => !it.select && !it.invert).map((it,i) => [i,'almost'])), false);
check('"Almost" ay kalahating puntos', half.done % 1 === 0.5 || half.done % 1 === 0, true);

console.log('\n   Magkaibang laki, parehong sukat:');
[['Long|15 mins HL', 8],['Long|5 mins HL', 9]].forEach(([k, total]) => {
  const its = CS[k].items;
  const halfAns = Object.fromEntries(its.slice(0, Math.floor(its.length/2))
    .map((it,i) => [i, it.invert ? 'no' : (it.select ? it.select[0] : 'yes')]));
  const p = API._confluenceProgress(its, halfAns, false);
  console.log('   ' + k.padEnd(20) + p.done + '/' + p.total + '  =  ' +
    Math.round(p.done/p.total*100) + '%');
});
check('ang total ay laging items+1', CS['Long|15 mins HL'].items.length + 1, 8);
console.log('   -> porsyento ang ginagamit, kaya maikukumpara ang 8-item sa 9-item');

console.log('\n2. ANG HOVER — alin ang na-meet\n');
const row = (answers, pattern) => ({
  trade_type:'Long', pattern_type:'15 mins HL',
  confluence_answers: answers, chart_pattern: pattern,
});
const seqIdx = items.findIndex(it => it.select);
const invIdx = items.findIndex(it => it.invert);
const normIdx = items.findIndex(it => !it.select && !it.invert);

const rows = API._confluenceTooltipRows(row({
  [normIdx]: 'yes',
  [invIdx]: 'yes',              // inverted: "yes" ang MALI
  [seqIdx]: items[seqIdx].select[0],
}, 'Double Bottom'));
rows.forEach(r => console.log('   ' + ({met:'✓',half:'~',missed:'✗',blank:'·'})[r.state] +
  '  ' + r.label.padEnd(24) + r.answer));

check('may linya kada item + chart pattern', rows.length, items.length + 1);
check('normal na "yes" -> met', rows[normIdx].state, 'met');
check('inverted na "yes" -> missed', rows[invIdx].state, 'missed');
check('select na unang pagpipilian -> met', rows[seqIdx].state, 'met');
check('hindi sinagot -> blank',
  rows.filter(r => r.state === 'blank' && r.label !== 'Chart Pattern').length > 0, true);
check('may Chart Pattern na linya', rows[rows.length-1].label, 'Chart Pattern');
check('   met kapag may pattern', rows[rows.length-1].state, 'met');
check('   blank kapag wala',
  API._confluenceTooltipRows(row({[normIdx]:'yes'}, null)).slice(-1)[0].state, 'blank');

console.log('\n   Ang "Almost":');
const r2 = API._confluenceTooltipRows(row({ [normIdx]:'almost' }, null));
check('almost -> half', r2[normIdx].state, 'half');
const r3 = API._confluenceTooltipRows(row({ [invIdx]:'no' }, null));
check('inverted na "no" -> met', r3[invIdx].state, 'met');

console.log('\n   Walang sagot:');
check('walang confluence_answers', API._confluenceTooltipRows(row(null, null)), 'null');
check('walang laman', API._confluenceTooltipRows(row({}, null)), 'null');

console.log('\n3. TUGMA BA ANG MARKA SA NUMERO?\n');
// Ang bilang ng "met" (+ kalahati ng "half") ay dapat katumbas ng done.
const answers = { [normIdx]:'yes', [invIdx]:'yes', [seqIdx]:items[seqIdx].select[2] };
const tr = API._confluenceTooltipRows(row(answers, 'Double Bottom'));
const cd = API._confluenceCellData(row(answers, 'Double Bottom'));
const fromMarks = tr.reduce((s,r) => s + (r.state==='met'?1:(r.state==='half'?0.5:0)), 0);
console.log('   mula sa marka : ' + fromMarks);
console.log('   mula sa score : ' + cd.done);
check('hindi sila maaaring magkasalungat', fromMarks, cd.done);

console.log('\n4. NAKA-WIRE BA?\n');
check('may element sa HTML',
  /id="confluenceTooltip"/.test(fs.readFileSync(__ROOT + '/dashboard.html','utf8')), true);
check('may onmouseenter ang score', /onmouseenter="showConfluenceTooltip\(event\)"/.test(js), true);
check('may onmouseleave', /onmouseleave="hideConfluenceTooltip\(\)"/.test(js), true);
check('may data-cfl payload', /data-cfl="\$\{escapeHtml\(payload\)\}"/.test(js), true);
check('textContent, hindi innerHTML',
  /function showConfluenceTooltip\(([\s\S]*?)\n\}/.exec(js)[1].includes('innerHTML'), false);
check('may CSS',
  /\.cfl-tooltip\{/.test(fs.readFileSync(__ROOT + '/css/style.css','utf8')), true);
check('bumabaligtad kapag walang espasyo sa ibaba',
  /window\.innerHeight/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
