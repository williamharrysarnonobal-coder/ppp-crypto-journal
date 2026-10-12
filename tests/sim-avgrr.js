const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Ang Avg RR sa buod ng Calendar. Dalawang bagay ang sinusuri: tama ba ang
// pag-average (ang nawawalang RR ay ABSENT, hindi zero), at nasa tamang puwesto
// ba ito — sa pagitan ng BE at ng Win rate.
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(56) + got + (ok ? '' : '   <-- ' + want));
};

// Kunin ang mismong dalawang linya mula sa renderCalendar at patakbuhin.
const src = /const rrVals = monthTrades[\s\S]*?const avgRR = [^\n]*/.exec(js);
if(!src) throw new Error('hindi mahanap ang pagkalkula ng avgRR sa renderCalendar');
const calc = new Function('monthTrades', src[0] + '; return { avgRR, n: rrVals.length };');

console.log('1. ANG PAG-AVERAGE\n');
const T = rr => ({ rr });
let r = calc([T(2), T(3), T(4)]);
check('simpleng average', r.avgRR, 3);
check('tatlo ang may RR', r.n, 3);

// Ang nawawala ay hindi zero — kung bibilangin bilang zero, 1.5 ito sa halip
// na 3, at magmumukhang bumagsak ang RR mo dahil lang sa kulang na datos.
r = calc([T(2), T(4), T(null), T(undefined), T(NaN)]);
console.log('   2, 4, at tatlong walang laman -> ' + r.avgRR);
check('hindi binibilang ang walang laman', r.avgRR, 3);
check('dalawa lang ang may RR', r.n, 2);

r = calc([T(null), T(null)]);
check('walang RR kahit isa -> null', r.avgRR, 'null');
check('at zero ang bilang', r.n, 0);
r = calc([]);
check('walang trade -> null', r.avgRR, 'null');

// Ang zero na RR ay TOTOONG halaga (walang TP), kaya bilang ito.
r = calc([T(0), T(4)]);
check('ang tunay na 0 ay binibilang', r.avgRR, 2);

console.log('\n2. TUGMA SA IBANG LUGAR NA NAG-AAVERAGE NG RR\n');
// May tatlong ibang lugar na ganito rin. Dapat pare-pareho ang salain nila,
// kung hindi ay magkaiba ang Avg RR depende kung saan mo titingnan.
const others = [...js.matchAll(/const rrVals = ([^\n]*)\n\s*const avgRR = ([^\n]*)/g)];
console.log('   ' + others.length + ' na lugar ang nag-aaverage ng RR');
check('apat na lugar (tatlo dati + ang bago)', others.length >= 4, true);
const filters = others.map(m => m[1].replace(/\s+/g, ' ')
  .replace(/monthTrades|trades|t\.map|arr/g, 'X').trim());
const shapes = new Set(filters.map(f => /null/.test(f) && /isNaN/.test(f)));
check('pare-pareho ang salain (null at NaN)', shapes.size === 1 && shapes.has(true), true);

console.log('\n3. ANG PUWESTO SA HANAY\n');
const block = /cell\('Profit'[\s\S]*?cell\('Win rate'[^\n]*/.exec(js)[0];
/* Ang Rules kept ay may DALAWANG tawag sa cell() — isa para sa buwang may
   tatak at isa para sa "—" kapag wala. Isang cell iyon sa hilera, dalawang
   sanga sa code, kaya inaalis ang magkasunod na pareho. */
const order = [...block.matchAll(/cell\('([^']+)'/g)].map(m => m[1])
  .filter((k, i, a) => k !== a[i - 1]);
console.log('   ' + order.join(' | '));
// Siyam na: nadagdag ang Rules kept sa pagitan ng Days traded at ng Win rate.
check('siyam na cell', order.length, 9);
check('BE bago ang Avg RR', order.indexOf('BE') + 1, order.indexOf('Avg RR'));
check('Days traded kasunod ng Avg RR', order.indexOf('Avg RR') + 1, order.indexOf('Days traded'));
/* Ang Rules kept ay nasa pagitan ng Days traded at ng Win rate — hiniling
   niyang manatiling HULI ang win rate, dahil iyon ang konklusyon ng hilera at
   doon dumadapo ang mata sa dulo. */
check('Rules kept kasunod ng Days traded', order.indexOf('Days traded') + 1, order.indexOf('Rules kept'));
check('at Win rate ang huli', order.indexOf('Rules kept') + 1, order.indexOf('Win rate'));
check('wala nang kasunod ang Win rate', order.indexOf('Win rate'), order.length - 1);
check('huli pa rin ang Win rate', order[order.length - 1], 'Win rate');

console.log('\n4. ANG BABALA KAPAG KULANG ANG SAKOP\n');
// Kung iilan lang sa buwan ang may RR, hindi na nito inilalarawan ang buwan —
// kaya kumukupas ito at sinasabi ng tooltip kung ilan ang totoong nasa likod.
check('kumukupas kapag wala sa kalahati',
  /rrVals\.length \* 2 < monthTrades\.length/.test(js), true);
check('sinasabi ng tooltip ang sakop',
  /Average planned RR across the \$\{rrVals\.length\} of \$\{monthTrades\.length\}/.test(js), true);
check('sinasabing PLANNED, hindi realized', /Average planned RR/.test(js), true);
check('may sariling mensahe kapag wala', /No trade this month has an RR recorded/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
