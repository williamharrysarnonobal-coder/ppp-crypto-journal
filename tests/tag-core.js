const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang klasipikasyon ng Trade Tags, hinuhugot mula sa TUNAY na dashboard.js.
// Isang lugar lang, para kapag nagbago ang code ay sabay-sabay na sumusunod ang
// lahat ng sim — hindi na kailangang tandaan ng bawat isa ang listahan.
//
//   SRC  — ang source text, para i-interpolate sa loob ng new Function(...)
//   API  — ang na-evaluate nang mga helper, para gamitin nang diretso
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function arrBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0;
  for (let j = js.indexOf('[', i); j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(i, j+1) + ';'; }
  }
}
// Brace-matched, then extended to the ";". A naive scan for the first ";" cuts
// through the semicolons inside a multi-line arrow body.
function declBlock(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  let d = 0, j = js.indexOf('{', i);
  for (; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) break; }
  }
  return js.slice(i, js.indexOf(';', j) + 1);
}
function oneLine(name){
  const i = js.indexOf('const ' + name);
  if (i < 0) throw new Error('missing: ' + name);
  return js.slice(i, js.indexOf('\n', i));
}
function span(fromName, toName){
  return js.slice(js.indexOf('const ' + fromName), js.indexOf('const ' + toName));
}
// `function name(...)` — brace-matched, no trailing ";" to chase.
function fnBlock(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing fn: ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

const SRC = [
  arrBlock('UNFOLLOWED_RULES_OPTIONS'),
  arrBlock('TAG_OBSERVATIONS'),
  arrBlock('TAG_SENTINELS'),
  declBlock('TAG_ALIASES'),
  declBlock('TAG_RETIRED'),
  oneLine('_tagRetiredNote'),
  fnBlock('_canonicalTags'),
  span('_TAG_OBSERVATION_SET', '_tagKind'),
  declBlock('_tagKind'),
  arrBlock('RULE_GROUPS'),
  declBlock('RETIRED_TAG_GROUP'),
  declBlock('_RULE_GROUP_OF'),
  declBlock('_ruleGroupOf'),
  oneLine('_ruleTags'),
  oneLine('_brokenRuleTags'),
  declBlock('_isCleanRules'),
  // Kailangan nito ang _confluenceScoreFor at DEFAULT_MIN_CONFLUENCE_PCT mula
  // sa tumatawag — hindi ito ini-evaluate hangga't hindi tinatawag.
  fnBlock('_deriveRulesFollowed'),
].join('\n');

const NAMES = ['TAG_ALIASES','TAG_RETIRED','_tagRetiredNote','RETIRED_TAG_GROUP','_canonicalTags','UNFOLLOWED_RULES_OPTIONS','TAG_OBSERVATIONS','TAG_SENTINELS',
  '_tagKind','RULE_GROUPS','_ruleGroupOf',
  '_ruleTags','_brokenRuleTags','_isCleanRules','_deriveRulesFollowed'];

const API = new Function(SRC + '\nreturn {' + NAMES.join(',') + '};')();

module.exports = { SRC, NAMES, API, js, arrBlock, declBlock, fnBlock, oneLine, span };
