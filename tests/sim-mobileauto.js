const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* Ang tunay na _resolveMobileMode / applyMobileMode / _mobileModeChoice mula
   mismo sa dashboard.js — hindi kopya. Kung mababago ang file, mababago ang
   sinusuri dito.

   Ang tinatanong: sino ang nananaig sa laki ng screen at sino ang sumusunod.
   Tatlong estado ('1' / '0' / 'auto') at dalawang laki ng screen — anim na
   kombinasyon, at ang bawat isa ay may tamang sagot. */
const fs = require('fs');
const src = fs.readFileSync(
  __ROOT + '/js/dashboard.js', 'utf8');

// Kunin ang deklarasyon nang buo — brace-matched, hindi hanggang unang ';',
// dahil ang paghinto sa ';' ay pumuputol sa gitna ng function body.
function grab(head){
  const i = src.indexOf(head);
  if(i < 0) throw new Error('hindi mahanap: ' + head);
  const b = src.indexOf('{', i);
  let d = 0;
  for(let j = b; j < src.length; j++){
    if(src[j] === '{') d++;
    else if(src[j] === '}'){ d--; if(!d) return src.slice(i, j + 1); }
  }
  throw new Error('hindi sumara: ' + head);
}
/* Kunin ang TATLONG linya mula sa file, hindi ang dalawa lang.

   Ang unang sulat nito ay kinukuha ang MOBILE_MAX pero isinusulat ang sariling
   MOBILE_MQ — kaya nang dagdagan ko ng max-height ang tunay na query, ang sim
   ay patuloy na sinusubukan ang LUMA at pumasa nang malinis habang wala
   itong nasusuri sa bago. Ang isang sim na nagsusulat ng sariling kopya ng
   sinusuri nito ay sinusubukan ang sarili niyang kopya. */
const CONST = /const MOBILE_MAX = (\d+);/.exec(src);
if(!CONST) throw new Error('walang MOBILE_MAX');
const MOBILE_MAX = +CONST[1];
const CONST_H = /const MOBILE_MAX_H = (\d+);/.exec(src);
if(!CONST_H) throw new Error('walang MOBILE_MAX_H');
const MOBILE_MAX_H = +CONST_H[1];
const MQ_LINE = /const MOBILE_MQ\s*=\s*[^\n]*/.exec(src);
if(!MQ_LINE) throw new Error('walang MOBILE_MQ');

const code = [
  'const MOBILE_MAX = ' + MOBILE_MAX + ';',
  'const MOBILE_MAX_H = ' + MOBILE_MAX_H + ';',
  MQ_LINE[0],                       // ang tunay na linya, hindi kopya
  grab('function _mobileModeChoice()'),
  grab('function _screenWantsMobile()'),
  grab('function _resolveMobileMode()'),
  grab('function applyMobileMode(on)'),
].join('\n');

let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(46) +
    (ok ? String(got) : 'nakuha=' + got + '  dapat=' + want));
};

