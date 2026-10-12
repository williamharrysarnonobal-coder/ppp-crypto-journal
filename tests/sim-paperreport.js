const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG PAPER TRADE SA REPORTS.

   "Tapos nasama mo nadin ba yung sa Report niyan sa Dashboard? Para in the
   future?" — hindi pa noon. Apat na lugar lang ang gumagamit ng paper data at
   wala ni isa sa Reports, kaya ang buwanang recap at ang PDF ay nagsasabi
   lamang ng mga trade na KINUHA niya.

   Ang sinusuri dito ay ang pinakamadaling makaligtaan: ang PETSA. Ang paper
   trade ay walang close_date dahil walang nagsara, at ang bawat ibang bahagi
   ng Reports ay sumasala sa close_date. Kung gagayahin ko iyon, walang laman
   ito magpakailanman at mukhang gumagana. */
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
function objBlock(name){
  const m = new RegExp('const ' + name + ' = \\{').exec(js);
  if(!m) throw new Error('nawawala: ' + name);
  let d = 0;
  for(let j = m.index + m[0].length - 1; j < js.length; j++){
    if(js[j] === '{') d++;
    else if(js[j] === '}'){ d--; if(!d) return js.slice(m.index, j + 1) + ';'; }
  }
}
let fail = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if(!ok) fail++;
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(52) + got + (ok ? '' : '   <-- ' + want));
};

const NO_TRADE_KIND = { 'takot': 'felt', 'wala sa bahay': 'life', 'malabo ang structure': 'setup' };
/* Maramihan na ang outcome, at ang hatol ay galing na sa _paperOutcomeKind at
   ang R sa _paperOutcomeR — hindi na sa isang talahanayan ng pares. Kinukuha
   ko ang MISMONG mga function na iyon: kung ang precedence ay magbabago, dito
   rin ito magbabago at hindi ako maiiwan sa lumang sagot. */
/* Ang hatol ay galing na sa _paperPassVerdict, na iisa para sa Dashboard, sa
   Reports at sa PDF. Kailangan din nito ang mga grupo, dahil ang uri ng
   dahilan ang nagsasabi kung ano ang aayusin — at ang bilang kada uri ay
   binubuo na mula sa listahan ng grupo, hindi sa tatlong nakasulat na pangalan. */
const stats = new Function('PAPER_TRADES','NO_TRADE_KIND','NO_TRADE_REASON_GROUPS',
  fnBody('_plannedRR') + fnBody('_paperList') + fnBody('_paperOutcomeKind') +
  fnBody('_paperOutcomeR') + fnBody('_paperPassVerdict') + fnBody('_paperDomGroup') +
  fnBody('_reportPaperStats') + ' return _reportPaperStats;');

