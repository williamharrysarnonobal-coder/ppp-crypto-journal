const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG PATTERN TYPE AY ITINAKDA NA NIYA — HINDI NA DAPAT ITANONG ULIT.

   Sa Confluence modal niya itinatakda ang Trade Type at Pattern Type, at doon
   din nakakabit ang mga sagot. Pagkatapos noon ay hinihingi ulit ng drawer ang
   parehong dalawa, dahil ang idinidikit mula sa exchange ay presyo lamang.

   Hindi lang iyon dagdag na trabaho. Ang mga sagot ay naka-imbak ayon sa
   POSISYON sa checklist ng pattern na iyon, kaya ang ibang pagpili rito ay
   tahimik na nagtatapon sa kanila — at ang pinakamadaling pagkakamali sa buong
   daan ay ang pagpindot ng maling pattern sa isang kahon na hindi naman dapat
   blangko. */
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
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

const SETUPS = [
  { id: 1, trade_type:'Short', pattern_type:'1 hour LH',
    confluence_answers:{ 0:'yes', 1:'yes' } },
  { id: 2, trade_type:null, pattern_type:null },
];

const merge = new Function('SAVED_SETUPS',
  fnBody('_mergeSetupFieldsIntoPrefill') + ' return _mergeSetupFieldsIntoPrefill;')(SETUPS);

console.log('1. ANG BLANGKONG KAHON AY NAPUPUNAN\n');
/* Ang idinidikit mula sa exchange: presyo at leverage. Walang pattern —
   hindi alam ng broker ang pattern. */
let p = merge({ symbol:'BTC', entry_price:69784, leverage:10 }, 1);
console.log('   ' + JSON.stringify(p));
ok('nakuha ang pattern_type', p.pattern_type === '1 hour LH', String(p.pattern_type));
ok('nakuha ang trade_type', p.trade_type === 'Short', String(p.trade_type));
ok('hindi nagalaw ang galing sa paste', p.entry_price === 69784 && p.leverage === 10);

console.log('\n2. ANG NAKUHA SA PASTE ANG NANANAIG\n');
/* Kung may nabasa ang parser sa idinikit, iyon ang totoong pumasok — ang
   broker ang nagsasabi niyon, hindi ang plano. */
p = merge({ trade_type:'Long', pattern_type:'5 mins HL', symbol:'BTC' }, 1);
ok('hindi pinapatungan ang paste', p.pattern_type === '5 mins HL' && p.trade_type === 'Long',
   p.trade_type + ' / ' + p.pattern_type);

console.log('\n3. WALANG MAKUKUHA\n');
p = merge({ symbol:'BTC' }, 2);
ok('walang laman ang setup -> walang idinagdag', !p.pattern_type && !p.trade_type);
p = merge({ symbol:'BTC' }, 999);
ok('hindi kilalang setup -> hindi sumasabog', p && p.symbol === 'BTC');
p = merge({ symbol:'BTC' }, null);
ok('walang setup id -> hindi sumasabog', p && p.symbol === 'BTC');
ok('walang prefill -> hindi sumasabog', merge(null, 1) === null);

console.log('\n4. NAKA-WIRE BA SA TATLONG DAAN?\n');
/* Tatlo ang daan patungo sa isang naitalang trade, at ang tatlo ay dapat
   magdala ng parehong dalawang field — kung isa lang ang nakalimutan, doon
   babalik ang pagkawala ng confluence. */
ok('isahang daan (Easy Add -> drawer)',
   /_mergeSetupFieldsIntoPrefill\(parsed, pendingJournalSetupId\)/.test(js));
