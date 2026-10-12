const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* TATLONG TANONG NA WALANG KAPAREHA.

   Ang "Held Through Invalidation" ay may kabila. Ang Chased Extended Move,
   ang Traded Into Key Level at ang Entered Without Confirmation ay wala —
   walang "Entered With Confirmation" na tag, at walang dahilan para gumawa ng
   isa. Kaya ang sinusukat ay ang mismong naitala: sa mga beses na ginawa mo
   ito, ilan ang nanalo.

   Ang breakeven ay hindi kabilang sa alinmang panig. Hindi ito nanalo at hindi
   rin natalo, at ang pagbilang doon sa alinman ay magsisinungaling — lalo na
   sa gawi na ginagawa ang talo na breakeven. */
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
function block(re){ const m = re.exec(js); if(!m) throw new Error('nawawala: ' + re); return m[0]; }
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
  ${block(/const EM_MIN_N\s*=\s*\d+;/)}
  ${block(/const EM_MIN_GAP\s*=\s*[\d.]+;/)}
  ${block(/const LOSS_RESULTS\s*=[^;]*;/)}
  ${block(/const _isLoss = .*$/m)}
  ${block(/const _isWin  = .*$/m)}
  const escapeHtml = s => String(s);
  ${block(/^const _ruleTags = .*$/m)}
  ${objBlock('TAG_ALIASES')}
  ${fnBody('_canonicalTags')}
  ${block(/const _hasTag = [\s\S]*?\};/)}
  ${arrBlock('TRADE_REPORTS')}
  ${fnBody('_runReport')}
  return { REPORTS: TRADE_REPORTS, run: _runReport };
`)();

const CASES = [
  ['chased',     'Chased Extended Move',        /chase a move that already ran/i, /Stop chasing/],
  ['key-level',  'Traded Into Key Level',       /trade into a key level/i,        /Stop trading into key levels/],
  ['no-confirm', 'Entered Without Confirmation',/enter without confirmation/i,    /Wait for confirmation/],
];

console.log('1. NAROON BA ANG TATLO?\n');
CASES.forEach(([id, tag, q]) => {
  const rep = API.REPORTS.find(r => r.id === id);
  ok('"' + id + '" ay may tanong', !!rep && q.test(rep.q), rep ? rep.q : 'WALA');
  ok('  isang panig lang', rep && rep.arms.length === 1);
  ok('  walang hinihinging bagong tag',
     rep && !rep.arms[0].good.tag && !rep.arms[0].bad.tag,
     rep && rep.arms[0].good.tag ? 'humihingi ng ' + rep.arms[0].good.tag : 'gumagamit ng sel');
});

const T = (tag, wl) => ({ unfollowed_rules: tag, win_loss: wl });

console.log('\n2. ANG PAGBILANG\n');
CASES.forEach(([id, tag, , changeRe]) => {
  const rep = API.REPORTS.find(r => r.id === id);
  if(!rep) return;
  const r = API.run(rep, [
    ...Array(2).fill(0).map(() => T(tag, 'Win')),
    ...Array(9).fill(0).map(() => T(tag, 'Loss')),
    // Ibang tag — hindi dapat kasama sa alinmang panig.
    ...Array(20).fill(0).map(() => T('Rules Followed', 'Win')),
  ]);
  const say = String(r.verdict.txt).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  console.log('   ' + id.padEnd(12) + say);
  ok('  11 lang ang nabilang', r.total === 11, String(r.total));
  ok('  2 panalo, 9 talo', r.arms[0].good === 2 && r.arms[0].bad === 9,
     r.arms[0].good + '/' + r.arms[0].bad);
  ok('  pula', r.verdict.tone === 'bad', r.verdict.tone);
  ok('  sinasabi kung ano ang gagawin', changeRe.test(r.verdict.txt));
});

console.log('\n3. KAPAG UMUUBRA NAMAN\n');
{
  const rep = API.REPORTS.find(r => r.id === 'chased');
  const r = API.run(rep, [
    ...Array(9).fill(0).map(() => T('Chased Extended Move', 'Win')),
    ...Array(2).fill(0).map(() => T('Chased Extended Move', 'Loss')),
  ]);
  console.log('   ' + String(r.verdict.txt).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  ok('berde', r.verdict.tone === 'good', r.verdict.tone);
  ok('sinasabing ipagpatuloy', /Chasing has been working/.test(r.verdict.txt));
}

console.log('\n4. ANG BREAKEVEN AY HINDI KABILANG\n');
/* Ang paglilipat ng stop sa breakeven ay ginagawang breakeven ang mga talo.
   Kung mabibilang iyon bilang panalo, ang gawi ay magmumukhang mas mabuti sa
   tuwing tumatakas ito sa isang talo. Kung bibilangin bilang talo, mali rin.
   Wala sa dalawa — hindi ito nanalo at hindi ito natalo. */
{
  const rep = API.REPORTS.find(r => r.id === 'chased');
  const r = API.run(rep, [
    ...Array(3).fill(0).map(() => T('Chased Extended Move', 'Win')),
    ...Array(3).fill(0).map(() => T('Chased Extended Move', 'Loss')),
    ...Array(9).fill(0).map(() => T('Chased Extended Move', 'Breakeven')),
  ]);
  ok('6 lang ang nabilang, hindi 15', r.total === 6, String(r.total));
  ok('3 at 3', r.arms[0].good === 3 && r.arms[0].bad === 3,
     r.arms[0].good + '/' + r.arms[0].bad);
}

console.log('\n5. HINDI NAGSASALUBONG ANG TATLO\n');
/* Ang isang trade na may dalawa sa tatlong tag ay dapat mabilang sa DALAWANG
   tanong — magkaibang tanong sila tungkol sa iisang trade. Ang hindi dapat
   mangyari ay ang pagbilang nito sa tanong na wala ang tag nito. */
{
  const both = [T('Chased Extended Move, Traded Into Key Level', 'Loss')];
  const a = API.run(API.REPORTS.find(r => r.id === 'chased'), both);
  const b = API.run(API.REPORTS.find(r => r.id === 'key-level'), both);
  const c = API.run(API.REPORTS.find(r => r.id === 'no-confirm'), both);
  ok('nabibilang sa chased', a.total === 1, String(a.total));
  ok('nabibilang din sa key-level', b.total === 1, String(b.total));
  ok('hindi nabibilang sa no-confirm', c.total === 0, String(c.total));
}

console.log('\n6. KULANG PA ANG DATOS\n');
{
  const rep = API.REPORTS.find(r => r.id === 'no-confirm');
  let r = API.run(rep, []);
  ok('wala pa -> naghihintay', r.verdict.tone === 'wait', r.verdict.tone);
  ok('at sinasabi nitong wala pa', /Nothing tagged yet/.test(r.verdict.txt));
  r = API.run(rep, [T('Entered Without Confirmation', 'Loss'),
                    T('Entered Without Confirmation', 'Win')]);
  ok('dalawa lang -> hindi pa nagpapasya', r.verdict.tone === 'wait', r.verdict.tone);
}

console.log('\n7. NANANATILING OBSERVATION ANG TATLO\n');
/* Kung mahulog sila sa "breach", bababa ang discipline score niya sa tuwing
   TAMA siya — sinusukat pa lang ang mga ito, hindi hinahatulan. */
const obs = arrBlock('TAG_OBSERVATIONS');
CASES.forEach(([, tag]) => ok('"' + tag + '" ay observation',
  new RegExp("'" + tag + "'").test(obs)));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
