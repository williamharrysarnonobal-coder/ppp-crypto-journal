const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
/* ANG AUTO-FAIL NG ACCOUNT.

   Minamarkahan nitong Failed ang isang account noon at agad ding isinusulat sa
   database, batay sa KABUUAN NG MGA NAITALANG TRADE sa isang araw. Mali iyon:
   ang balanseng nasa card ay `current_balance` — isang numerong siya mismo ang
   naglalagay mula sa broker — kaya ang isang naitalang araw na -$260 ay
   nagmamarka ng Failed habang sinasabi ng balanse, at ng website ng prop firm,
   na buo pa ang account.

   At permanente ito: ang pagbabalik sa Ongoing ay hindi tumatagal dahil sa
   susunod na pagbukas ay muli itong babagsak.

   Nagbababala na lang ito ngayon. Walang isinusulat kung walang pumipindot. */
const fs = require('fs');
const ROOT = process.env.PPP_ROOT || __ROOT + '';
const js = fs.readFileSync(ROOT + '/js/dashboard.js', 'utf8');
const css = fs.readFileSync(ROOT + '/css/style.css', 'utf8');

function fnBody(name){
  const i = js.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('nawawala ang ' + name);
  let d = 0;
  for (let j = js.indexOf('{', i); j < js.length; j++) {
    if (js[j] === '{') d++;
    else if (js[j] === '}') { d--; if (!d) return js.slice(i, j + 1); }
  }
}

let fail = 0;
const ok = (l, c, x) => { if (!c) fail++;
  console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(52) + (x || '')); };

