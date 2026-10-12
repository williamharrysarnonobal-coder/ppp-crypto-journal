const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG PAGLALAKBAY NG TAON — anim na sanga, at ang bawat isa ay dapat TOTOO.

   Ang panganib dito ay hindi bug kundi kasinungalingan. Ang "great year!" sa
   itaas ng isang taong lugi ay hindi motivation — patunay iyon na hindi
   tumitingin ang app, at kapag nabasa mo iyon nang minsan ay titigil ka nang
   magbasa magpakailanman.

   Kaya bawat sanga ay pinapatakbo dito sa datos na dapat itong pumili, at ang
   sinusuri ay hindi lang "may lumabas ba" kundi TAMA BA ang lumabas para sa
   datos na iyon. */
const fs = require('fs');
const js = fs.readFileSync(
  __ROOT + '/js/dashboard.js', 'utf8');

function fn(name){
  const i = js.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('missing ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(i, j + 1); }
  }
}

const api = new Function('fmtMoney', '_askAmt', '_brokenRuleTags', `
  ${fn('_yearJourneyStreak')}
  ${fn('_yearJourney')}
  return { _yearJourney, _yearJourneyStreak };
`)(
  n => (n < 0 ? '-' : '+') + '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  n => '$' + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  v => String(v || '').split(',').map(s => s.trim())
        .filter(s => s && s !== 'Rules Followed')
);

let fail = 0;
const check = (ok, label, detail) => {
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'MALI ') + label.padEnd(48) + (detail ?? ''));
};

// Isang buwan: bilang ng trade, netong halaga, at opsyonal na mga tag.
const M = (m, n, net, tags) => ({
  m, n, net,
  trades: Array.from({ length: n }, () => ({ unfollowed_rules: tags || '' })),
});
const run = (months, y, goalUsd, todayY) => {
  const traded = months.filter(mo => mo.n > 0);
  const net = months.reduce((s, mo) => s + mo.net, 0);
  return api._yearJourney(months, traded, y, net, goalUsd ?? null,
    new Date(todayY ?? 2027, 5, 1));
};

console.log('1. ANG PINAKAMAHABANG TUHOG NA BERDE\n');
check(api._yearJourneyStreak([M(0,2,100), M(1,2,50), M(2,2,-10), M(3,2,80), M(4,2,90), M(5,2,70)]) === 3,
  'tatlo sa dulo, hindi dalawa sa unahan', String(api._yearJourneyStreak(
    [M(0,2,100), M(1,2,50), M(2,2,-10), M(3,2,80), M(4,2,90), M(5,2,70)])));
// Ang buwang walang trade ay hindi pumuputol — hindi ka sumablay, hindi ka lang
// nag-trade. Ito ang madaling makaligtaan.
check(api._yearJourneyStreak([M(0,2,100), M(1,0,0), M(2,2,80)]) === 2,
  'hindi pumuputol ang buwang walang trade', String(api._yearJourneyStreak(
    [M(0,2,100), M(1,0,0), M(2,2,80)])));

console.log('\n2. ANG ANIM NA SANGA\n');

// (1) Nasakop ang buong taon ng sahod.
let r = run([M(0,5,3000), M(1,5,3000), M(2,5,3000), M(3,5,3000),
             M(4,5,3000), M(5,5,3000), M(6,5,3000), M(7,5,3000),
             M(8,5,3000), M(9,5,3000), M(10,5,3000), M(11,5,3000)], 2026, 2000);
console.log('   (1) ' + r.headline);
check(/paid for itself/.test(r.headline), 'sahod ng buong taon ang nangunguna', r.tone);

// (2) Umahon mula sa pinakamasamang buwan.
r = run([M(0,5,200), M(1,5,-900), M(2,5,300), M(3,5,400), M(4,5,350)], 2026, 99999);
console.log('   (2) ' + r.headline);
check(/every month since has been green/.test(r.headline), 'ang pag-ahon ang nangunguna', r.tone);
check(/\$900/.test(r.headline), 'nakasulat ang halaga ng pagkalugi', '');

// (3) Mas mahusay ang huling kalahati.
r = run([M(0,5,100), M(1,5,150), M(2,5,-50), M(3,5,900), M(4,5,1200), M(5,5,1100)], 2026, 99999);
console.log('   (3) ' + r.headline);
check(/getting better|different trader/.test(r.headline), 'ang trajectory ang nangunguna', r.tone);

