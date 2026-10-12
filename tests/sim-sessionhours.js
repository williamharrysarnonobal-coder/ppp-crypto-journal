const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang oras ng session sa oras ng UAE. Ang mahalagang mapatunayan: KINAKALKULA
// ito, hindi naka-type — dahil may DST ang London at New York at wala ang UAE,
// kaya lumilipat ng isang oras ang sagot dalawang beses sa isang taon.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

function fn(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('missing function ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}
function objBlock(name){
  const i = js.indexOf('const ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1) + ';'; }
  }
}
/* Brace-matched, THEN to the ";". Ang _hr ay isang multi-line na arrow na may
   sariling mga ";" sa loob — ang pag-scan hanggang unang ";\n" ay pumuputol sa
   gitna nito at nagbibigay ng kalahating function. */
const stmt = name => {
  const i = js.indexOf('const ' + name);
  let d = 0, j = js.indexOf('{', i);
  for(; j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) break; }
  }
  return js.slice(i, js.indexOf(';', j) + 1);
};

const API = new Function(`
  ${objBlock('SESSION_WINDOWS')}
  ${fn('_tzOffsetHours')}
  ${fn('_sessionUtcWindow')}
  ${stmt('_hr')}
  ${fn('_sessionUaeWindow')}
  return { _sessionUaeWindow, _tzOffsetHours, _sessionUtcWindow, SESSION_WINDOWS };
`)();

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

// Enero = taglamig sa hilaga (walang DST). Hulyo = may DST ang London at NY.
const WINTER = new Date('2026-01-15T12:00:00Z');
const SUMMER = new Date('2026-07-15T12:00:00Z');

console.log('1. ANG OFFSET MISMO\n');
check('Dubai ay +4 buong taon (Enero)', API._tzOffsetHours('Asia/Dubai', WINTER), 4);
check('Dubai ay +4 buong taon (Hulyo)', API._tzOffsetHours('Asia/Dubai', SUMMER), 4);
check('London +0 sa Enero', API._tzOffsetHours('Europe/London', WINTER), 0);
check('London +1 sa Hulyo (BST)', API._tzOffsetHours('Europe/London', SUMMER), 1);
check('New York -5 sa Enero', API._tzOffsetHours('America/New_York', WINTER), -5);
check('New York -4 sa Hulyo (EDT)', API._tzOffsetHours('America/New_York', SUMMER), -4);
check('Tokyo +9 buong taon', API._tzOffsetHours('Asia/Tokyo', SUMMER), 9);

console.log('\n2. ANG WINDOW SA ORAS MO\n');
['Asia','London','New York','London + NY Overlap'].forEach(s => {
  console.log('   ' + s.padEnd(22) + 'Enero ' + String(API._sessionUaeWindow(s, WINTER)).padEnd(14) +
    'Hulyo ' + API._sessionUaeWindow(s, SUMMER));
});

// Tokyo 9am-6pm JST (+9) = 00:00-09:00 UTC = 4am-1pm sa Dubai. Walang DST ang
// dalawa, kaya pareho buong taon.
check('Asia: 4am–1pm, Enero', API._sessionUaeWindow('Asia', WINTER), '4am–1pm');
check('Asia: pareho sa Hulyo', API._sessionUaeWindow('Asia', SUMMER), '4am–1pm');

// London 8am-5pm. Enero (GMT) = 08-17 UTC = 12pm-9pm Dubai.
// Hulyo (BST, +1)          = 07-16 UTC = 11am-8pm Dubai.
check('London: 12pm–9pm sa taglamig', API._sessionUaeWindow('London', WINTER), '12pm–9pm');
check('London: 11am–8pm sa tag-init', API._sessionUaeWindow('London', SUMMER), '11am–8pm');

// New York 8am-5pm. Enero (EST -5) = 13-22 UTC = 5pm-2am Dubai.
// Hulyo (EDT -4)                   = 12-21 UTC = 4pm-1am Dubai.
check('New York: 5pm–2am sa taglamig', API._sessionUaeWindow('New York', WINTER), '5pm–2am');
check('New York: 4pm–1am sa tag-init', API._sessionUaeWindow('New York', SUMMER), '4pm–1am');

// Overlap = ang pinagsaluhan. Enero: London 08-17, NY 13-22 -> 13-17 UTC
// = 5pm-9pm Dubai. Hulyo: London 07-16, NY 12-21 -> 12-16 UTC = 4pm-8pm.
check('Overlap: 5pm–9pm sa taglamig', API._sessionUaeWindow('London + NY Overlap', WINTER), '5pm–9pm');
check('Overlap: 4pm–8pm sa tag-init', API._sessionUaeWindow('London + NY Overlap', SUMMER), '4pm–8pm');

console.log('\n3. ANG BUONG PUNTO — LUMILIPAT ITO\n');
// Kung naka-type ang oras, mali ito sa kalahati ng taon at walang magsasabi.
['London','New York','London + NY Overlap'].forEach(s => {
  const w = API._sessionUaeWindow(s, WINTER), su = API._sessionUaeWindow(s, SUMMER);
  check(s + ' — magkaiba ang taglamig at tag-init', w !== su, true);
});
check('Asia — pareho, walang DST ang Tokyo at Dubai',
  API._sessionUaeWindow('Asia', WINTER) === API._sessionUaeWindow('Asia', SUMMER), true);

console.log('\n4. WALANG IMBENTONG WINDOW\n');
check('Low Liquidity -> wala', API._sessionUaeWindow('Low Liquidity', SUMMER), 'null');
check('di-kilalang session -> wala', API._sessionUaeWindow('Something Else', SUMMER), 'null');
check('blangko -> wala', API._sessionUaeWindow('', SUMMER), 'null');

console.log('\n5. WALANG NAKA-TYPE NA ORAS SA SOURCE\n');
// Kung may "11am" o "8pm" na literal sa tabi ng session, ibig sabihin may
// naka-hardcode at babalik ang bug tuwing magpapalit ng DST.
// Alisin muna ang komentaryo — ang mga halimbawang "4pm–8pm" at
// "London = 11am–8pm" doon ay paliwanag, hindi naka-hardcode na oras, at
// tumatama sila sa check kung hindi tatanggalin.
const block = js.slice(js.indexOf('const SESSION_WINDOWS'),
                       js.indexOf('const MET_ORDER'))
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('walang naka-hardcode na am/pm', /['"]\d+\s*(am|pm)/i.test(block), false);
check('galing sa Intl ang offset', /Intl\.DateTimeFormat/.test(block), true);
check('naka-IANA ang mga zone', (block.match(/tz:'[A-Za-z]+\/[A-Za-z_]+'/g) || []).length, 3);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
