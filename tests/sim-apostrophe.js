const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// The new label carries an apostrophe. Prove it survives the round trip:
// escaped into the attribute, decoded back by the browser on .value read.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function grab(marker){
  const i = js.indexOf(marker);
  if (i < 0) throw new Error('missing: ' + marker);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

// The app's own escapeHtml, not a rewrite of it.
const escapeHtml = new Function(grab('function escapeHtml(') + ' return escapeHtml;')();
// Naka-grupo na ang Trade Tags sa Rule / Hindi rule, kaya kailangan na rin
// nito ng _tagKind — ang mismong function na nagdedesisyon kung alin ang alin.
const core = require('./tag-core');
// May hover na paliwanag na rin ang bawat tag, kaya kailangan din ng TAG_HELP.
function objBlock(name){
  const i = js.indexOf('const ' + name); let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++; else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j+1) + ';'; }
  }
}
const TAG_HELP = new Function(objBlock('TAG_HELP') + ' return TAG_HELP;')();
const boxes = new Function('escapeHtml', '_tagKind', 'TAG_HELP',
  grab('function _checklistBoxesHtml(') + ' return _checklistBoxesHtml;')(
  escapeHtml, core.API._tagKind, TAG_HELP);

const TAG = "Would Have BE'd Out";
const html = boxes('unfollowed_rules', [TAG], [TAG]);
console.log('markup:');
console.log('  ' + html.trim());

// Pull the attribute back out and decode it the way a browser would.
const m = /value="([^"]*)"/.exec(html);
const decoded = m[1]
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

console.log('\n  sa attribute : ' + m[1]);
console.log('  binasa bilang: ' + decoded);
console.log('  orihinal     : ' + TAG);
const ok = decoded === TAG;
console.log('  ' + (ok ? 'PASS — buo ang apostrophe' : 'FAIL'));

// And that the attribute never breaks out of its own quotes.
//
// The old test was "no second quoted thing after value=", which read a
// perfectly legitimate second attribute as a break-out — it started failing the
// moment the checkbox gained an onchange. The property that actually matters is
// narrower: whatever sits inside value="..." must contain no raw double quote.
const safe = (() => {
  const m = /value="([^"]*)"/.exec(html);
  if(!m) return false;
  // every attribute in the tag parses cleanly as name="value"
  const tag = /<input\b[^>]*>/.exec(html)[0];
  const attrs = tag.slice(6, -1).match(/[\w-]+(="[^"]*")?/g) || [];
  const rebuilt = attrs.join(' ').replace(/\s+/g, ' ').trim();
  return !m[1].includes('"') && rebuilt.length > 0;
})();
console.log('  ' + (safe ? 'PASS — hindi sumisira sa attribute' : 'FAIL — may lumabas na quote'));
console.log('  naka-tik: ' + (/\bchecked\b/.test(html) ? 'oo' : 'HINDI'));

process.exit(ok && safe && /\bchecked\b/.test(html) ? 0 : 1);