// (4) Pare-pareho — sunod-sunod na berde pero patag.
r = run([M(0,5,300), M(1,5,300), M(2,5,300), M(3,5,300), M(4,5,300)], 2026, 99999);
console.log('   (4) ' + r.headline);
check(/Consistency is the rarest/.test(r.headline), 'ang consistency ang nangunguna', r.tone);

// (5) Positibo lang, walang malinaw na hugis.
r = run([M(0,5,500), M(1,5,-400), M(2,5,300), M(3,5,-200)], 2026, 99999);
console.log('   (5) ' + r.headline);
check(/up across/.test(r.headline), 'ang simpleng positibo', r.tone);

/* (6) ANG MASAMANG TAON. Ito ang pinakamahalagang pagsubok sa buong file:
   hindi dapat magsinungaling, pero hindi rin dapat manahimik. */
r = run([M(0,5,-500), M(1,5,400), M(2,5,-900), M(3,5,-300)], 2026, 99999);
console.log('   (6) ' + r.headline);
check(r.tone === 'bad', 'alam nitong masama ang taon', r.tone);
check(!/great|amazing|well done|excellent/i.test(r.headline),
  'walang papuring hindi totoo', '');
check(/is down/.test(r.headline), 'sinasabi nitong bumababa', '');
check(/still finished green/.test(r.headline),
  'pero hinahanap nito ang totoong maipagmamalaki', '');

// (6b) Masamang taon na WALANG kahit isang berdeng buwan — walang
//      maipagmamalaki, kaya hindi dapat mag-imbento.
r = run([M(0,5,-500), M(1,5,-400), M(2,5,-900)], 2026, 99999);
console.log('   (6b) ' + r.headline);
check(r.tone === 'bad', 'masama pa rin', r.tone);
check(!/finished green/.test(r.headline), 'hindi nag-iimbento ng berdeng buwan', '');
check(/journal/.test(r.headline), 'nakatuon sa susunod', '');

/* Ang $50 na dip ay HINDI setback. Kailangang mabigat ang pagkalugi para
   maging kuwento ang pag-ahon — kung hindi, ang bawat maliit na pagkadapa ay
   nagiging "Coming back is the part most people never manage", na totoo ang
   bawat salita at katawa-tawa pa rin. */
console.log('\n2b. ANG MALIIT NA DIP AY HINDI PAG-AHON\n');
r = run([M(0,5,900), M(1,5,-50), M(2,5,1000), M(3,5,1100)], 2026, 99999);
console.log('   ' + r.headline);
check(!/Coming back/.test(r.headline), 'hindi ito tinatawag na pag-ahon', '');
// Pero ang MABIGAT na pagkalugi ay pag-ahon pa rin.
r = run([M(0,5,900), M(1,5,-800), M(2,5,1000), M(3,5,1100)], 2026, 99999);
console.log('   ' + r.headline);
check(/Coming back/.test(r.headline), 'ang mabigat ay pag-ahon pa rin', '');

console.log('\n3. ANG MGA CHIP\n');
r = run([M(0,6,300,'Rules Followed'), M(1,6,400,'Rules Followed'),
         M(2,6,-100,'Revenge Trade'), M(3,6,500,'Rules Followed')], 2026, 99999);
r.chips.forEach(c => console.log('   ' + c.k.padEnd(24) + String(c.v).padEnd(22) + (c.tone || '')));
const keys = r.chips.map(c => c.k);
check(keys.includes('months traded'), 'may bilang ng buwan', keys.join(' · '));
check(keys.includes('rules kept'), 'may disiplina', '');
const rk = r.chips.find(c => c.k === 'rules kept');
check(rk && rk.v === '75%', 'tama ang disiplina (18 sa 24)', rk ? rk.v : '(wala)');
// Walang chip na doble sa stats row sa itaas.
const inStats = ['Profit','Trades','Win','Loss','BE','Avg RR','Win rate',
                 'Avg trading days','Green months','Goals hit'].map(s => s.toLowerCase());
check(!keys.some(k => inStats.includes(k)), 'walang chip na doble sa stats row',
  keys.filter(k => inStats.includes(k)).join(', ') || '(wala)');

console.log('\n4. WALANG DATOS\n');
check(run([M(0,0,0), M(1,0,0)], 2026, 99999) === null,
  'walang lumalabas kapag walang trade', '');

console.log('\n' + (fail ? fail + ' MALI' : 'totoo ang bawat sanga'));
process.exit(fail ? 1 : 0);
