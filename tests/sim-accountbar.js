const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang prop firm progress bar sa My Accounts. Ang panuntunan ay dapat pareho ng
// tatlong ibang bar: pill sa hangganan habang hinahabol, porsyento sa dulo
// kapag naabot. Napalampas ang pill dito nang una — kaya walang numero.
const fs = require('fs');
const R = __ROOT + '/';
const js  = fs.readFileSync(R + 'js/dashboard.js', 'utf8');
const css = fs.readFileSync(R + 'css/style.css', 'utf8');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) + got + (ok ? '' : '   <-- ' + want));
};

// Kunin ang mismong bloke mula sa render at patakbuhin sa totoong halaga.
const src = /if\(a\.profit_target_pct\)\{[\s\S]*?\n      \}/.exec(js);
if(!src) throw new Error('hindi mahanap ang account progress block');
/* Ang bloke ay tumatawag na ngayon ng _goalTone — ang iisang panuntunan ng
   kulay na ibinabahagi ng apat na bar. Isinasama ito rito mula mismo sa
   dashboard.js, hindi bilang kopya: kung magbabago ang mga hangganan doon,
   dito rin sila magbabago, at hindi tahimik na maiiwan ang sim. */
const goalToneSrc = (() => {
  const i = js.indexOf('function _goalTone(');
  if(i < 0) throw new Error('hindi mahanap ang _goalTone');
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
})();
const build = new Function('a', 'plPct', '_GOAL_TROPHY', `
  ${goalToneSrc}
  let balanceHTML = '';
  ${src[0]}
  return balanceHTML;
`);
const TROPHY = /const _GOAL_TROPHY = `([\s\S]*?)`;/.exec(js)[1];

const bar = (target, plPct) => build({ profit_target_pct: target }, plPct, TROPHY);
const pill = h => (h.match(/class="account-progress-pct"[^>]*>([^<]*)</) || [,'(wala)'])[1];
const cap  = h => (h.match(/class="account-progress-end">([\s\S]*?)<\/span>/) || [,'(wala)'])[1].trim();
const tone = h => (h.match(/class="account-progress-bar (\w+)"/) || [,'(wala)'])[1];
const width = h => (h.match(/account-progress-fill" style="width:([\d.]+)%/) || [,'?'])[1];

console.log('1. ANG NAWAWALANG PORSYENTO\n');
// Ang nasa screenshot: 5.2% sa 8% na target = 65% ng target.
let h = bar(8, 5.2);
console.log('   5.2% sa 8% target -> pill ' + pill(h) + ', lapad ' + width(h) + '%');
check('may pill na ngayon', pill(h), '65%');
check('sumusunod ito sa hangganan ng fill', /--p:65\.0%/.test(h), true);
check('trophy pa rin ang dulo', /account-progress-end">\s*<svg/.test(h), true);
check('gold habang paakyat', tone(h), 'now');

console.log('\n2. KAPAG NAABOT NA ANG TARGET\n');
h = bar(8, 9.6);
console.log('   9.6% sa 8% target -> pill ' + pill(h) + ', dulo ' + cap(h));
check('wala nang pill', pill(h), '(wala)');
check('porsyento na ang dulo', cap(h), '120%');
check('wala nang trophy', /account-progress-end">\s*<svg/.test(h), false);
check('berde', tone(h), 'hit');
check('puno ang bar', width(h), '100.0');

console.log('\n3. KAPAG LUGI ANG ACCOUNT\n');
h = bar(8, -2.4);
console.log('   -2.4% -> tono ' + tone(h) + ', lapad ' + width(h) + '%');
check('pula', tone(h), 'missed');
check('zero ang bar, hindi negatibo', width(h), '0.0');
/* Ang pill ay nagpapakita ng TOTOONG bilang, kasama ang negatibo.

   Ni-clamp ko ito sa 0% noong akala kong ang negatibo ang sanhi ng gulong
   nakita niya. Hindi pala. Ang gulo ay ang HINDI PAGKAKATAPAT: ang knob ay
   nasa dulong kaliwa habang ang bula ay 20px sa kanan nito, kaya tumuturo ang
   tuka sa tabi ng knob. Pareho na ang clamp nila ngayon.

   At tama siya sa pinagmumulan: ang "-30%" ang bagay na kailangan mong
   malaman. Ang pagpapalit nito ng "0%" ay nagtatago na lugi ang account. Ang
   bar ay nasa zero dahil walang bar na negatibo; ang BILANG ang nagsasabi ng
   totoo, at ang pulang kulay ay sumasang-ayon. */
check('nakikita ang totoong bilang, kasama ang negatibo', pill(h), '-30%');

console.log('\n4. ANG CAPTION AY IBANG NUMERO\n');
// Ang caption ay "5.2% of 8% target"; ang pill ay 65%. Magkaiba sila nang
// sinasadya — ang isa ay galaw ng account, ang isa ay gaano ka na kalayo.
h = bar(8, 5.2);
check('caption: galaw ng account', /5\.2% of 8% target/.test(h), true);
check('pill: gaano na kalayo sa target', pill(h), '65%');

console.log('\n5. PAREHO NG TATLONG IBANG BAR\n');
// Apat na bar na ang gumagamit ng panuntunang ito. Kapag may naiwan, walang
// numerong lalabas sa isa — 'yon mismo ang nangyari dito.
const caps = (js.match(/(cal-goal-end|yo-bar-end|account-progress-end)">\$\{[^}]*\?/g) || []).length;
console.log('   ' + caps + ' na end cap ang may kondisyon');
check('apat na bar ang sumusunod', caps, 4);
/* Dating binibilang nito ang mga clamp at umaasa ng eksaktong apat. Naging
   walo nang idagdag ang hugis ng slider: ang apat na orihinal ay nandiyan pa
   rin at may apat na override sa dulo ng file na siyang nananaig. Tama ang
   bilang na walo; ang TANONG ang mali.

   Ang layunin ay "naka-clamp ba ang pill ng bawat bar", at ang sagot doon ay
   ang HULING deklarasyon ng bawat selector — hindi kung ilan ang clamp sa
   buong file. Ganito rin ang tinatanong ng sim-slider.js sa knob. */
{
  const pills = ['.cal-goal-track b', '.yo-bar b', '.yo-bar.year b', '.account-progress-pct'];
  const lastLeft = sel => {
    const re = new RegExp('(^|[\\n}])\\s*' +
      sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    let m, v = null;
    while((m = re.exec(css))){
      const p = /(?:^|[;{\s])left\s*:\s*([^;}]+)/.exec(m[2]);
      if(p) v = p[1].trim();
    }
    return v;
  };
  const clamped = pills.filter(s => /clamp\(/.test(lastLeft(s) || ''));
  check('naka-clamp ang pill ng apat na bar', clamped.length, pills.length);
}

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
