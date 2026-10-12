const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG MGA PRESET NG PROP FIRM.

   Hindi palamuti ang mga numerong ito: sila ang nagtatakda ng drawdown floor
   at ng babala ng account, at nakatago sila sa likod ng buod — kaya ang maling
   preset ay hindi nagmumukhang mali, nagiging hangganan lang ito na hindi niya
   pinili.

   Ang Upscale ay sa kanya at napatunayan na niya. Ang natitira ay galing sa
   nakalathalang panuntunan, at nagbabago ang mga iyon nang hindi nag-aabiso —
   kaya minarkahan silang `unverified`, at kailangang makita niya iyon. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');

function objBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\{').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(48) + (x || '')); };

const P = new Function(objBlock('PROP_FIRM_PRESETS') + ' return PROP_FIRM_PRESETS;')();

console.log('1. ANG MGA FIRM\n');
ok('nandoon pa rin ang Upscale Trade', !!P['Upscale Trade']);
ok('may nadagdag', Object.keys(P).length >= 8, Object.keys(P).length + ' firm');
ok('walang naulit', new Set(Object.keys(P)).size === Object.keys(P).length);

console.log('\n2. ANG TANDA NG HINDI BERIPIKADO\n');
/* Ang sa kanya lang ang walang tanda. Kung mawawala ang tanda sa iba, ang
   hindi ko nabeberipikang numero ay magmumukhang kasing-tiyak ng sarili niya. */
Object.entries(P).forEach(([firm, types]) => {
  const all = Object.values(types);
  const marked = all.filter(t => t.unverified).length;
  if(firm === 'Upscale Trade'){
    ok('"' + firm + '" ay walang tanda (sa kanya)', marked === 0, marked + '/' + all.length);
  }else{
    ok('"' + firm + '" ay may tanda sa lahat', marked === all.length, marked + '/' + all.length);
  }
});
ok('ipinapakita ang tanda sa buod', /preset\.unverified/.test(js) && /acc-preset-warn/.test(js));
ok('may kulay ito sa CSS', /\.acc-preset-warn\{/.test(css));
ok('sinasabi nitong itakda nito ang drawdown floor',
   /They set your drawdown floor/.test(js));

console.log('\n3. BAWAT PRESET AY BUO\n');
/* Ang kulang na field ay hindi error — nagiging blangkong kahon lang ito. Pero
   ang kulang na `stages` ay isang account na hindi kailanman aakyat, at ang
   kulang na `sizes` ay dropdown na walang laman. */
Object.entries(P).forEach(([firm, types]) => {
  Object.entries(types).forEach(([name, t]) => {
    const label = firm + ' · ' + name;
    /* Isa ay sapat: ang Turbo ng Upscale ay ['Funded'] — instant funding,
       walang evaluation. Dalawa ang hiningi ko noon at ang sarili niyang
       account ang bumagsak. */
    ok(label.padEnd(40) + ' may stages',
       Array.isArray(t.stages) && t.stages.length >= 1, (t.stages||[]).length + '');
    ok(label.padEnd(40) + ' nagtatapos sa Funded',
       t.stages[t.stages.length-1] === 'Funded', t.stages[t.stages.length-1]);
    ok(label.padEnd(40) + ' may sizes',
       Array.isArray(t.sizes) && t.sizes.length > 0, (t.sizes||[]).length + '');
    /* Ang drawdown ay dapat MAS MALAKI kaysa sa daily loss — kung baligtad,
       ang account ay bagsak na bago pa matapos ang unang masamang araw. */
    if(t.maxDailyLossPct != null && t.maxTotalDrawdownPct != null){
      ok(label.padEnd(40) + ' daily < drawdown',
         t.maxDailyLossPct < t.maxTotalDrawdownPct,
         t.maxDailyLossPct + '% vs ' + t.maxTotalDrawdownPct + '%');
    }
    /* Hiningi ko noong mas maliit ang target kaysa sa drawdown, "kung hindi ay
       imposible ang challenge". Mali iyon: ang Accelerated ng Upscale — ang
       sarili niyang account, beripikado — ay 10% target sa 6% drawdown, at
       ganoon din ang bawat isang-hakbang na challenge. Hindi magkatapat ang
       dalawa: pwede kang kumita ng 10% nang hindi bumababa ng 6%.

       Ang tunay na dapat totoo ay mas mababa: may target ang bawat phase na
       hindi Funded, kung hindi ay walang mapapasa. */
    const isFundedOnly = t.stages.length === 1 && t.stages[0] === 'Funded';
    ok(label.padEnd(40) + (isFundedOnly ? ' walang target (funded agad)' : ' may target'),
       isFundedOnly ? t.phase1TargetPct == null : t.phase1TargetPct > 0,
       String(t.phase1TargetPct));
    // Ang bilang ng phase ay dapat tumugma sa mga target na ibinigay.
    const twoStep = t.stages.length === 3;
    ok(label.padEnd(40) + (twoStep ? ' may phase2 target' : ' walang phase2 target'),
       twoStep ? t.phase2TargetPct != null : t.phase2TargetPct == null,
       String(t.phase2TargetPct));
  });
});

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