const save = fnBody('saveDrawer');
ok('huling harang sa saveDrawer',
   /\['trade_type', 'pattern_type'\]\.forEach\(k => \{\s*if\(!patch\[k\] && linkedSetup\[k\]\)/.test(save));
const bulk = fnBody('_bulkJournalRows');
ok('bulk run — trade type', /if\(setup && !patch\.trade_type && setup\.trade_type\)/.test(bulk));
ok('bulk run — pattern type', /if\(setup && !patch\.pattern_type && setup\.pattern_type\)/.test(bulk));
/* Ang pattern ay HULI sa lahat ng cascade nang sadya: ang "Invalidation Play"
   na katatapos niyang piliin ay may iisang tamang pattern, at dapat manalo iyon
   sa lumang pattern ng setup. Dito ako nadapa — kinuha ng pagpuno ang pattern
   ng setup bago pa magamit ang default ng Invalidation Play. */
ok('ang pattern ay huli sa Invalidation Play',
   bulk.indexOf("if(setup && !patch.pattern_type") > bulk.indexOf("=== 'Invalidation Play'"),
   'kung mauuna, tatalo ang lumang pattern sa katatapos niyang pili');
/* Ang paper ay dumadaan sa journalFromSetup, na matagal nang nagpapasa ng
   pattern_type sa prefill nito. */
ok('paper (journalFromSetup)', /pattern_type: s\.pattern_type \|\| undefined/.test(js));

console.log('\n5. NANANATILI ANG SINADYANG PAGLAGLAG\n');
/* Kung SINADYA niyang ibahin ang pattern, itinatapon pa rin ang confluence —
   pero may tanong na ngayon bago iyon mangyari. Ang pagpuno ng blangko ay
   hindi dapat makapagpatahimik sa harang na iyon. */
ok('may paghahambing pa rin ng pattern',
   /patternChanged\s*=\s*patch\.pattern_type\s*&&\s*setup\.pattern_type/.test(bulk));
/* Ang unang bersyon ko rito ay iginigiit na dapat MAUNA ang pagpuno sa
   paghahambing. Mali ang katwiran, hindi ang code: ang pagpuno ay bumabasa
   lamang ng BLANGKO, kaya hindi nito kayang magpanggap na hindi nagbago ang
   isang bagay na sinadya niyang baguhin. Ang alinmang ayos ay nagbibigay ng
   parehong sagot — ito ang mahalaga, at ito ang sinusuri. */
ok('ang pagpuno ay para lang sa blangko',
   /!patch\.trade_type && setup\.trade_type/.test(bulk) &&
   /!patch\.pattern_type && setup\.pattern_type/.test(bulk));
ok('humihinto pa rin bago bumura', /erase the confluence on/.test(js));

console.log('\n6. ANG DALAWANG KALAGAYAN, SA MISMONG LOHIKA\n');
/* Blangkong kahon: dapat manatili ang confluence AT makuha ang pattern.
   Sinadyang ibahin: dapat maglaglag pa rin. */
const rows = new Function('SAVED_SETUPS', 'drawerBulkTargets', 'shared', `
  const _accountTypeFor = () => null;
  const TRADE_TYPE_SETUP_MAP = {};
  const PATTERN_FIXED_SETUP = {};
  const PATTERN_FIXED_AOF = {};
  const PATTERN_EXEC_TF = {};
  const _execTfFor = () => null;
  const _aofFromSequence = () => null;
  const _autoExitType = () => null;
  const _applyMovedStopFlags = () => {};
  const RAW_TRADES = [];
  // Ang mga kinukuwentang column ay inaalis bago isulat — hindi ito ang
  // sinusuri rito, kaya walang laman ang listahan.
  const JOURNAL_COMPUTED_KEYS = [];
  ${fnBody('_bulkJournalRows')}
  return _bulkJournalRows(shared);
`);

const T = [{ setupId: 1, parsed: { symbol:'BTC', entry_price:1 } }];
let r = rows(SETUPS, T, { pattern_type: null });
console.log('   blangko  -> pattern=' + r.rows[0].pattern_type +
  '  confluence=' + Object.keys(r.rows[0].confluence_answers || {}).length +
  '  ibinagsak=' + r.confluenceDropped);
ok('blangko: nakuha ang pattern', r.rows[0].pattern_type === '1 hour LH');
ok('blangko: nanatili ang confluence',
   Object.keys(r.rows[0].confluence_answers || {}).length === 2);
ok('blangko: walang ibinagsak', r.confluenceDropped === 0);

r = rows(SETUPS, T, { pattern_type: '5 mins HL' });
console.log('   sinadya  -> pattern=' + r.rows[0].pattern_type +
  '  confluence=' + Object.keys(r.rows[0].confluence_answers || {}).length +
  '  ibinagsak=' + r.confluenceDropped);
ok('sinadya: sinusunod ang pinili niya', r.rows[0].pattern_type === '5 mins HL');
ok('sinadya: ibinabagsak pa rin', r.confluenceDropped === 1, String(r.confluenceDropped));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
