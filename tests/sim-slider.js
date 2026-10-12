const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG APAT NA BAR, IISANG HUGIS.

   Ang bug na tatlong beses kong naulit dito ay pareho: inilipat ko ang isang
   bahagi ng bar pababa at naiwan ang isa. Ang fill ay bumaba, ang groove ay
   naiwan; ang knob ay bumaba, ang end cap ay naiwan. Bawat pagkakataon ay
   mukhang halos tama, at ang "halos" ay hindi nakikita hangga't hindi mo
   sinusukat.

   Kaya isang tanong ang itinatanong dito sa lahat ng apat: ANG GROOVE, ANG
   FILL, ANG KNOB AT ANG END CAP AY NASA IISANG LINYA BA? At may puwang ba ang
   bula sa itaas para sa tuka nito?

   Hindi ito bumubukas ng browser — binabasa nito ang CSS at kinukuwenta ang
   posisyon ng bawat bahagi, kaya tumatakbo ito kasama ng ibang sim. */
const fs = require('fs');
const css = fs.readFileSync(
  __ROOT + '/css/style.css', 'utf8');
const clean = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

let fail = 0;
const check = (ok, label, detail) => {
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(46) + (detail ?? ''));
};

/* Ang HULING deklarasyon ang panalo kapag pareho ang specificity, kaya ang
   huli ang hinahanap — hindi ang una. Ito mismo ang naging bitag: inilagay ko
   ang bagong rule bago ang orihinal at naisip kong tapos na. */
function lastDecl(selector, prop){
  const re = new RegExp('(^|[\\n}])\\s*' +
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '\\s*\\{([^}]*)\\}', 'g');
  let m, val = null;
  while((m = re.exec(clean))){
    const p = new RegExp('(?:^|[;{\\s])' + prop + '\\s*:\\s*([^;}]+)').exec(m[2]);
    if(p) val = p[1].trim();
  }
  return val;
}

// "34px" -> 34 ; "50%" na may kilalang taas -> px
function px(v, h){
  if(v === null) return null;
  if(/px$/.test(v)) return parseFloat(v);
  if(/%$/.test(v) && h !== null) return parseFloat(v) / 100 * h;
  return null;
}

const BARS = [
  { name: 'Calendar',      track: '.cal-goal-track',
    groove: '.cal-goal-track::before', fill: '.cal-goal-track i',
    knob: '.cal-goal-track u', end: '.cal-goal-track .cal-goal-end',
    bubble: '.cal-goal-track b', knobSize: 15 },
  { name: 'Year (buwan)',  track: '.yo-bar',
    groove: '.yo-bar::before', fill: '.yo-bar i',
    knob: '.yo-bar u', end: '.yo-bar .yo-bar-end',
    bubble: '.yo-bar b', knobSize: 11 },
  { name: 'Year (taon)',   track: '.yo-bar.year',
    groove: '.yo-bar.year::before', fill: '.yo-bar.year i',
    knob: '.yo-bar.year u', end: '.yo-bar.year .yo-bar-end',
    bubble: '.yo-bar.year b', knobSize: 15, inherit: '.yo-bar' },
  { name: 'My Accounts',   track: '.account-progress-bar',
    groove: '.account-progress-bar::before', fill: '.account-progress-fill',
    knob: '.account-progress-knob', end: '.account-progress-bar .account-progress-end',
    bubble: '.account-progress-pct', knobSize: 15 },
];

console.log('ANG APAT NA BAR — nasa iisang linya ba ang bawat bahagi?\n');