// --- pekeng mundo: isang body na may classList, isang localStorage, isang screen
function world(width, saved, height){
  height = height ?? 900;   // patayo maliban kung sinasabi ng pagsubok
  const cls = new Set();
  const store = saved === null ? {} : { 'ledger-mobile-mode': saved };
  const drawn = [];
  /* Ang MOBILE_MAX at MOBILE_MQ ay idineklara na sa loob ng `code` — huwag
     silang ipasa rin bilang parameter, dahil ang const na kapangalan ng
     parameter ay SyntaxError. */
  const env = {
    document: {
      body: { classList: {
        toggle: (n, on) => { on ? cls.add(n) : cls.delete(n); return on; },
        contains: n => cls.has(n),
        add: n => cls.add(n), remove: n => cls.delete(n),
      } },
      getElementById: () => ({ classList: { remove(){}, add(){}, toggle(){} } }),
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    /* Ang query ay dalawa na ngayon: "(max-width:820px),(max-height:480px)".
       Ang lumang peke ay kinukuha lang ang unang max-width at hindi nakikita
       ang taas — at ang mismong bagay na idinagdag ko ay ang taas. */
    window: { matchMedia: q => {
      const w = /max-width:(\d+)px/.exec(q);
      const h = /max-height:(\d+)px/.exec(q);
      const hit = (w && width <= +w[1]) || (h && height <= +h[1]);
      return { matches: !!hit };
    } },
    closeMobileMenu: () => {},
    FILTERED: [], ALL_TRADES: [{}],   // may laman: subukin ang landas ng pag-guhit
    renderEquityCurve:        () => drawn.push('equity'),
    renderWinLossChart:       () => drawn.push('winloss'),
    renderDisciplineRadar:    () => drawn.push('radar'),
    renderDayOfWeekChart:     () => drawn.push('dow'),
    renderSessionFrequencyChart: () => drawn.push('session'),
    renderBreakdown:          () => drawn.push('breakdown'),
    syncUIPrefsToProfile:     () => {},
  };
  const names = Object.keys(env);
  const fn = new Function(...names, code +
    '\nreturn { _resolveMobileMode, applyMobileMode, _mobileModeChoice, _screenWantsMobile };');
  const api = fn(...names.map(n => env[n]));
  return { api, cls, store, drawn };
}

const PHONE = 390, TABLET = 800, LAPTOP = 1440;

console.log('MOBILE_MAX = ' + MOBILE_MAX + 'px\n');
console.log('1. WALANG NAKA-SAVE — dapat ang screen ang sumagot\n');
[[PHONE, true, 'telepono 390px'],
 [TABLET, true, 'maliit na tablet 800px'],
 [LAPTOP, false, 'laptop 1440px'],
].forEach(([w, want, name]) => {
  const { api, cls } = world(w, null);
  api._resolveMobileMode();
  check(name, cls.has('mobile-mode'), want);
});

console.log('\n1b. ANG TAAS — ang teleponong nakahiga\n');
/* Ang 844×390 ay mas malapad sa 820, kaya sa lapad lang ay desktop shell ang
   makukuha nito: isang sidebar na tumatayo nang patayo sa 390px na taas.
   Ito ang bahaging idinagdag, at ito ang eksaktong sinusukat dito. */
[[844, 390, true,  'teleponong nakahiga 844×390'],
 [926, 428, true,  'mas malaking telepono 926×428'],
 [1180, 820, false,'tablet na nakahiga 1180×820'],
 [1440, 900, false,'laptop 1440×900'],
 [1024, 640, false,'maliit na laptop 1024×640'],
].forEach(([w, h, want, name]) => {
  const { api, cls } = world(w, null, h);
  api._resolveMobileMode();
  check(name, cls.has('mobile-mode'), want);
});

console.log('\n2. ITO ANG SIRA NOON — walang naka-save sa telepono\n');
{
  // Ang lumang code: `if(saved === '1') add('mobile-mode')`. Wala pang laman
  // ang storage sa unang pagbisita, kaya hindi ito kailanman bumukas.
  const { cls } = world(PHONE, null);
  const luma = (localStorage => {
    let saved = localStorage.getItem('ledger-mobile-mode');
    return saved === '1';
  })({ getItem: () => null });
  check('ang LUMANG lohika sa telepono', luma, false);   // false = sira nga
  const { api, cls: bago } = world(PHONE, null);
  api._resolveMobileMode();
  check('ang BAGONG lohika sa telepono', bago.has('mobile-mode'), true);
}

console.log('\n3. ANG PINILI AY NANANAIG SA SCREEN\n');
[["'1' sa laptop  → Mobile parin", LAPTOP, '1', true],
 ["'0' sa telepono → Desktop parin", PHONE, '0', false],
 ["'auto' sa laptop  → Desktop", LAPTOP, 'auto', false],
 ["'auto' sa telepono → Mobile", PHONE, 'auto', true],
].forEach(([name, w, saved, want]) => {
  const { api, cls } = world(w, saved);
  api._resolveMobileMode();
  check(name, cls.has('mobile-mode'), want);
});

console.log('\n4. ANG AUTO AY HINDI DAPAT SUMULAT SA STORAGE\n');
{
  const { api, store } = world(PHONE, null);
  api._resolveMobileMode();
  check('walang naisulat ng _resolveMobileMode',
    Object.keys(store).length, 0);
  // Kung sumulat ito, ang unang pagbisita sa telepono ay magki-kandado ng '1'
  // at ang paglipat sa laptop ay mananatiling phone layout habambuhay.
}

console.log('\n5. ANG PAGPILI AY SUMUSULAT — at tama ang naisulat\n');
[[ 'auto', 'auto' ], [ true, '1' ], [ false, '0' ]].forEach(([arg, want]) => {
  const { api, store } = world(LAPTOP, null);
  api.applyMobileMode(arg);
  check('applyMobileMode(' + JSON.stringify(arg) + ')',
    store['ledger-mobile-mode'], want);
});

console.log("\n6. ANG BITAG: !!'auto' ay true\n");
{
  // Kung hindi hinawakan ang 'auto' bago ang !!, ang pagpili ng Automatic sa
  // isang laptop ay magbubukas ng phone layout — tahimik at mali.
  const { api, cls } = world(LAPTOP, null);
  api.applyMobileMode('auto');
  check("Automatic sa laptop ay NANANATILING desktop", cls.has('mobile-mode'), false);
  const { api: a2, cls: c2 } = world(PHONE, null);
  a2.applyMobileMode('auto');
  check("Automatic sa telepono ay bumubukas", c2.has('mobile-mode'), true);
}

console.log('\n7. MULING IGINUGUHIT ANG CHART KAPAG NAGBAGO ANG LAYOUT\n');
{
  const { api, drawn } = world(PHONE, null);
  api.applyMobileMode(true);
  check('anim na chart ang muling iginuhit', drawn.length, 6);
}

console.log('\n8. NAGSASABI ANG _resolveMobileMode KUNG NAGBAGO\n');
{
  const { api } = world(PHONE, null);
  check('unang tawag sa telepono: nagbago', api._resolveMobileMode(), true);
  check('pangalawang tawag: wala nang bago', api._resolveMobileMode(), false);
  const { api: a2 } = world(LAPTOP, null);
  check('sa laptop: walang binago', a2._resolveMobileMode(), false);
}

console.log('\n' + (fail ? fail + ' MALI' : 'walang problema'));
process.exit(fail ? 1 : 0);
