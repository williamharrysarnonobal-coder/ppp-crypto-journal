const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// SAAN NAKATIRA ANG BAWAT RULE — hindi kung ano ang laman nito.
//
// Ito ang naghuli sa bug na tatlong beses kong sinabing naayos na: lahat ng
// .cal-goal* ay nakabaon sa loob ng @media(max-width:900px), dahil ang mga
// insert ko ay naka-anchor sa .cal-total-summary na nasa loob pala niyon.
// Mobile lang lumalabas ang estilo; sa desktop ay hubad na SVG at hubad na
// teksto ang natira — eksakto ang nasa screenshot.
//
// Walang ibang check ang nakakakita nito. Balanse ang brace. Existe ang klase
// sa CSS. Tama ang teksto ng rule na hinahanap ng mga sim. Ang tanging tanong
// na nagbubunyag nito ay KUNG SAAN NAKAULAT ANG RULE.
const fs = require('fs');
const css = fs.readFileSync(
  __ROOT + '/css/style.css', 'utf8');

// Alisin ang komentaryo para hindi mabilang ang brace sa loob ng /* ... */
const clean = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

// Buuin ang stack ng at-rule sa bawat posisyon.
const stack = [];
const openAt = [];       // { name, depth }
let depth = 0;
const atAt = new Array(clean.length).fill(null);

