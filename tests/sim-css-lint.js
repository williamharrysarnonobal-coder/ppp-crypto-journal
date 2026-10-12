const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG STRAY NA */ /* — ang bug na tahimik na lumalamon ng CSS.

   Nangyari ito sa akin: nagdagdag ako ng bagong paliwanag sa isang comment at
   naiwan ang LUMANG */ /* sa gitna. Ang resulta ay isang bloke ng hubad na
   prosa na nakaupo bilang CSS. Hindi ito error na makikita mo — nilalaktawan
   lang ng parser ang lahat hanggang sa makabawi ito, at kasama sa nalamon ang
   susunod na rule. Ang bar ay mukhang tama pa rin dahil may lumang rule pa sa
   itaas; ang bagong rule lang ang wala.

   At pumasa ito sa bilang ng brace, dahil ang bilang ay STRIP-comments muna —
   at ang maling comment ay nag-i-strip ng ibang saklaw kaysa sa nakikita ng
   browser. Kaya kailangan ng sariling pagsusuri nito.

   Dalawang tanong lang:
     1. Balanse ba ang bawat comment?
     2. May teksto bang nasa labas ng rule na hindi mukhang selector? */
const fs = require('fs');
const CSS = __ROOT + '/css/style.css';
const css = fs.readFileSync(CSS, 'utf8');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(46) + got + (ok ? '' : '   <-- ' + want));
};
const lineOf = idx => css.slice(0, idx).split('\n').length;

console.log('1. BALANSE BA ANG MGA COMMENT?\n');
/* Hindi lang pagbibilang ng /* at */ /* — ang nested na /* sa loob ng isang
   comment ay hindi bagong comment sa CSS, kaya ang bilang ay magsisinungaling.
   Nilalakad ko ito gaya ng parser: naghahanap ng pambukas, tapos ng unang
   pangsara pagkatapos niyon. */
const strayClose = [];
const unclosed = [];
{
  let i = 0;
  while(i < css.length){
    const open = css.indexOf('/*', i);
    // Bawat */ bago ang susunod na /* ay ligaw.
    const seg = css.slice(i, open === -1 ? css.length : open);
    let s = seg.indexOf('*/');
    while(s !== -1){ strayClose.push(lineOf(i + s)); s = seg.indexOf('*/', s + 2); }
    if(open === -1) break;
    const close = css.indexOf('*/', open + 2);
    if(close === -1){ unclosed.push(lineOf(open)); break; }
    i = close + 2;
  }
}
check('walang ligaw na pangsara', strayClose.length ? 'linya ' + strayClose.join(', ') : 'wala', 'wala');
check('walang hindi saradong comment', unclosed.length ? 'linya ' + unclosed.join(', ') : 'wala', 'wala');

console.log('\n2. MAY HUBAD NA PROSA BA SA LABAS NG RULE?\n');
/* Alisin ang comment nang tama, tapos tingnan ang bawat bagay na nasa labas ng
   { }. Ang bawat isa ay dapat mukhang selector o at-rule. Ang isang pangungusap
   na Tagalog ay hindi. */
let clean = '', i = 0;
while(i < css.length){
  const open = css.indexOf('/*', i);
  if(open === -1){ clean += css.slice(i); break; }
  clean += css.slice(i, open);
  const close = css.indexOf('*/', open + 2);
  if(close === -1) break;
  // Panatilihin ang mga bagong linya para tumugma ang bilang ng linya.
  clean += css.slice(open, close + 2).replace(/[^\n]/g, ' ');
  i = close + 2;
}

const bad = [];
{
  let depth = 0, buf = '', start = 0;
  for(let k = 0; k < clean.length; k++){
    const c = clean[k];
    if(c === '{'){
      if(depth === 0){
        const sel = buf.trim();
        /* Ang tanong ay hindi "wasto ba ang selector" kundi "prosa ba ito".
           Ang prosa ay may mga salitang pinaghihiwalay ng espasyo at walang
           kahit isang tanda ng selector. Ito ay maluwag nang sadya: ang mali
           dito ay isang pagsusuri na sumisigaw sa tamang CSS. */
        const looksLikeProse = sel.length > 24 &&
          !/[.#\[:>*]/.test(sel) && !/^@/.test(sel) &&
          sel.split(/\s+/).length > 4;
        if(looksLikeProse) bad.push({ line: lineOf(start), txt: sel.slice(0, 60) });
      }
      depth++; buf = ''; start = k + 1;
    }else if(c === '}'){
      depth--; buf = ''; start = k + 1;
    }else if(depth === 0){
      if(c === ';'){ buf = ''; start = k + 1; } else buf += c;
    }
  }
  // At ang natirang teksto pagkatapos ng huling rule.
  const tail = buf.trim();
  if(tail.length > 24 && !/[.#\[:>*]/.test(tail) && tail.split(/\s+/).length > 4){
    bad.push({ line: lineOf(start), txt: tail.slice(0, 60) });
  }
}
bad.forEach(b => console.log('     linya ' + b.line + ': "' + b.txt + '…"'));
check('walang prosa sa labas ng rule', bad.length, 0);

console.log('\n3. NAKAKAHULI BA ITO? (sinasadyang sinisira)\n');
/* Isang pagsusuri na hindi pa nabigo kahit kailan ay hindi pa napapatunayan.
   Ginagawa ko ang mismong pagkakamali sa isang kopya at tinitingnan kung
   nahuhuli ito. */
{
  const broken = css.replace(
    'ay ang tunay na taas.',
    'ay ang tunay na taas. */\n   Isang ligaw na linya ng paliwanag na dapat mahuli.');
  let sc = 0, j = 0;
  while(j < broken.length){
    const open = broken.indexOf('/*', j);
    const seg = broken.slice(j, open === -1 ? broken.length : open);
    let s = seg.indexOf('*/');
    while(s !== -1){ sc++; s = seg.indexOf('*/', s + 2); }
    if(open === -1) break;
    const close = broken.indexOf('*/', open + 2);
    if(close === -1) break;
    j = close + 2;
  }
  check('nahuhuli ang sinadyang ligaw na pangsara', sc > 0, true);
}

console.log('\n' + (fail ? fail + ' FAIL' : 'malinis ang CSS'));
process.exit(fail ? 1 : 0);
