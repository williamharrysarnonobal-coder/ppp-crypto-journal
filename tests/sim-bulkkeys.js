const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG BULK AY BUMUBURA NG KADA-ACCOUNT NA HALAGA KAPAG NAKIKITA ITO.

   "hindi nakukuha leverage kapag bulk journal pero kapag individual ok naman"

   Ang hilera ay binubuo bilang { ...t.parsed, ...answered } — ang sagot sa
   KABAHAGING drawer ay nananaig sa ticket ng bawat account. Kaya ang anumang
   field na (a) kinukuha ng parser mula sa position card AT (b) nakikita sa
   bulk drawer ay bumabalik na null at pumapatong sa tunay na halaga.

   Hindi ito tungkol sa leverage. Ito ay isang PANUNTUNAN: ang bawat bagay na
   kinukuha ng parser ay dapat nasa BULK_HIDDEN_KEYS, dahil kada-account iyon.
   Ang susunod na column na idadagdag ko ay mahuhuli rito at hindi sa paggamit. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function setBlock(name){
  const m = new RegExp('const ' + name + ' = new Set\\(\\[').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '[') d++;
    else if(js[j] === ']'){ d--; if(!d) return js.slice(m.index, j + 2) + ';'; }
  }
}
function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) + got + (ok ? '' : '   <-- ' + want));
};

const HIDDEN = new Function(setBlock('BULK_HIDDEN_KEYS') + ' return BULK_HIDDEN_KEYS;')();
const parse = new Function(fnBody('_parseExchangeDateTime') +
  fnBody('parseUpscaleEasyAddText') + ' return parseUpscaleEasyAddText;')();

/* Ang tunay na position card, may leverage. Kung ano ang lumalabas dito ay
   kada-account — walang iisang tamang halaga para sa tatlong account. */
const CARD = [
  'BTC/USD', 'LONG x3', '', '0.6204', 'BTC', '', '39,983.4', 'USD', '',
  'Pnl: 591.36 USD', 'Fee: 6.44465', '', 'Avg: $64,447.7', 'Close: $65,400.9', '',
  'CLOSED', '', '19.08.26', '18:17:07'].join('\n');

const fromCard = Object.keys(parse(CARD));
console.log('KINUKUHA NG PARSER SA POSITION CARD (' + fromCard.length + '):\n');
fromCard.forEach(k => console.log('  ' + (HIDDEN.has(k) ? 'nakatago ' : 'NAKIKITA ') + k));

/* Ang mga computed ay hindi kailanman naisusulat (_collectDrawerPatch ay
   nagbabasa lang ng input), kaya hindi sila delikado kahit hindi nakatago. */
const COMPUTED = new Function(setBlock('JOURNAL_COMPUTED_KEYS') +
  ' return JOURNAL_COMPUTED_KEYS;')();
const risky = fromCard.filter(k => !HIDDEN.has(k) && !COMPUTED.has(k));

console.log('');
check('bawat kinuha sa card ay nakatago sa bulk', risky.join(', ') || 'lahat', 'lahat');

console.log('\nANG LEVERAGE MISMO\n');
check('kinukuha ito ng parser', parse(CARD).leverage, 3);
check('at nakatago sa bulk drawer', HIDDEN.has('leverage'), true);

console.log('\nANG DIREKSYON NG PAGSASAMA\n');
/* Kung mababaligtad ito balang araw — { ...answered, ...t.parsed } — hindi na
   kailangan ang BULK_HIDDEN_KEYS para sa pagbura, at ang pagsusuri sa itaas
   ay magiging maling babala. Sinusuri ko ang mismong linya para may senyales
   kung magbabago ito. */
check('ang answered ay nananaig sa parsed',
  /\{ \.\.\.t\.parsed, \.\.\.answered \}/.test(js), true);

console.log('\nHINDI NAKATAGO NANG SADYA\n');
// pattern_type ay galing sa Setup at hindi sa card — at madalas maling napipili.
check('nakikita pa rin ang pattern_type', HIDDEN.has('pattern_type'), false);

console.log('\n' + (fail ? fail + ' FAIL' : 'walang kada-account na halagang mabubura'));
process.exit(fail ? 1 : 0);
