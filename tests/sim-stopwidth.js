const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* MASYADO BANG MASIKIP ANG STOP KO?

   Ang "Stopped Out Then Hit TP" ay hindi paglabag — tama ang basa, umabot naman
   sa target, natanggal ka lang bago iyon. Kaya observation ito at walang
   binabawas sa discipline score. Pero may isang tanong na ito lang ang
   makakasagot, at tungkol iyon sa STOP at hindi sa kanya.

   Ang unang bersyon ko ay humihingi ng "Stop Held" na tag para sa mabuting
   panig. Walang ganoong tag, kaya zero ang mabuti sa bawat pagkakataon at
   sasabihin ng report na 100% masikip ang stop niya — isang sagot na mukhang
   tiyak at palaging mali. Ang sagot ay nasa naitala na niya: ang natanggal ay
   `exit_type = SL Hit`, at ang bumalik ay may tag na. */
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
function arrBlock(name){
  const m = new RegExp('const ' + name + '\\s*=\\s*\\[').exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
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
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(50) + (x || '')); };

const API = new Function(`
  ${/const EM_MIN_N\s*=\s*\d+;/.exec(js)[0]}
  ${/const EM_MIN_GAP\s*=\s*[\d.]+;/.exec(js)[0]}
  const escapeHtml = s => String(s);
  ${/^const _ruleTags = .*$/m.exec(js)[0]}
  ${objBlock('TAG_ALIASES')}
  ${fnBody('_canonicalTags')}
  ${/const _hasTag = [\s\S]*?\};/.exec(js)[0]}
  ${arrBlock('TRADE_REPORTS')}
  ${fnBody('_runReport')}
  return { REPORTS: TRADE_REPORTS, run: _runReport, hasTag: _hasTag };
`)();

const rep = API.REPORTS.find(r => r.id === 'stop-width');
const say = x => String(x.verdict.txt).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

console.log('1. NAROON BA ANG TANONG?\n');
ok('may "stop-width" na report', !!rep);
ok('ang tanong ay tungkol sa stop', rep && /Is my stop too tight/.test(rep.q), rep ? rep.q : '');
ok('isang panig lang', rep && rep.arms.length === 1);
/* Walang bagong tag na dapat titikan — ang dalawang panig ay dapat parehong
   nabubuo mula sa naitala na niya. */
ok('walang hinihinging bagong tag',
   rep && !rep.arms[0].good.tag && !rep.arms[0].bad.tag,
   rep && rep.arms[0].good.tag ? 'humihingi ng ' + rep.arms[0].good.tag : 'gumagamit ng sel');
ok('wala nang "Stop Held" kahit saan', !/'Stop Held'/.test(js));

const T = (exit, tag) => ({ exit_type: exit, unfollowed_rules: tag || '' });
const STOPPED_CLEAN = T('SL Hit');
const STOPPED_BACK  = T('SL Hit', 'Stopped Out Then Hit TP');

console.log('\n2. ANG PAGBILANG\n');
let r = API.run(rep, [
  ...Array(9).fill(0).map(() => STOPPED_CLEAN),
  ...Array(3).fill(0).map(() => STOPPED_BACK),
]);
console.log('   ' + say(r));
ok('12 ang nabilang', r.total === 12, String(r.total));
ok('9 ang tumagal', r.arms[0].good === 9, String(r.arms[0].good));
ok('3 ang bumalik', r.arms[0].bad === 3, String(r.arms[0].bad));
ok('may room ang stop -> berde', r.verdict.tone === 'good', r.verdict.tone);
ok('sinasabing iwan ito', /Your stop has room/.test(r.verdict.txt));

console.log('\n3. KAPAG MASIKIP NGA\n');
r = API.run(rep, [
  ...Array(3).fill(0).map(() => STOPPED_CLEAN),
  ...Array(10).fill(0).map(() => STOPPED_BACK),
]);
console.log('   ' + say(r));
ok('pula', r.verdict.tone === 'bad', r.verdict.tone);
ok('sinasabing bigyan ng puwang', /Give the stop more room/.test(r.verdict.txt));
ok('sinasabi ang bilang', /10 of 13/.test(r.verdict.txt), say(r));

console.log('\n4. WALANG NABIBILANG NA HINDI DAPAT\n');
/* Ang TP Hit, ang Cut Loss at ang BE Hit ay walang sinasabi tungkol sa lapad
   ng stop — hindi tinamaan ang stop sa tatlo. Kung mabibilang sila sa mabuting
   panig, lalabas na maluwag ang stop dahil lang sa dami ng nanalo. */
r = API.run(rep, [
  ...Array(20).fill(0).map(() => T('TP Hit')),
  ...Array(5).fill(0).map(() => T('Cut Loss')),
  ...Array(4).fill(0).map(() => T('BE Hit')),
  ...Array(3).fill(0).map(() => STOPPED_BACK),
  ...Array(2).fill(0).map(() => STOPPED_CLEAN),
]);
console.log('   ' + say(r));
ok('5 lang ang nabilang, hindi 34', r.total === 5, String(r.total));
ok('2 ang tumagal', r.arms[0].good === 2, String(r.arms[0].good));
ok('3 ang bumalik', r.arms[0].bad === 3, String(r.arms[0].bad));

console.log('\n5. ANG TAG AY BINIBILANG KAHIT ANONG EXIT TYPE\n');
/* Kung minarkahan niya ang trade bilang "Stopped Out Then Hit TP" pero
   nakalimutan ang exit_type, mabibilang pa rin ito — ang tag ang mismong
   pahayag, at hindi ito dapat mawala dahil sa isang blangkong column. */
r = API.run(rep, [
  ...Array(6).fill(0).map(() => STOPPED_CLEAN),
  ...Array(4).fill(0).map(() => T('', 'Stopped Out Then Hit TP')),
]);
ok('nabibilang kahit walang exit_type', r.arms[0].bad === 4, String(r.arms[0].bad));
/* At hindi dapat doble kung parehong naroon — ang isang trade ay isang trade. */
r = API.run(rep, [STOPPED_BACK]);
ok('hindi dumodoble ang may tag AT may SL Hit',
   r.total === 1 && r.arms[0].bad === 1,
   'total=' + r.total + ' bad=' + r.arms[0].bad);

console.log('\n6. KULANG PA ANG DATOS\n');
r = API.run(rep, [STOPPED_BACK, STOPPED_CLEAN]);
ok('hindi nagpapasya sa dalawa', r.verdict.tone === 'wait', r.verdict.tone);
console.log('   ' + say(r));

console.log('\n7. HINDI ITO PAGLABAG\n');
/* Kung mahulog ito sa "breach", bababa ang discipline score niya sa tuwing
   TAMA ang basa niya — iyon mismo ang dahilan kung bakit ito observation. */
ok('nasa TAG_OBSERVATIONS pa rin ang tag',
   new RegExp("'Stopped Out Then Hit TP'").test(arrBlock('TAG_OBSERVATIONS')));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
