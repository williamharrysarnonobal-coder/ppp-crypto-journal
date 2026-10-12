const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang hover na paliwanag sa Trade Tags, at ang buong listahan sa dalawang hanay.
//
// Ang mahalagang bantayan: ang bawat option ay may paliwanag. Ang isang bagong
// tag na walang TAG_HELP ay tahimik na lalabas na walang tooltip — walang
// magsasabi, at 'yon mismo ang tag na bago at hindi pa pamilyar.
const fs = require('fs');
const PATH = __ROOT + '/js/dashboard.js';
const js = fs.readFileSync(PATH, 'utf8');
const css = fs.readFileSync(__ROOT + '/css/style.css', 'utf8');
const core = require('./tag-core');

function grab(m){
  const i = js.indexOf(m);
  if(i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
function objBlock(name){
  const i = js.indexOf('const ' + name);
  if(i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1) + ';'; }
  }
}

const escapeHtml = new Function(grab('function escapeHtml(') + ' return escapeHtml;')();
const TAG_HELP = new Function(objBlock('TAG_HELP') + ' return TAG_HELP;')();
const boxes = new Function('escapeHtml', '_tagKind', 'TAG_HELP',
  grab('function _checklistBoxesHtml(') + ' return _checklistBoxesHtml;')(
  escapeHtml, core.API._tagKind, TAG_HELP);

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) + got + (ok ? '' : '   <-- ' + want));
};

const OPTS = core.API.UNFOLLOWED_RULES_OPTIONS;

console.log('1. BAWAT TAG AY MAY PALIWANAG\n');
const missing = OPTS.filter(o => !TAG_HELP[o]);
console.log('   ' + OPTS.length + ' na option, ' + Object.keys(TAG_HELP).length + ' na paliwanag');
check('walang tag na walang paliwanag',
  missing.length ? missing.join(', ') : '(wala)', '(wala)');
// At walang paliwanag na walang tag — ang lumang entry ay tahimik na basura.
const stray = Object.keys(TAG_HELP).filter(k => !OPTS.includes(k));
check('walang paliwanag na walang tag',
  stray.length ? stray.join(', ') : '(wala)', '(wala)');

console.log('\n2. LUMALABAS BA ITO SA MARKUP?\n');
const html = boxes('unfollowed_rules', OPTS, []);
const titled = (html.match(/<label title="/g) || []).length;
console.log('   ' + titled + ' sa ' + OPTS.length + ' na label ang may title');
check('lahat may title', titled, OPTS.length);
check('nasa label, hindi sa checkbox', /<label title="[^"]+"><input/.test(html), true);

// Ang apat na invalidation ay magkakaiba LAMANG sa kung paano nauwi ang trade,
// kaya doon pinaka-kailangan ang paliwanag.
['Held Through Invalidation','Ego Hold Despite Invalidation',
 'Cut on Invalidation','Cut Too Early'].forEach(t => {
  const h = TAG_HELP[t];
  check(t.padEnd(32) + ' may paliwanag', !!h && h.length > 30, true);
});
check('sinasabi ng "Held" na TAMA ang paghawak', /Holding was right/.test(TAG_HELP['Held Through Invalidation']), true);
check('sinasabi ng "Ego Hold" na MALI', /Holding was wrong/.test(TAG_HELP['Ego Hold Despite Invalidation']), true);
check('sinasabi ng "Cut on" na TAMA', /Cutting was right/.test(TAG_HELP['Cut on Invalidation']), true);
check('sinasabi ng "Cut Too Early" na MALI', /Cutting was wrong/.test(TAG_HELP['Cut Too Early']), true);

console.log('\n3. ANG DALAWANG HANAY\n');
check('may chk-cols na balot', /<div class="chk-cols">/.test(html), true);
check('dalawang grupo pa rin', (html.match(/chk-group-head/g) || []).length, 2);
check('CSS: grid ang chk-cols', /\.chk-cols\{[^}]*grid-template-columns:repeat\(auto-fill/.test(css), true);
// Inalis ang 160px na scroller para sa Trade Tags lang — buo na ang listahan.
check('inalis ang cap para sa Trade Tags',
  /\.checklist-box\[data-checklist-for="unfollowed_rules"\]\{max-height:none/.test(css), true);
check('may cap pa rin ang ibang checklist',
  /\.checklist-box\{[^}]*max-height:160px/.test(css), true);

console.log('\n4. ANG IBANG CHECKLIST AY WALANG TITLE\n');
// Ang TAG_HELP ay para sa Trade Tags lang; ang ibang checklist ay hindi dapat
// makakuha ng maling paliwanag dahil lang magkapareho ang pangalan.
const other = boxes('some_other_field', ['Overleveraged', 'Revenge Trade'], []);
check('walang title sa ibang field', /<label title=/.test(other), false);
check('walang grupo rin', /chk-group/.test(other), false);

console.log('\n5. ANG ESCAPE\n');
const ap = boxes('unfollowed_rules', ["Would Have BE'd Out"], []);
check('naka-escape ang apostrophe sa title', /title="[^"]*&#39;[^"]*"/.test(ap) || !/title="[^"]*'[^"]*"/.test(ap), true);
check('hindi sumisira sa attribute', (ap.match(/<label title="/g) || []).length, 1);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
