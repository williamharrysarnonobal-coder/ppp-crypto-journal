const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
// Two devices, one account. Does the calculator follow the account now, and
// does the pull refuse to land on top of something being typed?
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');

console.log('=== wiring');
const keys = /const UI_PREF_LS_KEYS = \{([\s\S]*?)\n\};/.exec(js)[1];
const synced = [...keys.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map(m => m[1] + ' -> ' + m[2]);
synced.forEach(s => console.log('   ' + s));
[['draft key synced', /poscalc_draft: 'poscalc-draft'/.test(keys)],
 ['risk amounts synced', /poscalc_risk_amounts: 'possize-risk-amounts'/.test(keys)],
 ['saveCalculatorDraft pushes up', /localStorage\.setItem\('poscalc-draft'[\s\S]{0,200}syncUIPrefsToProfile\(\)/.test(js)],
 ['clearCalculatorDraft pushes up', /removeItem\('poscalc-draft'\)[\s\S]{0,300}syncUIPrefsToProfile\(\)/.test(js)],
 ['risk amount write pushes up', /setItem\('possize-risk-amounts'[\s\S]{0,150}syncUIPrefsToProfile\(\)/.test(js)],
 ['pull guarded by _posCalcTouched', /poscalc_risk_amounts'\)\) && !_posCalcTouched/.test(js)],
 ['typing sets the guard', /function onPosSizeInput\(\)\{\s*\n\s*_posCalcTouched = true;/.test(js)],
 ['clear sets the guard', /removeItem\('poscalc-draft'\)[\s\S]{0,200}_posCalcTouched = true;/.test(js)],
 ['stale "device-local on purpose" comment gone', !/Device-local on purpose/.test(js)],
].forEach(([l, ok]) => console.log('   ' + (ok ? 'OK   ' : 'FAIL ') + l));

// Model the two halves of the sync against a shared "server".
console.log('\n=== two devices, one account');
function makeDevice(name, server) {
  const ls = {};
  let touched = false;
  let fields = { entry: '', tp: '', sl: '' };
  let loaded = false;
  return {
    name,
    type(f, v) { touched = true; fields[f] = v; ls['poscalc-draft'] = JSON.stringify(fields); server.draft = ls['poscalc-draft']; },
    // applyUIPrefsFromProfile: pull, then re-apply only if untouched
    login() {
      const pulled = server.draft;
      if (pulled !== undefined && ls['poscalc-draft'] !== pulled) {
        ls['poscalc-draft'] = pulled;
        if (!touched) { loaded = false; }
      }
      if (!loaded) { loaded = true; fields = ls['poscalc-draft'] ? JSON.parse(ls['poscalc-draft']) : { entry:'', tp:'', sl:'' }; }
      return fields;
    },
    shows() { return fields; },
    touched() { return touched; }
  };
}

const server = {};
const phone = makeDevice('phone', server);
phone.login();
phone.type('entry', '63040.20');
phone.type('sl', '62900');
console.log('   phone typed  : ' + JSON.stringify(phone.shows()));

const laptop = makeDevice('laptop', server);
console.log('   laptop opens : ' + JSON.stringify(laptop.login()) + '   <- the point of the change');

console.log('\n=== the race: laptop already being typed into when the profile lands');
const server2 = { draft: JSON.stringify({ entry: '111', tp: '222', sl: '333' }) };
const busy = makeDevice('laptop', server2);
busy.type('entry', '999');              // user starts typing before profile resolves
const after = busy.login();             // profile arrives
console.log('   was typing   : entry=999');
console.log('   after pull   : ' + JSON.stringify(after));
console.log('   ' + (after.entry === '999' ? 'PASS - typing kept' : 'FAIL - overwrote work in progress'));

console.log('\n=== clearing on one device clears the other');
const server3 = { draft: JSON.stringify({ entry: '5', tp: '6', sl: '7' }) };
server3.draft = undefined;              // clearCalculatorDraft removes + syncs
const other = makeDevice('other', server3);
console.log('   other device : ' + JSON.stringify(other.login()));
