const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
﻿// Does he have to fix anything by hand? Detect the trades whose stored
// confluence answers no longer match their own checklist, and check both the
// panel and the popup now agree about which answers are trustworthy.
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
function objBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
const CS = new Function(objBlock('CONFLUENCE_SETUPS') + ' return CONFLUENCE_SETUPS;')();

const API = new Function('CONFLUENCE_SETUPS', `
  ${grab('function _confluenceAnswerAt(')}
  ${grab('function _staleConfluenceItems(')}
  ${grab('function _selectCredit(')}
  ${grab('function _confluenceProgress(')}
  return { _confluenceAnswerAt, _staleConfluenceItems, _confluenceProgress };
`)(CS);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + '"' + got + '"' + (ok ? '' : '   <-- "' + want + '"'));
};

const KEY = 'Long|15 mins HL';
const items = CS[KEY].items;
const seqIdx = items.findIndex(it => it.select);
console.log('"15 mins HL": ' + items.length + ' na item, Sequence sa index ' + seqIdx + '\n');

// A healthy trade: every answer is something its own question accepts.
const healthy = { trade_type:'Long', pattern_type:'15 mins HL', confluence_answers:
  Object.fromEntries(items.map((it,i) => [i, it.select ? '2nd' : 'yes'])) };
// A trade carrying answers saved under a DIFFERENT checklist: "yes" landed on
// the Sequence slot and "3rd" on a yes/no slot.
const brokenAns = { ...healthy.confluence_answers, [seqIdx]:'yes', 0:'3rd' };
const broken = { trade_type:'Long', pattern_type:'15 mins HL', confluence_answers: brokenAns };

console.log('Ang malusog na trade:');
check('walang stale', API._staleConfluenceItems(healthy).length, 0);
check('nababasa ang sequence', API._confluenceAnswerAt(healthy, it => it.select), '2nd');

console.log('\nAng trade na napalitan ang pattern:');
const bad = API._staleConfluenceItems(broken);
bad.forEach(b => console.log('   index ' + b.i + '  ' + b.tag.padEnd(28) +
  'naka-imbak "' + b.got + '"  tinatanggap: ' + b.expected.join('/')));
check('dalawang stale', bad.length, 2);
check('hindi na binabasa ang sequence', API._confluenceAnswerAt(broken, it => it.select), 'null');

console.log('\nAno ang epekto sa score:');
const okScore = API._confluenceProgress(items, healthy.confluence_answers, true);
const badScore = API._confluenceProgress(items, broken.confluence_answers, true);
console.log('   malusog : ' + okScore.done.toFixed(1) + ' / ' + okScore.total);
console.log('   sira    : ' + badScore.done.toFixed(1) + ' / ' + badScore.total);
check('kulang ang score, hindi mali', badScore.done < okScore.done, true);
check('hindi nag-crash', Number.isFinite(badScore.done), true);

console.log('\nIsang kahulugan lang, ginagamit ng lahat:');
check('isang kahulugan lang', (js.match(/function _confluenceAnswerAt\(/g)||[]).length, 1);
// Tinanggal na ang Confluence Edge panel; ang Edge Map na ang bumabasa nito
// para sa Sequence at Entry trigger, at ang popup pa rin para sa mga sagot.
check('ginagamit ng Edge Map', /const answerBy = _confluenceAnswerAt/.test(js), true);
check('binabasa ang Sequence', /answerBy\(t, it => it\.select( && !it\.ui)?\)/.test(js), true);
check('binabasa ang Entry trigger',
  /answerBy\(t, it => it\.retest, \['yes','no','almost','retest'\]\)/.test(js), true);

console.log('\nAng babala ay nasa journal na, hindi sa tinanggal na panel:');
check('nasa _journalInvalidFields',
  /const staleAnswers = _staleConfluenceItems\(r\)/.test(js), true);
check('sinasabi kung ilan', /answer\$\{staleAnswers\.length===1\?'':'s'\} from a different checklist/.test(js), true);
check('iisang entry, hindi isa kada tanong', /label:'Confluence'/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
