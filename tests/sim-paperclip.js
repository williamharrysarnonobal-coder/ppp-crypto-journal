const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Ang cell ng journal ay `overflow:hidden` na may `text-overflow:ellipsis`. Ang
   ellipsis na iyon ay para lamang sa hubad na teksto sa loob mismo ng cell —
   hindi ito umaabot sa isang inline-block na anak. Kaya ang isang pill na mas
   malapad kaysa sa cell ay pinuputol sa gitna ng salita nang walang anumang
   tanda na may nawawala. Ganoon nawala ang dulo ng "Already extended — missed
   the entry".

   Ang lunas ay ang klaseng `paper-why-col`: pinapayagan nito ang cell na
   bumalot. Dalawang bagay ang kailangan nito at pareho silang tahimik kung
   nawala — dito sila binabantayan. */
const fs = require('fs');
// Napapalitan para masubok ang mismong pagsubok laban sa sinadyang sira.
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js  = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

let fail = 0;
const ok = (label, cond, extra) => { if (!cond) fail++;
  console.log('  ' + (cond ? 'ok   ' : 'MALI ') + label.padEnd(52) + (extra || '')); };

// Ang katawan ng renderPaperTable.
const i = js.indexOf('function renderPaperTable(');
if (i < 0) { console.log('MALI: nawawala ang renderPaperTable'); process.exit(1); }
let d = 0, body = '';
for (let j = js.indexOf('{', i); j < js.length; j++) {
  if (js[j] === '{') d++;
  else if (js[j] === '}') { d--; if (!d) { body = js.slice(i, j + 1); break; } }
}

/* 1. Ang klase ay dapat nasa dalawa. Ang `th` lang ang mayroon noon — kaya nga
      may min-width ang column pero pinuputol pa rin ng CELL ang laman nito. */
const onTh = /<th\$\{c\.wide \? ' class="paper-why-col"' : ''\}/.test(body);
const onTd = /<td\$\{c\.wide \? ' class="paper-why-col"' : ''\}/.test(body);
ok('may paper-why-col ang <th>', onTh);
ok('may paper-why-col ang <td>', onTd,
   onTd ? '' : 'ito mismo ang bug — sa th lang ito noon');

/* 2. Bawat column na naglalabas ng pill ay dapat `wide`. Ang pill ay
      inline-block: kapag hindi bumabalot ang column, walang makakapigil sa
      pagkakaputol at walang ellipsis na magsasabi nito. */
const concat = body.slice(body.indexOf('.concat(['));
const objs = [];
let depth = 0, start = -1;
for (let j = concat.indexOf('['); j < concat.length; j++) {
  if (concat[j] === '{') { if (!depth) start = j; depth++; }
  else if (concat[j] === '}') { depth--; if (!depth) objs.push(concat.slice(start, j + 1)); }
  else if (concat[j] === ']' && !depth) break;
}
ok('nahanap ang mga column na may pill', objs.length >= 2, objs.length + ' column');
objs.forEach(o => {
  const name = (/\bk:\s*'([^']+)'/.exec(o) || [, '?'])[1];
  const pill = /class="paper-(why|out)/.test(o);
  if (!pill) return;
  ok('"' + name + '" ay bumabalot (wide)', /\bwide:\s*true\b/.test(o));
});

/* 3. Ang CSS mismo. Kung mawala ang `white-space:normal`, ang klase ay wala
      nang silbi — mananatili ang nowrap na minana sa table.journal. */
const rule = /table\.journal (?:th|td)\.paper-why-col[\s\S]{0,220}?\{([^}]*)\}/.exec(css);
ok('may panuntunan ang paper-why-col sa CSS', !!rule);
ok('binabaligtad nito ang nowrap', !!rule && /white-space\s*:\s*normal/.test(rule[1]),
   rule ? '' : '');
ok('may max-width pa rin (hindi lalamon ng talahanayan)',
   !!rule && /max-width\s*:\s*\d+px/.test(rule[1]));

/* 4. Ang mismong dahilan kung bakit walang ellipsis: pill ang laman. Kung
      babalik balang araw sa hubad na teksto ang column, mababawi ang ellipsis
      at hindi na kailangan ang lahat ng ito — pero hangga't pill, kailangan. */
ok('ang cell ng journal ay nagtatago pa rin ng umaapaw',
   /table\.journal td\{[^}]*overflow\s*:\s*hidden/.test(css.replace(/\s*\n\s*/g, '')),
   'kaya nga kailangan ng bumabalot na column');

/* 5. Ang bawat grupo sa listahan ng dahilan ay may katumbas na kulay ng pill.
      Ang ikaapat na grupo ("read") ay naidagdag nang walang .paper-why.read,
      kaya kulay-abo ang lumalabas sa talahanayan habang may sariling kulay ang
      rail nito sa form.

      Ang mga grupo ng RESULTA ay may sariling pamilya (.paper-out), kaya ang
      listahan ng dahilan lang ang kinukuha rito — hindi lahat ng `kind:`. */
const gStart = js.indexOf('const NO_TRADE_REASON_GROUPS');
let gd = 0, gsrc = '';
for (let j = js.indexOf('[', gStart); j < js.length; j++) {
  if (js[j] === '[') gd++;
  else if (js[j] === ']') { gd--; if (!gd) { gsrc = js.slice(gStart, j + 1); break; } }
}
const gk = [...new Set([...gsrc.matchAll(/kind:\s*'(\w+)'/g)].map(m => m[1]))];
ok('may grupo talagang nahanap', gk.length >= 4, gk.join(', '));
gk.forEach(k => ok('may kulay ang pill para sa "' + k + '"',
  new RegExp('\\.paper-why\\.' + k + '\\s*\\{').test(css)));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
