const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Ang Pattern Type ay nakaupo sa SETUP; ang idinidikit galing exchange ay
   presyo lamang. Kapag hindi ito dinala ng bulk drawer, dalawang bagay ang
   nasisira nang tahimik:

     - iniwang blangko -> ang { ...parsed, ...answered } ay nagsusulat ng trade
       na walang pattern (kapareho ng nawalang leverage);
     - pumili ng iba -> ibinabasura ang confluence, dahil naka-imbak ito ayon sa
       posisyon sa checklist ng pattern na iyon.

   Pinapatakbo nito ang TUNAY na _openBulkJournalDrawer at binabasa kung anong
   prefill ang naiabot nito sa drawer. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };

const run = (setups, pastes) => new Function('SAVED_SETUPS', 'journalBulkPastes', `
  let drawerBulkTargets = null, captured = null;
  const openDrawer = (mode, id, prefill) => { captured = prefill; };
  ${fnBody('_openBulkJournalDrawer')}
  _openBulkJournalDrawer();
  return captured;
`)(setups, pastes);

// Ang paste ay presyo lamang — walang pattern, gaya ng tunay na exchange.
const paste = (sid, lev) => ({ setupId: sid,
  parsed: { symbol:'BTC', entry_price:69784, tp_price:71000, sl_price:69000, leverage:lev } });

console.log('1. PAREHO ANG PATTERN NG MGA SETUP\n');
let p = run(
  [{ id:1, pattern_type:'5 mins LH', trade_type:'Short' },
   { id:2, pattern_type:'5 mins LH', trade_type:'Short' }],
  [paste(1, 10), paste(2, 5)]);
ok('nadadala ang pattern_type mula sa setup', p.pattern_type === '5 mins LH', String(p.pattern_type));
ok('nadadala ang trade_type', p.trade_type === 'Short', String(p.trade_type));
ok('hindi nasisira ang galing sa paste', p.leverage === 10 && p.entry_price === 69784,
   'leverage=' + p.leverage);

console.log('\n2. MAGKAIBA ANG PATTERN — dapat blangko, siya ang pipili\n');
p = run(
  [{ id:1, pattern_type:'5 mins LH', trade_type:'Short' },
   { id:2, pattern_type:'1 hour LH', trade_type:'Short' }],
  [paste(1, 10), paste(2, 5)]);
ok('blangko ang pattern_type', !p.pattern_type, String(p.pattern_type));
ok('nadadala pa rin ang trade_type (pareho naman)', p.trade_type === 'Short', String(p.trade_type));

console.log('\n3. MAY SETUP NA HINDI MAHANAP — walang hulaan\n');
p = run(
  [{ id:1, pattern_type:'5 mins LH', trade_type:'Short' }],
  [paste(1, 10), paste(99, 5)]);
ok('blangko ang pattern_type', !p.pattern_type, String(p.pattern_type));

console.log('\n4. MAY PATTERN NA ANG PASTE — hindi ito dapat patungan\n');
p = run(
  [{ id:1, pattern_type:'5 mins LH', trade_type:'Short' },
   { id:2, pattern_type:'5 mins LH', trade_type:'Short' }],
  [{ setupId:1, parsed:{ symbol:'BTC', pattern_type:'30 mins Invalidation Play', leverage:10 } },
   paste(2, 5)]);
ok('nananaig ang paste', p.pattern_type === '30 mins Invalidation Play', String(p.pattern_type));

console.log('\n5. WALANG SETUP (walang na-tik) — hindi dapat bumagsak\n');
p = run([], [paste(1, 10)]);
ok('nakakabuo pa rin ng prefill', !!p && p.leverage === 10, JSON.stringify(p && p.leverage));
ok('blangko ang pattern_type', !p.pattern_type, String(p.pattern_type));

/* Ang paglaglag ng confluence kapag nagbago ang pattern ay SINADYA at may
   babala. Ang binabantayan lang dito ay nananatili ang dalawang bahagi noon —
   ang paghahambing at ang pagbibilang na nagpapakain sa toast. */
console.log('\n6. NANATILI ANG SINADYANG PAGLAGLAG\n');
const bulk = fnBody('_bulkJournalRows');
ok('may paghahambing pa rin ng pattern',
   /patternChanged\s*=\s*patch\.pattern_type\s*&&\s*setup\.pattern_type/.test(bulk));
ok('binibilang pa rin para sa babala', /confluenceDropped\+\+/.test(bulk));
ok('may babala sa user', /confluence cleared on/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
