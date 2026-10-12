const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* MOBILE — hinahanap ang mga bagay na HINDI KASYA sa makitid na screen.
   Hindi ito nagbubukas ng browser; hinahanap nito ang tatlong sanhi ng
   pahalang na pag-scroll, at bawat isa ay makikita sa CSS mismo:

     1. Naka-fix na px width na mas malaki sa screen (~360px)
     2. Grid na may minmax() na mas malaki sa screen — hindi bumabagsak sa
        isang hanay, kaya lumalampas
     3. Talahanayang may maraming hanay at walang stacking o overflow

   Ang huli ang pinakamadaling malimutan: gumagana ang table sa desktop at
   tahimik na lumalabas sa gilid sa telepono. */
const fs = require('fs');
const R = __ROOT + '/';
const css = fs.readFileSync(R + 'css/style.css', 'utf8');
const js  = fs.readFileSync(R + 'js/dashboard.js', 'utf8');
const html = fs.readdirSync(R).filter(f => f.endsWith('.html'))
  .map(f => fs.readFileSync(R + f, 'utf8')).join('\n');

const PHONE = 360;   // ang makitid na tunay na telepono
let fail = 0;
const check = (label, ok, detail) => {
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(52) + (detail ?? ''));
};

// Alisin ang komentaryo — ang mga halimbawang "460px" doon ay hindi rule.
const clean = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const lineOf = i => clean.slice(0, i).split('\n').length;

// Bawat rule bilang { sel, body, at } — kasama kung nasa media query ba.
const rules = [];
{
  const stack = [];
  let depth = 0;
  const re = /([^{}]*)\{|\}/g;
  let m;
  while((m = re.exec(clean))){
    if(m[0] === '}'){ depth--; if(stack.length && stack[stack.length-1].d >= depth) stack.pop(); continue; }
    const head = m[1].trim();
    if(head.startsWith('@')){ stack.push({ name: head, d: depth }); depth++; continue; }
    depth++;
    const end = (() => { let d = 1; for(let j = re.lastIndex; j < clean.length; j++){
      if(clean[j] === '{') d++; else if(clean[j] === '}'){ d--; if(!d) return j; } } return clean.length; })();
    rules.push({ sel: head, body: clean.slice(re.lastIndex, end),
                 at: stack.map(s => s.name).join(' '), i: m.index });
  }
}
console.log(rules.length + ' na CSS rule ang sinuri\n');