for(const b of BARS){
  const h = px(lastDecl(b.track, 'height'), null)
         ?? px(lastDecl(b.inherit || b.track, 'height'), null);
  console.log('  ' + b.name + '  (track ' + (h === null ? '?' : h + 'px') + ')');
  if(h === null){ check(false, '    may taas ang track', '(hindi mabasa)'); continue; }

  const parts = ['groove', 'fill', 'knob', 'end'].map(k => {
    let v = lastDecl(b[k], 'top');
    if(v === null && b.inherit) v = lastDecl(b[k].replace(b.track, b.inherit), 'top');
    return { k, raw: v, y: px(v, h) };
  });

  const ys = parts.filter(p => p.y !== null).map(p => p.y);
  const spread = ys.length ? Math.max(...ys) - Math.min(...ys) : 999;
  check(parts.every(p => p.y !== null) && spread <= 1,
    '    magkakapantay ang groove/fill/knob/end',
    parts.map(p => p.k + '=' + (p.raw ?? '?')).join('  '));

  /* Ang bula: may puwang ba sa itaas ng knob para sa tuka?
     Ang Calendar ay may NEGATIBONG top — lumulutang ito sa labas ng track,
     papasok sa padding ng panel, dahil ang linya nito ay dapat nasa gitna
     (kasama ito sa isang hilera ng teksto at kailangang pumantay sa kanila).
     Ang tatlo ay nag-iisa sa sariling hilera, kaya kasya ang bula sa loob. */
  const bt = px(lastDecl(b.bubble, 'top'), h);
  if(bt === null){ check(false, '    may posisyon ang bula', '(hindi mabasa)'); continue; }
  const line = ys.length ? ys[0] : null;
  const knobTop = line - b.knobSize / 2;
  // Taas ng bula: padding sa itaas at ibaba + taas ng linya ng teksto.
  const pad = /padding:\s*([\d.]+)px/.exec(
    (new RegExp(b.bubble.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g')
      .exec(clean) || [,''])[1] || '') ;
  const bubbleH = 17;   // magaspang pero pare-pareho sa apat
  const gap = knobTop - (bt + bubbleH);
  check(gap >= -1 && gap <= 12,
    '    may puwang ang bula sa itaas ng knob',
    'bula=' + bt + 'px  knob-taas=' + knobTop.toFixed(1) + 'px  puwang≈' + gap.toFixed(1) + 'px');
}

/* At ang huling tanong: ang knob ba ay naka-clamp? Hindi ito dapat — ang bula
   lang. Ang isang naka-clamp na knob ay tumuturo sa maling lugar sa mababang
   porsyento, na siyang buong dahilan kung bakit may knob. */
/* DALAWANG magkaibang clamp, at ang pagkakaiba ang buong punto.

   Ang KNOB ay naka-clamp sa sarili nitong radius — sapat lang para hindi ito
   lumabas sa track (sa 0% ay nakausli ang kalahati nito sa gilid, at iyon ang
   nakita niya sa Year overview), at masyadong maliit para masira ang pagtugma
   nito sa dulo ng fill.

   Ang BULA ay naka-clamp nang malaki (20px+) para manatiling nababasa ang
   teksto. Kung gagamitin ang clamp ng bula sa knob, sa mababang porsyento ay
   lalayo ang knob sa dulo ng fill at ituturo ang maling lugar.

   Kaya hindi "may clamp ba" ang tanong kundi GAANO KALAKI. */
console.log('\n  Tama ba ang clamp ng knob at ng bula?\n');
for(const b of BARS){
  const kl = lastDecl(b.knob, 'left');
  const bl = lastDecl(b.bubble, 'left');
  if(kl === null){ check(false, '    ' + b.name, '(walang knob)'); continue; }
  const kMin = parseFloat((/clamp\(\s*([\d.]+)px/.exec(kl) || [,'0'])[1]);
  const r = b.knobSize / 2;
  check(/var\(--p/.test(kl) && kMin <= r + 0.5,
    '    ' + b.name.padEnd(16) + ' knob: radius lang ang clamp',
    kMin + 'px (radius ' + r + 'px)');
  if(bl !== null){
    const bMin = parseFloat((/clamp\(\s*([\d.]+)px/.exec(bl) || [,'0'])[1]);
    /* PAREHONG clamp ng knob, hindi mas malaki. Ito ang bug na nakita niya sa
       isang buwang lugi: ang knob ay nasa dulong kaliwa, ang bula ay 20px sa
       kanan nito, at ang tuka ay tumuturo sa tabi ng knob at hindi sa knob. */
    check(/clamp\(/.test(bl) && Math.abs(bMin - kMin) < 0.01,
      '    ' + b.name.padEnd(16) + ' bula: magkatapat sa knob',
      'bula=' + bMin + 'px  knob=' + kMin + 'px');
  }
}

/* ---- Ang bilang sa bula ay dapat naglalarawan sa BAR, hindi sa totoong
   halaga. Sa isang buwang lugi, ang bar ay nasa 0 at ang bula ay dating
   nagsasabing "-16%" habang nakalutang sa itaas ng isang knob na nasa dulong
   kaliwa — dalawang magkasalungat na bagay sa iisang tingin. */
console.log('\n  Naka-clamp ba ang bilang sa bula? (JS)\n');
{
  const js = fs.readFileSync(
    __ROOT + '/js/dashboard.js', 'utf8');
  /* Ang BILANG sa bula ay ang totoo, kasama ang negatibo — sinabi niya mismo
     na dapat makita iyon, at tama siya: ang "-16%" ang bagay na kailangan
     mong malaman. Ang bar ay nasa zero dahil walang bar na negatibo; ang
     bilang ang nagsasabi ng totoo. Kaya ang tinitingnan dito ay na ang bula ay
     HINDI naka-clamp sa 0..100. */
  check(/<b style="--p:\$\{pct\.toFixed\(1\)\}%">\$\{shownTrue\}%<\/b>/.test(js),
    '    Calendar        bula = totoong bilang', '');
  check(/<b style="--p:\$\{pct\.toFixed\(1\)\}%">\$\{Math\.round\(pctTrue\)\}%<\/b>/.test(js),
    '    Year (taon)     bula = totoong bilang', '');
  check(/account-progress-pct[^>]*>\$\{pctTrue\}%/.test(js),
    '    My Accounts     bula = totoong bilang', '');
  check(!/shownBar/.test(js), '    wala nang shownBar na naiwan', '');
  // At ang POSISYON ay galing pa rin sa naka-clamp na halaga.
  check(/const pct  = Math\.max\(0, Math\.min\(100, made \/ need \* 100\)\)/.test(js),
    '    posisyon ay naka-clamp 0..100', '');
}

/* Wala nang start dot. Sa 0% ay dalawang magkapatong na bilog sila dati — ang
   start dot at ang knob, magkasing-laki, walang linya sa pagitan dahil zero
   ang fill. Iyon ang "ligaw na tuldok" sa Year overview. Ang isang slider ay
   may track at may thumb; ang knob na ang panimula. */
console.log('\n  Wala na bang start dot?\n');
{
  const hidden = /\.cal-goal-track i::before,\s*\.yo-bar i::before\{display:none;\}/.test(clean);
  check(hidden, '    nakatago ang start dot ng dalawang bar', hidden ? '' : '(nandiyan pa)');
}

console.log('\n' + (fail ? fail + ' MALI' : 'iisang hugis ang apat'));
process.exit(fail ? 1 : 0);