// Ang tunay na listahan ng grupo, hindi isang kopya — kung may madagdag na
// grupo, dito rin ito lalabas.
const GROUPS = (() => {
  const m = /const NO_TRADE_REASON_GROUPS\s*=\s*\[/.exec(js);
  let d = 0;
  for (let j = m.index + m[0].length - 1; j < js.length; j++) {
    if (js[j] === '[') d++;
    else if (js[j] === ']') { d--; if (!d) return new Function(js.slice(m.index, j + 1) +
      '; return NO_TRADE_REASON_GROUPS;')(); }
  }
})();

const rr = new Function(fnBody('_plannedRR') + ' return _plannedRR;')();

const P = (day, why, out, e, tp, sl) => ({
  open_date: new Date(2026, 2, day, 10, 0),
  close_date: null,                 // walang nagsara — ito ang punto
  no_trade_reason: why, paper_outcome: out,
  entry_price: e, tp_price: tp, sl_price: sl, is_paper: true
});

const START = new Date(2026, 2, 1), END = new Date(2026, 2, 31, 23, 59);
const run = rows => stats(rows, NO_TRADE_KIND, GROUPS)(START, END);

console.log('1. NAKIKITA BA SILA KAHIT WALANG CLOSE_DATE?\n');
{
  const s = run([P(5, 'takot', 'Hit TP', 100, 130, 90)]);
  check('nabibilang ang paper trade sa panahon', s.total, 1);
  // Ito ang bitag: kung sa close_date sumala, zero ito magpakailanman.
  check('hindi ito sumasala sa close_date', s.total > 0, true);
}
{
  // Sa labas ng panahon — hindi dapat kasama.
  const s = run([P(5, 'takot', 'Hit TP', 100, 130, 90),
                 { ...P(5, 'takot', 'Hit TP', 100, 130, 90), open_date: new Date(2026, 0, 5) }]);
  check('sinusunod pa rin ang hangganan ng panahon', s.total, 1);
}

console.log('\n2. ANG BILANG\n');
{
  const rows = [
    P(2, 'takot', 'Hit TP', 100, 130, 90),          // 3R na nawala
    P(3, 'takot', 'Hit TP', 100, 120, 90),          // 2R na nawala
    P(4, 'malabo ang structure', 'Hit SL', 100, 130, 90),  // 3R na naiwasan
    P(5, 'wala sa bahay', 'Never filled', 100, 130, 90),   // walang hatol
    P(6, 'takot', '', 100, 130, 90),                // hindi pa tiningnan
    { ...P(7, '', 'Hit TP', 100, 130, 90) },        // walang dahilan
  ];
  const s = run(rows);
  console.log('     total=' + s.total + '  answered=' + s.answered +
              '  missed=' + s.missed + '  saved=' + s.saved +
              '  neverFilled=' + s.neverFilled + '  checked=' + s.checked);
  console.log('     missedRR=' + s.missedRR + '  savedRR=' + s.savedRR + '  netRR=' + s.netRR);
  check('anim na paper trade', s.total, 6);
  check('lima ang may dahilan', s.answered, 5);
  check('tatlo ang sana ay nanalo', s.missed, 3);
  check('isa ang sana ay natalo', s.saved, 1);
  check('isa ang hindi na-fill', s.neverFilled, 1);
  // Ang "Never filled" at ang "hindi pa tiningnan" ay WALA sa checked.
  check('apat lang ang tiningnan', s.checked, 4);
  check('nawalang R', s.missedRR, 8);      // 3 + 2 + 3, ang gantimpalang hindi nakuha
  /* ANG MALI NA NAHANAP KO, NAKASULAT BILANG PAGSUSURI.

     Inaasahan ng bersyong ito ang 3 dahil ginamit ko ang planned RR sa
     MAGKABILANG panig. Mali iyon: ang planned RR ay ang GANTIMPALA, at ang
     naiwasang SL ay IISANG R — iyon ang kahulugan ng risk. Ang isang 3R na
     setup na tumama sa SL ay nagligtas sa iyo ng 1R at hindi ng 3R.

     Isang naiwasang SL sa fixture na ito, kaya 1. Ang mas malaki ang RR mo,
     mas malaki sana ang kasinungalingan ng lumang numero. */
  check('naiwasang R — 1R kada SL, hindi RR', s.savedRR, 1);
  check('net', s.netRR, 7);
  check('pinakamadalas na dahilan', s.topReason[0], 'takot');
  check('at ang bilang nito', s.topReason[1], 3);
}

console.log('\n3. ANG URI\n');
{
  const s = run([P(2,'takot','',1,2,0.5), P(3,'takot','',1,2,0.5),
                 P(4,'wala sa bahay','',1,2,0.5), P(5,'malabo ang structure','',1,2,0.5)]);
  console.log('     ' + JSON.stringify(s.byKind));
  check('dalawang nadama', s.byKind.felt, 2);
  check('isang buhay', s.byKind.life, 1);
  check('isang setup', s.byKind.setup, 1);
}

console.log('\n4. WALANG LAMAN — hindi dapat sumabog\n');
{
  const s = run([]);
  check('zero ang total', s.total, 0);
  check('walang topReason', s.topReason, null);
  check('zero ang netRR, hindi NaN', s.netRR, 0);
}

console.log('\n5. NASA DALAWANG LUGAR BA — ang screen AT ang PDF?\n');
/* Ang recap sa screen at ang PDF ay dalawang magkahiwalay na tagabuo. Ang
   pagdadagdag sa isa lang ay isang seksyong nawawala mismo sa lugar kung saan
   ito pinaka-kailangan: ang PDF ang binabasa makalipas ang mga buwan. */
check('kinukuwenta sa renderReportPreview',
  /function renderReportPreview[\s\S]{0,600}_reportPaperStats\(start, end\)/.test(js), true);
check('kinukuwenta sa downloadReportPDF',
  /function downloadReportPDF[\s\S]{0,1400}_reportPaperStats\(start, end\)/.test(js), true);
check('may seksyon sa screen',
  /report-section-title">Setups you passed on/.test(js), true);
check('may seksyon sa PDF',
  /sectionTitle\('Setups you passed on'\)/.test(js), true);

console.log('\n' + (fail ? fail + ' FAIL' : 'nasa Reports na ang paper trade'));
process.exit(fail ? 1 : 0);
