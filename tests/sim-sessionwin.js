const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* "Session meron nakalagay low liquidity pero walang time nakalagay pano ko
   malalaman diba"

   Dalawang bagay ang sinusuri: may oras ba ang BAWAT session, at TUMUTUGMA ba
   ang oras na iyon sa mismong paraan ng pagbilang ng app. Ang pangalawa ang
   mas mahalaga — ang isang orasang hindi tugma sa bilang sa tabi nito ay mas
   masahol pa kaysa sa walang orasan. */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
const arrow = n => { const i = js.indexOf('const ' + n + ' =');
  return js.slice(i, js.indexOf('\n};', i) + 3); };

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(48) + got + (ok ? '' : '   <-- ' + want));
};

const API = new Function(`
  ${arrow('_hr')}
  ${fnBody('computeSession')}
  ${js.slice(js.indexOf('const SESSION_WINDOWS'), js.indexOf('\n};', js.indexOf('const SESSION_WINDOWS')) + 3)}
  ${fnBody('_tzOffsetHours')}
  ${fnBody('_sessionUtcWindow')}
  ${fnBody('_sessionLocalWindow')}
  return { computeSession, _sessionLocalWindow };
`)();

const NAMES = ['Asia','London','London + NY Overlap','New York','Low Liquidity'];

console.log('ANG WINDOW NG BAWAT SESSION\n');
const windows = {};
NAMES.forEach(n => {
  windows[n] = API._sessionLocalWindow(n);
  console.log('  ' + n.padEnd(24) + (windows[n] || '(WALA)'));
});
const noWindow = NAMES.filter(n => !windows[n]);
check('may oras ang bawat session', noWindow.join(', ') || 'lahat', 'lahat');
// Ito ang kanyang reklamo, nakasulat bilang pagsusuri.
check('may oras ang Low Liquidity', windows['Low Liquidity'] || '(wala)',
  windows['Low Liquidity'] || '(wala)');
check('hindi ito blangko', windows['Low Liquidity'] ? 'oo' : 'hindi', 'oo');

console.log('\nTUMUTUGMA BA SA MISMONG PAGBILANG?\n');
/* Para sa bawat oras ng araw, ang session na ibinibigay ng computeSession ay
   dapat ang session na ang window ay naglalaman ng oras na iyon. Kung hindi,
   ang orasan ay nagsasabi ng ibang kuwento kaysa sa bilang. */
const parseHr = s => {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)–(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(s.replace(/\s/g,''));
  if(!m) return null;
  const to24 = (h, ap) => { h = +h % 12; return ap === 'pm' ? h + 12 : h; };
  return [to24(m[1], m[3]), to24(m[4], m[6])];
};
let mismatch = 0;
for(let h = 0; h < 24; h++){
  const actual = API.computeSession({ open_date: (()=>{ const d = new Date(); d.setHours(h, 30, 0, 0); return d; })() });
  const w = parseHr(windows[actual] || '');
  if(!w){ mismatch++; console.log('     ' + h + ':00 -> ' + actual + ' (hindi mabasa ang window)'); continue; }
  const [a, b] = w;
  const inside = a < b ? (h >= a && h < b) : (h >= a || h < b);
  if(!inside){ mismatch++; console.log('     ' + h + ':00 -> ' + actual + ' pero ang window ay ' + windows[actual]); }
}
check('bawat oras ay nasa loob ng sariling window', mismatch, 0);

console.log('\nWALANG PUWANG AT WALANG PATONG\n');
// Ang dalawampu't apat na oras ay dapat nahahati nang eksakto sa lima.
const covered = {};
for(let h = 0; h < 24; h++){
  const s = API.computeSession({ open_date: (()=>{ const d = new Date(); d.setHours(h, 30, 0, 0); return d; })() });
  covered[s] = (covered[s] || 0) + 1;
}
const total = Object.values(covered).reduce((a, b) => a + b, 0);
Object.entries(covered).forEach(([k, v]) => console.log('  ' + k.padEnd(24) + v + ' oras'));
check('24 na oras ang nasasakop', total, 24);
check('lima ang session', Object.keys(covered).length, 5);

console.log('\nHINDI NA GINAGAMIT ANG LUMANG PINAGMUMULAN\n');
/* Ang _sessionUaeWindow ay kinukuwenta mula sa timezone ng market at hindi
   tumutugma sa mga bucket. Nananatili ito para sa ibang gamit, pero ang card
   ng Session ay hindi na dapat dito kumukuha. */
check('ang Session card ay gumagamit ng local window',
  /label:'Session'[\s\S]{0,120}note:\s*_sessionLocalWindow/.test(js) ? 'oo' : 'HINDI', 'oo');

console.log('\n' + (fail ? fail + ' FAIL' : 'may oras ang bawat session, at tugma'));
process.exit(fail ? 1 : 0);