console.log('1. NAKA-FIX NA LAPAD NA HINDI KASYA SA ' + PHONE + 'px\n');
const wide = [];
rules.forEach(r => {
  // Ang naka-loob sa min-width media query ay para sa malaking screen.
  if(/min-width/.test(r.at)) return;
  const w = /(?:^|;|\s)width:\s*(\d+)px/.exec(r.body);
  if(!w) return;
  const px = +w[1];
  if(px <= PHONE) return;
  // May takas ba? max-width:100% o 92vw ay sumusuko sa makitid na screen.
  const escapes = /max-width:\s*(\d+%|min\(|\d+vw)/.test(r.body);
  if(escapes) return;
  wide.push({ sel: r.sel, px, line: lineOf(r.i) });
});
wide.forEach(w => console.log('  MALI L' + String(w.line).padEnd(6) + w.sel.slice(0, 40).padEnd(42) + w.px + 'px'));
check('walang naka-fix na lapad na lumalampas', wide.length === 0,
  wide.length ? wide.length + ' na rule' : '(wala)');

console.log('\n2. GRID NA HINDI BUMABAGSAK SA ISANG HANAY\n');
const grids = [];
rules.forEach(r => {
  if(/min-width/.test(r.at)) return;
  const g = /grid-template-columns:\s*([^;]+)/.exec(r.body);
  if(!g) return;
  const v = g[1];
  /* minmax(min(400px,100%),1fr) ay LIGTAS: ang min() ay bumabagsak sa 100%
     ng lalagyan sa makitid na screen. Ang minmax(400px,1fr) ay hindi —
     ang auto-fit ay nag-aalis ng walang lamang hanay, hindi nito pinapaliit
     ang minimum, kaya nananatiling 400px ito sa 360px na telepono. */
  if(/minmax\(\s*min\(/.test(v)) return;
  const mm = /minmax\(\s*(\d+)px/.exec(v);
  if(mm){
    if(/auto-fit|auto-fill/.test(v) && +mm[1] > PHONE) grids.push({ sel:r.sel, v, line:lineOf(r.i) });
    else if(!/auto-fit|auto-fill/.test(v)) grids.push({ sel:r.sel, v, line:lineOf(r.i) });
    return;
  }
  // Nakatakdang bilang ng hanay: repeat(7,1fr) ay ayos (kasya ang cell),
  // pero ang tatlo o higit na px/fr na hanay na may nilalaman ay panganib.
  const fixedPx = [...v.matchAll(/(\d+)px/g)].map(x => +x[1]);
  const total = fixedPx.reduce((a, b) => a + b, 0);
  if(total > PHONE) grids.push({ sel:r.sel, v, line:lineOf(r.i) });
});
grids.forEach(g => console.log('  MALI L' + String(g.line).padEnd(6) +
  g.sel.slice(0, 34).padEnd(36) + g.v.trim().slice(0, 44)));
check('lahat ng grid ay bumabagsak', grids.length === 0,
  grids.length ? grids.length + ' na grid' : '(wala)');

console.log('\n3. TALAHANAYAN NA WALANG PLANO SA TELEPONO\n');
// Bawat <table class="X"> sa JS/HTML, at ang X ba ay may stacking rule o
// nakabalot sa isang bagay na may overflow-x.
const tables = [...new Set([...(js + html).matchAll(/<table class="([\w-]+)"/g)].map(m => m[1]))];
tables.forEach(t => {
  const stacks = new RegExp('max-width[^{]*\\{[\\s\\S]{0,600}\\.' + t + '\\b[\\s\\S]{0,200}display:\\s*block').test(clean)
    || new RegExp('\\.' + t + '[^{]*\\{[^}]*display:\\s*block').test(clean);
  const scrolls = new RegExp('\\.' + t + '[^{]*\\{[^}]*overflow-x').test(clean)
    // o ang kanyang kahon: table-wrap, checklist-box, atbp.
    || new RegExp('\\.' + t + '-wrap[^{]*\\{[^}]*overflow').test(clean);
  const cols = (js + html).split('<table class="' + t + '"')[1] || '';
  const nth = (cols.slice(0, 900).match(/<th\b/g) || []).length;
  const ok = stacks || scrolls || nth <= 3;
  check('table.' + t + '  (' + nth + ' hanay)', ok,
    ok ? (stacks ? 'nag-i-stack' : scrolls ? 'may scroll' : 'kaunti lang ang hanay')
       : 'WALANG stacking o overflow-x');
});

console.log('\n4. ANG MGA BAGONG BAHAGI — may media query ba?\n');
// Ang mga idinagdag ngayong session. Ang bawat isa ay dapat may paraan para
// bumagsak: media query, auto-fit na grid, o flex-wrap.
[['rp-tbl',   'ang tatlong tanong'],
 ['sc-grid',  'setup check'],
 ['sc-head',  'setup check header'],
 ['yo-grid',  'year overview'],
 ['sx-grid',  'pattern/session cards'],
 ['grp-head', 'group header'],
 ['chk-cols', 'trade tags'],
 ['dx-s-cards','summary cards'],
 ['yo-stats', 'year stats'],
].forEach(([cls, what]) => {
  const own = rules.filter(r => new RegExp('\\.' + cls + '\\b').test(r.sel));
  const hasQuery = own.some(r => /max-width/.test(r.at));
  const flexWrap = own.some(r => /flex-wrap:\s*wrap/.test(r.body));
  const autoGrid = own.some(r => /auto-fit|auto-fill/.test(r.body));
  const ok = hasQuery || flexWrap || autoGrid;
  check('.' + cls.padEnd(12) + what.padEnd(24), ok,
    ok ? (hasQuery ? 'media query' : autoGrid ? 'auto-fit' : 'flex-wrap') : 'WALANG paraan para bumagsak');
});

console.log('\n5. ANG DASHBOARD HEADER\n');
// Apat na button at tatlong select sa isang hanay. Kailangan nitong mag-wrap.
const filters = rules.filter(r => /\.filters\b/.test(r.sel));
check('.filters ay nag-wa-wrap', filters.some(r => /flex-wrap:\s*wrap/.test(r.body)),
  filters.length ? '' : '(walang .filters na rule)');
const top = rules.filter(r => /^\s*(header\.top|\.top)\s*$/.test(r.sel) || /\.top\b/.test(r.sel));
check('header.top ay nag-wa-wrap',
  top.some(r => /flex-wrap:\s*wrap/.test(r.body)) || top.some(r => /max-width/.test(r.at)),
  top.length ? '' : '(walang .top na rule)');

console.log('\n' + (fail ? fail + ' MALI' : 'walang problema'));
process.exit(fail ? 1 : 0);
