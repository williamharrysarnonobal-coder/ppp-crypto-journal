const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* BAKIT WALANG NAGBABAGO KAHIT NAKA-DEPLOY NA.

   Ang FIELD_OPTIONS ay may naka-save na kopya sa localStorage, at tuwirang
   PINAPALITAN nito ang listahan sa code sa tuwing magbubukas ang app:

       FIELD_OPTIONS[k].length = 0;
       FIELD_OPTIONS[k].push(...savedFieldOpts[k]);

   Ang kopyang iyon ay mas matanda kaysa sa anumang option na naidagdag
   pagkatapos noon. Kaya ang bawat bagong pagpipilian sa code ay hindi
   kailanman aabot sa sinumang minsan nang nagbukas ng Options editor —
   nag-push ka, nag-deploy ka, nag-clear ka ng cache, at wala pa ring nagbago.

   Nakasulat na ang dahilan sa mismong file, ilang linya lang sa ibaba, para sa
   UNFOLLOWED_RULES_OPTIONS: "Merge, don't replace." Hindi lang ito naisagawa
   sa FIELD_OPTIONS. */
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
function constBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*([\\[{])').exec(js);
  const open = m[1], close = open === '[' ? ']' : '}';
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === open) d++;
    else if (js[j] === close) { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(54) + (x || '')); };

// Ang TUNAY na loadOptionsConfig, pinapatakbo sa isang pekeng localStorage.
const run = (savedField) => {
  const store = {
    'ledger-field-options': savedField ? JSON.stringify(savedField) : null,
    'ledger-unfollowed-rules-options': null,
  };
  return new Function('localStorage', 'syncUIPrefsToProfile', `
    ${constBlock('FIELD_OPTIONS')}
    ${constBlock('UNFOLLOWED_RULES_OPTIONS')}
    ${constBlock('TAG_ALIASES')}
    ${constBlock('TAG_RETIRED')}
    ${fnBody('loadOptionsConfig')}
    loadOptionsConfig();
    return FIELD_OPTIONS;
  `)({ getItem: k => store[k] ?? null, setItem(){} }, () => {});
};

const NEW_PAT = ['4H HL Creation','4H LH Creation','1H HL Creation',
                 '1H LH Creation','15M HL Creation','15M LH Creation'];

console.log('1. WALANG NAKA-SAVE — ang code lang\n');
let F = run(null);
ok('nandoon ang anim na Creation', NEW_PAT.every(p => F.pattern_type.includes(p)),
   F.pattern_type.length + ' pattern');
ok('nandoon ang Creation Play', F.trade_setup.includes('Creation Play'));
ok('nandoon ang Creation na AOF', F.aof_phase.includes('Creation'));

console.log('\n2. ANG KALAGAYAN NIYA — lumang kopya sa localStorage\n');
/* Eksaktong nasa screenshot niya: limang pattern lang, tatlong Play, at ang
   lumang listahan ng AOF. Ito ang naitabi bago pa idinagdag ang Creation. */
const OLD_SAVE = {
  pattern_type: ['5 mins HL','5 mins LH','15 mins HL','15 mins LH',
                 '1 hour HL','1 hour LH','30 mins Invalidation Play',
                 '4 Hour HL','4 Hour LH'],
  trade_setup: ['Bounce Play','Rejection Play','Invalidation Play'],
  aof_phase: ['IC','EM','LM','Extended Movement','Invalidation','5 mins Scalping'],
};
F = run(OLD_SAVE);
console.log('   pattern_type: ' + F.pattern_type.join(', '));
console.log('   trade_setup : ' + F.trade_setup.join(', '));
console.log('   aof_phase   : ' + F.aof_phase.join(', '));
console.log('');
ok('UMAABOT NA ANG ANIM NA CREATION', NEW_PAT.every(p => F.pattern_type.includes(p)),
   NEW_PAT.filter(p => !F.pattern_type.includes(p)).join(', ') || '6/6');
ok('UMAABOT NA ANG CREATION PLAY', F.trade_setup.includes('Creation Play'));
ok('UMAABOT NA ANG CREATION NA AOF', F.aof_phase.includes('Creation'));

console.log('\n3. HINDI NAAAPEKTUHAN ANG NAKA-SAVE NIYA\n');
/* Kanya ang ayos na iyon, at maaaring may sarili siyang naidagdag doon. Ang
   bago ay idinudugtong sa DULO, hindi ipinipilit sa unahan. */
ok('nauuna pa rin ang naka-save', F.pattern_type[0] === '5 mins HL', F.pattern_type[0]);
ok('nasa dulo ang bago', NEW_PAT.includes(F.pattern_type[F.pattern_type.length - 1]),
   F.pattern_type[F.pattern_type.length - 1]);
ok('buo pa rin ang lumang siyam',
   OLD_SAVE.pattern_type.every(p => F.pattern_type.includes(p)));
ok('walang naulit',
   new Set(F.pattern_type).size === F.pattern_type.length,
   F.pattern_type.length + ' pattern');

console.log('\n4. ANG SARILI NIYANG DINAGDAG AY NANANATILI\n');
F = run({ ...OLD_SAVE, pattern_type: OLD_SAVE.pattern_type.concat('Sarili Kong Pattern') });
ok('hindi nabubura ang custom', F.pattern_type.includes('Sarili Kong Pattern'));
ok('at dumadating pa rin ang bago', NEW_PAT.every(p => F.pattern_type.includes(p)));

console.log('\n5. HINDI NAGDODOBLE KAPAG NAKA-SAVE NA ANG BAGO\n');
F = run({ ...OLD_SAVE, pattern_type: OLD_SAVE.pattern_type.concat(NEW_PAT) });
const dupes = F.pattern_type.filter((p, i) => F.pattern_type.indexOf(p) !== i);
ok('walang doble', dupes.length === 0, dupes.join(', ') || 'malinis');

console.log('\n6. IBA-IBANG LAKI NG TITIK\n');
/* Kung iba lang ang laki ng titik, iisang bagay pa rin ito — hindi dapat
   magdagdag ng pangalawang hilera na parehong ibig sabihin. */
F = run({ ...OLD_SAVE, trade_setup: ['bounce play','Rejection Play','Invalidation Play'] });
const bounce = F.trade_setup.filter(v => /bounce play/i.test(v));
ok('hindi dumodoble ang "Bounce Play"', bounce.length === 1, bounce.join(', '));

console.log('\n7. HINDI NAGBAGO ANG PARAAN SA TRADE TAGS\n');
ok('merge pa rin ang unfollowed_rules',
   /const keptSaved = savedUnfollowed\.filter/.test(js));
ok('at may merge na rin ang FIELD_OPTIONS',
   /const missing = FIELD_OPTIONS\[k\]\.filter/.test(js));
ok('wala nang tuwirang pagpalit',
   !/FIELD_OPTIONS\[k\]\.length = 0;\s*\n\s*FIELD_OPTIONS\[k\]\.push\(\.\.\.savedFieldOpts\[k\]\);/.test(js));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