console.log('1. WALA NANG TAHIMIK NA PAGSULAT\n');
ok('wala nang _autoDetectAccountStatus', !/_autoDetectAccountStatus/.test(js));
const flag = fnBody('_flagAccountBreaches');
ok('ang tumatakbo sa pagbukas ay walang fetch', !/fetch\(/.test(flag));
ok('at hindi nito ginagalaw ang status', !/status/.test(flag.replace(/_breach/g, '')));
const warn = fnBody('_accountBreachWarning');
ok('ang pagsusuri mismo ay walang fetch', !/fetch\(/.test(warn));
/* Ang tanging PATCH ng status ay dapat nasa loob ng function na may
   customConfirm — ibig sabihin may taong pumipindot. */
const mark = fnBody('markAccountFailed');
ok('may customConfirm bago ang pagsulat',
   mark.indexOf('customConfirm') < mark.indexOf('fetch('),
   'confirm@' + mark.indexOf('customConfirm') + '  fetch@' + mark.indexOf('fetch('));
/* Dalawang tawag ngayon, pero iisang function pa rin: sinusubukan muna ang
   status KASAMA ang dahilan, at kung tinanggihan ito ng PostgREST dahil bago
   pa ang column, inuulit nang wala iyon. Ang mahalaga ay hindi ang bilang ng
   tawag kundi na LAHAT sila ay nasa loob ng markAccountFailed — ang tanging
   daan na may taong pumipindot. */
const failWrites = [...js.matchAll(/status: 'Failed'/g)].map(m => m.index);
ok('bawat pagsulat ng Failed ay nasa markAccountFailed',
   failWrites.every(i => {
     const start = js.indexOf('async function markAccountFailed(');
     return i > start && i < start + mark.length;
   }), failWrites.length + ' pagsulat');
ok('may fallback kapag wala pa ang column',
   /fail_reason not saved/.test(mark) && /patch\(\{ status: 'Failed' \}\)/.test(mark));
ok('naitatala ang dahilan', /fail_reason: reason/.test(mark));
ok('may petsa ang dahilan', /toISOString\(\)\.slice\(0, 10\)/.test(mark));

console.log('\n2. ANG MISMONG PAGSUSURI\n');
const check = new Function('computeAccountStats', fnBody('_accountBreachWarning') +
  ' return _accountBreachWarning;');

const stats = s => () => s;
const acc = (extra) => ({ account_name:'Upscale Trade 5K', account_type:'Prop',
                          status:'Ongoing', ...extra });

/* Ang eksaktong kalagayan niya: buo ang balanse, malayo sa floor. */
let r = check(stats({ currentBalance:5000, drawdownFloor:4500,
                      dailyLossLimit:250, dayPL:{} }))(acc());
ok('walang trade -> walang babala', r === null, r ? r.kind : 'null');

r = check(stats({ currentBalance:5000, drawdownFloor:4500, dailyLossLimit:250,
                  dayPL:{ [Date.UTC(2026,8,2)]: -265 } }))(acc());
ok('may -265 na araw -> BABALA, hindi hatol', r && r.kind === 'daily', r ? r.kind : 'wala');
console.log('     "' + (r ? r.text : '') + '"');
ok('sinasabi ang halaga', r && /265\.00/.test(r.text));
ok('sinasabi ang araw', r && /Sep|2026/.test(r.text));
/* Ito ang pinakamahalaga: sinasabi nitong hindi tugma ang balanse, dahil iyon
   mismo ang dahilan kung bakit siya nagulat. */
ok('sinasabing buo pa ang balanse', r && /balance still reads/.test(r.text));
ok('sinasabing tingnan muna ang prop firm', r && /check the prop firm/i.test(r.text));

r = check(stats({ currentBalance:4400, drawdownFloor:4500, dailyLossLimit:250,
                  dayPL:{} }))(acc());
ok('tunay na drawdown -> babala pa rin', r && r.kind === 'drawdown', r ? r.kind : 'wala');

console.log('\n3. HINDI INUULIT ANG NAPAGDESISYUNAN NA\n');
r = check(stats({ currentBalance:4400, drawdownFloor:4500, dailyLossLimit:250, dayPL:{} }))
  (acc({ status:'Failed' }));
ok('ang Failed ay hindi na binabalaan', r === null, r ? r.kind : 'null');
r = check(stats({ currentBalance:4400, drawdownFloor:4500, dailyLossLimit:250, dayPL:{} }))
  (acc({ status:'Passed' }));
ok('ang Passed ay hindi na binabalaan', r === null, r ? r.kind : 'null');
r = check(stats({ currentBalance:1, drawdownFloor:4500, dailyLossLimit:250, dayPL:{} }))
  (acc({ account_type:'Exchange' }));
ok('ang Exchange ay walang panuntunan', r === null, r ? r.kind : 'null');

console.log('\n4. ANG PINAKAMASAMANG ARAW ANG IPINAPAKITA\n');
r = check(stats({ currentBalance:5000, drawdownFloor:4500, dailyLossLimit:250,
                  dayPL:{ [Date.UTC(2026,8,2)]: -260, [Date.UTC(2026,8,5)]: -430 } }))(acc());
ok('ang -430 ang sinasabi, hindi ang -260', r && /430\.00/.test(r.text), r ? r.text.slice(0,60) : '');

console.log('\n5. NASA CARD BA ANG DAHILAN?\n');
/* Ang isang account na "Failed" na walang dahilan ay isang bagay na hindi mo
   na maaalala sa susunod na buwan. At ang mga naunang bumagsak ay walang
   naitalang dahilan — sinasabi iyon nang tahasan sa halip na magmukhang blangko. */
ok('ipinapakita ang fail_reason', /a\.fail_reason/.test(js) && /acct-failed-why/.test(js));
ok('may sinasabi kahit walang naitala',
   /No reason recorded/.test(js));
ok('may kulay ang tala sa CSS', /\.acct-failed-why\{/.test(css));

console.log('\n5a. ANG PAG-AKYAT NG PHASE — hindi na rin kusa\n');
/* Iisang sakit ito ng auto-fail, at mas masakit ang bunga: kusang inaakyat
   noon ang account, nire-reset ang balanse, at binubura ang buong talaan ng
   phase — at walang paraan para bawiin. Nangyari iyon sa 5K niya. */
ok('wala nang _autoAdvanceAccountPhases', !/_autoAdvanceAccountPhases/.test(js));
const flagPh = fnBody('_flagAccountPhases');
ok('ang tumatakbo sa pagbukas ay walang fetch', !/fetch\(/.test(flagPh));
const adv = fnBody('advanceAccountPhase');
ok('may tanong bago ang pagsulat',
   adv.indexOf('customConfirm') < adv.indexOf('fetch('),
   'confirm@' + adv.indexOf('customConfirm') + '  fetch@' + adv.indexOf('fetch('));
ok('sinasabi nitong binubura ang lahat',
   /starts counting from zero again/.test(adv));
ok('may pindutan sa card', /advanceAccountPhase\(\$\{a\.id\}\)/.test(js));
ok('may kulay sa CSS', /\.acct-phase-up\{/.test(css));

console.log('\n5b. ANG DAAN PABALIK\n');
/* Ang pag-alis ng auto-fail ay pumipigil sa pagbagsak ULIT — hindi nito
   binubura ang nakasulat na sa database, at hindi rin dapat: baka totoong
   bumagsak nga ang ibang account. Kaya kailangan ng paraan, at dapat nakikita. */
const unfail = fnBody('setAccountOngoing');
ok('may setAccountOngoing', !!unfail);
ok('may tanong bago baguhin', unfail.indexOf('customConfirm') < unfail.indexOf('fetch('));
ok('binubura rin ang dahilan', /fail_reason: null/.test(unfail));
// Ang IPINAPADALA lang ang binibilang — may pangatlong "Ongoing" sa
// Object.assign na nag-a-update ng lokal na kopya, at hindi iyon isang sulat.
ok('may fallback kung wala pa ang column',
   (unfail.match(/JSON\.stringify\(\{ status: 'Ongoing'/g) || []).length === 2,
   (unfail.match(/JSON\.stringify\(\{ status: 'Ongoing'/g) || []).length + ' sulat');
ok('muling sinusuri pagkatapos', /_flagAccountBreaches\(\)/.test(unfail));
ok('may pindutan sa card', /setAccountOngoing\(\$\{a\.id\}\)/.test(js));
ok('lumalabas lang ito sa Failed',
   /status === 'Failed'[\s\S]{0,400}?acct-unfail-btn/.test(js));
ok('may kulay sa CSS', /\.acct-unfail-btn\{/.test(css));

console.log('\n6. NASA CARD BA ANG BABALA?\n');
ok('may babala sa card', /a\._breach/.test(js) && /acct-breach/.test(js));
ok('may pindutan', /markAccountFailed\(\$\{a\.id\}\)/.test(js));
ok('hindi ito bumubukas ng account detail',
   /class="acct-breach" onclick='event\.stopPropagation\(\);'/.test(js));
ok('may kulay sa CSS', /\.acct-breach\{/.test(css) && /var\(--warn\)/.test(/\.acct-breach\{[^}]*\}/.exec(css)[0]));

console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
process.exit(fail ? 1 : 0);
