const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* RULES FOLLOWED? — SIMPLE NA: Yes = berde, No = pula.

   "Yung color ng Rules followed? natin green and red lang kapag ka No red agad
   kapag ka green yes ganun lang simple lang." Ang orange at asul ay nagsasabi
   ng mga note — sa Trade Tags na iyon nakikita, hindi sa kulay ng Yes. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
const i = js.indexOf("if(key === 'rules_followed'){");
const branch = (() => { let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++; else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  } })();
const colorFor = new Function('key', 'row', 'v', 'lower', '_box', branch + ' return null;');
const color = (ans, tags) => colorFor('rules_followed', { unfollowed_rules: tags }, ans,
  String(ans || '').toLowerCase(), cls => cls);

let fail = 0;
const ok = (l, got, want) => { const c = got === want; if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + got + (c ? '' : '   <-- ' + want)); };

ok('Yes · Rules Followed',              color('Yes', 'Rules Followed'), 'box-solid-win');
ok('Yes · Chased Extended Move',        color('Yes', 'Chased Extended Move'), 'box-solid-win');
ok('Yes · No BE at Prev High/Low',      color('Yes', 'No BE at Prev High/Low'), 'box-solid-win');
ok('Yes · TP area was just right',      color('Yes', 'TP area was just right'), 'box-solid-win');
ok('Yes · (walang tag)',                color('Yes', ''), 'box-solid-win');
ok('No · FOMO Entry',                   color('No', 'FOMO Entry'), 'box-solid-loss');
ok('No · (walang tag)',                 color('No', ''), 'box-solid-loss');
ok('walang orange sa Rules Followed',   /box-solid-warn/.test(branch), false);
ok('walang asul sa Rules Followed',     /box-solid-info/.test(branch), false);
console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
