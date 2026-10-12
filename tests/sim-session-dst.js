const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* SESSION NA MAY DAYLIGHT SAVING.
   Ang trade niya: 11:49am sa Dubai noong Oktubre -> naitalang Asia, pero
   bukas na ang London (BST, 08:00 London = 07:00 UTC = 11:00 Dubai). */
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
function grab(m){
  const i = js.indexOf(m); if(i < 0) throw new Error('missing: ' + m);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
const cs = new Function(`
  ${grab('const SESSION_WINDOWS')};
  ${grab('function _tzOffsetHours(')}
  ${grab('function _sessionUtcWindow(')}
  ${grab('function computeSession(')}
  return computeSession;`)();

let fail = 0;
const ok = (l, got, want) => { const c = got === want; if(!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(46) + got + (c ? '' : '   <-- ' + want)); };
const at = iso => cs({ open_date: new Date(iso) });

console.log('ANG KASO NIYA\n');
ok('Okt 5, 11:49 Dubai (07:49Z)', at('2026-10-05T07:49:00Z'), 'London');

console.log('\nTAG-INIT (BST / EDT)\n');
ok('06:30Z -> Asia', at('2026-07-01T06:30:00Z'), 'Asia');
ok('07:00Z -> London (bukas)', at('2026-07-01T07:00:00Z'), 'London');
ok('12:30Z -> Overlap', at('2026-07-01T12:30:00Z'), 'London + NY Overlap');
ok('16:30Z -> New York', at('2026-07-01T16:30:00Z'), 'New York');
ok('21:30Z -> Low Liquidity', at('2026-07-01T21:30:00Z'), 'Low Liquidity');
ok('00:30Z -> Asia', at('2026-07-02T00:30:00Z'), 'Asia');

console.log('\nTAGLAMIG (GMT / EST) — dapat pareho sa lumang talaan\n');
// Luma: Asia 4–12, London 12–17, Overlap 17–21, NY 21–2, Low 2–4 (Dubai).
const dubai = (h, m) => new Date(Date.UTC(2026, 0, 5, h - 4, m || 30)).toISOString();
ok('Dubai 07:30 -> Asia', at(dubai(7)), 'Asia');
ok('Dubai 11:49 -> Asia (taglamig)', at(dubai(11, 49)), 'Asia');
ok('Dubai 12:30 -> London', at(dubai(12)), 'London');
ok('Dubai 17:30 -> Overlap', at(dubai(17)), 'London + NY Overlap');
ok('Dubai 21:30 -> New York', at(dubai(21)), 'New York');
ok('Dubai 01:30 -> New York', at(dubai(25)), 'New York');
ok('Dubai 02:30 -> Low Liquidity', at(dubai(26)), 'Low Liquidity');
ok('Dubai 04:30 -> Asia', at(dubai(28)), 'Asia');

ok('\nlaging mula sa open date ang session', /session: computeSession\(r\) \|\| r\.session/.test(js), true);
ok('hindi na editable ang Session', /key:'session', label:'Session', widget:'select', editable:false/.test(js), true);
console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