for(let i = 0; i < clean.length; i++){
  if(clean[i] === '@'){
    const m = /^@[\w-]+[^{;]*/.exec(clean.slice(i));
    if(m){
      const brace = clean.indexOf('{', i);
      const semi  = clean.indexOf(';', i);
      // Isang at-rule na may block (@media/@supports), hindi @import.
      if(brace > -1 && (semi === -1 || brace < semi)){
        openAt.push({ name: m[0].replace(/\s+/g, ' ').trim().slice(0, 46), atDepth: depth });
      }
    }
  }
  if(clean[i] === '{') depth++;
  else if(clean[i] === '}'){
    depth--;
    while(openAt.length && openAt[openAt.length - 1].atDepth >= depth) openAt.pop();
  }
  atAt[i] = openAt.length ? openAt.map(o => o.name).join(' > ') : '';
}

const lineOf = i => clean.slice(0, i).split('\n').length;

/* Hindi lahat ng at-rule ay masama. Ang prefers-reduced-motion, prefers-color-
   scheme at print ay SADYANG naka-kondisyon — doon nga sila dapat. Ang
   nakakapatay ay ang viewport-width na media query: kung nakabaon doon ang
   pangunahing estilo, mobile lang ito lalabas at hubad ang elemento sa
   desktop — na siyang eksaktong nangyari sa Salary goal bar. */
const isHarmful = at => /max-width|min-width/.test(at);

/* Ang nasa viewport media query ay HINDI awtomatikong mali. Ang mobile
   override ay nararapat nga doon. Ang tunay na sira noon ay iba: ang buong
   .cal-goal ay nasa loob ng @media(max-width:900px) at WALA itong base rule sa
   labas — kaya sa desktop ay walang kahit anong estilo ang tumatama.

   Kaya ang tanong ay hindi "nasa media query ba", kundi "may base rule ba ito
   sa labas". Kung meron, override 'yon. Kung wala, nawawala ang elemento sa
   kalahati ng mundo. */
function hasBaseRule(selector){
  // Kunin ang mga klase sa selector at tingnan kung may top-level na rule
  // ang kahit alin sa kanila.
  const names = [...selector.matchAll(/\.[\w-]+/g)].map(m => m[0]);
  if(!names.length) return true;
  return names.some(n => {
    const re = new RegExp('(^|\\n)\\s*[^\\n{}]*' + n.replace('.', '\\.') + '[^\\n{}]*\\{', 'g');
    let mm;
    while((mm = re.exec(clean))){
      if(!atAt[mm.index]) return true;   // top level
    }
    return false;
  });
}

/* ---------------------------------------------------------------------------
   ANG LAYOUT NA NAKABAON SA prefers-reduced-motion.

   Ang isHarmful() sa itaas ay sinasadyang hindi pinapansin ang reduced-motion,
   dahil ang mga rule doon ay TAMANG naka-kondisyon — animation:none at wala nang
   iba. Ngunit dahil doon ay may butas: nang ilipat ko ang buong bagong hugis ng
   slider at na-anchor ito sa `.cal-goal-track b{transition:none;}` — na nasa
   LOOB pala ng reduced-motion na bloke — ang lahat ng 40px na taas, ang posisyon
   ng knob at ang bula ay tahimik na namatay. Sinabi ng checker na "lahat nasa
   top level" at pumasa nang malinis habang wala ni isa sa kanila ang tumatakbo.

   Ang panuntunan ay simple at matibay: ang prefers-reduced-motion ay para sa
   PAGPAPATIGIL NG GALAW. Ang isang height, top, left, width o padding sa loob
   nito ay hindi kailanman sinadya — walang layout na dapat magbago dahil lang
   ayaw ng tao ng animation. */
console.log('Layout na nakabaon sa prefers-reduced-motion:\n');
let motionLayout = 0;
{
  const LAYOUT = /(?:^|[;{\s])(height|width|top|left|right|bottom|padding|margin|transform|position)\s*:/;
  const re0 = /(^|\n)\s*([^\n{}]*)\{([^{}]*)\}/g;
  let m0;
  while((m0 = re0.exec(clean))){
    const at = atAt[m0.index] || '';
    if(!/prefers-reduced-motion/.test(at)) continue;
    const body = m0[3];
    // Ang transform ay minsan bahagi ng animation reset, kaya ito lang ay hindi
    // sapat — pero kasama ng isang tunay na sukat ay palatandaan ito.
    const hit = LAYOUT.exec(body);
    if(!hit) continue;
    if(/^(transform|position)$/.test(hit[1]) && !/(height|width|top|left|right|bottom|padding|margin)\s*:/.test(body)) continue;
    motionLayout++;
    console.log('  L' + String(lineOf(m0.index)).padEnd(6) +
      m0[2].trim().slice(0, 42).padEnd(44) + hit[1] + ' — patay maliban kung ayaw ng galaw');
  }
}
console.log(motionLayout
  ? '  ' + motionLayout + ' na rule ang naglalagay ng LAYOUT sa loob ng reduced-motion'
  : '  wala — galaw lang ang nasa loob nito, gaya ng nararapat');

console.log('\nPanel rules (.cal-goal, .cal-h2, .dx-, .sx-, .yo-) — saan nakatira:\n');
let buried = 0, total = 0, conditional = 0;
const re = /(^|\n)\s*([^\n{}]*\.(?:cal-goal|cal-h2|dx-|sx-|yo-)[^\n{}]*)\{/g;
let m;
while((m = re.exec(clean))){
  const at = atAt[m.index] || '';
  const bad = at && isHarmful(at) && !hasBaseRule(m[2]);
  total++;
  if(at && !bad) conditional++;
  if(bad){
    buried++;
    console.log('  L' + String(lineOf(m.index)).padEnd(6) +
      ('NAKABAON SA: ' + at).padEnd(46) + m[2].trim().slice(0, 44));
  }
}
console.log('  ' + total + ' na rule ang sinuri, ' + conditional +
  ' ang sadyang naka-kondisyon (reduced-motion at iba pa).');

console.log('\n' + (buried
  ? buried + ' na rule ang nakabaon sa viewport media query — hindi umaabot sa desktop.'
  : 'lahat nasa top level'));

// Ganoon din ang tanong para sa Year overview.
/* Ang .yo-* ay nasa pangunahing loop na sa itaas — ang seksyong ito ay
   naiwan mula noong .cal-goal lang ang sinusuri, at hindi ito dumaan sa
   isHarmful() kaya nagrereklamo ito sa prefers-reduced-motion na tama naman.
   Ganoon din ang panuntunan dito ngayon. */
console.log('\nAng .yo-* naman:\n');
let buriedYo = 0;
const re2 = /(^|\n)\s*([^\n{}]*\.yo-[^\n{}]*)\{/g;
while((m = re2.exec(clean))){
  const at = atAt[m.index] || '';
  if(at && isHarmful(at) && !hasBaseRule(m[2])){
    buriedYo++;
    console.log('  L' + lineOf(m.index) + '  NAKABAON: ' + at + '  ' + m[2].trim().slice(0, 40));
  }
}
console.log(buriedYo ? '  ' + buriedYo + ' nakabaon' : '  lahat nasa top level');

/* ---------------------------------------------------------------------------
   GINAGAMIT PERO HINDI NAKATAKDA.

   Pangalawang bitag na hindi nakikita ng ibang check. Nang isulat kong muli
   ang Salary goal bar, nadala ko ang lahat ng gumagamit ng --gt pero naiwan
   ang APAT na linyang nagtatakda nito. Walo ang gumagamit; wala ni isa ang
   may laman. Tahimik na bumagsak ang lahat sa fallback na var(--muted), at
   naging abo ang buong bar — habang balanse ang brace, existe ang lahat ng
   klase, at pumapasa ang bawat sim.

   Ang isang custom property ay HINDI kailangang nakatakda sa parehong rule —
   minamana ito. Kaya sapat na ang tanong: may kahit isang rule ba sa buong
   stylesheet na nagtatakda nito? Kung wala, ang fallback lang ang totoong
   halaga, at malamang hindi 'yon ang balak. */
console.log('\nMga custom property na ginagamit ng panel — may nagtatakda ba?\n');
let unset = 0;
const consumed = new Set();
for(const mm of clean.matchAll(/var\(\s*(--[\w-]+)/g)){
  const name = mm[1];
  // Ang :root na token (--win, --loss, --accent...) ay may sariling tirahan.
  if(new RegExp(':root[\\s\\S]{0,2000}' + name + '\\s*:').test(clean)) continue;
  consumed.add(name);
}
// Hindi lahat ng nagtatakda ay nasa stylesheet. Ang --p (posisyon ng pill) at
// ang --m-tone (kulay ng buwan sa Salary page) ay isinusulat ng JS bilang
// inline style, at 'yon ay tama — dynamic ang halaga nila. Kaya kasama rin
// ang JS sa paghahanap, kung hindi ay magrereklamo ito sa dalawang gumaganang
// bagay at matututo akong huwag pansinin ang tunay na babala.
const jsSrc = fs.readFileSync(
  __ROOT + '/js/dashboard.js', 'utf8');

for(const name of consumed){
  const set = new RegExp('[{;]\\s*' + name + '\\s*:').test(clean)
           || new RegExp('style="[^"]*' + name + '\\s*:').test(jsSrc)
           || new RegExp("'[^']*" + name + "\\s*:").test(jsSrc);
  if(!set){
    unset++;
    console.log('  WALANG NAGTATAKDA: ' + name +
      '  (' + (clean.match(new RegExp('var\\(\\s*' + name, 'g')) || []).length + ' gumagamit)');
  }
}
console.log(unset ? '' : '  lahat ng ginagamit ay may nagtatakda ('
  + consumed.size + ' na property na hindi :root token)');

process.exit(buried || buriedYo || unset || motionLayout ? 1 : 0);
