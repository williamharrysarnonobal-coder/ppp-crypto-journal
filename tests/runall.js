// Lahat ng sim-*.js nang sunod-sunod. Ang exit code ang hatol.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^sim-.*\.js$/.test(f)).sort();
let bad = [];
for (const f of files) {
  try { execFileSync(process.execPath, [path.join(dir, f)], { cwd: dir, stdio: 'pipe' }); }
  catch (e) {
    bad.push(f);
    const out = ((e.stdout || '') + (e.stderr || '')).toString().split(/\r?\n/)
      .filter(l => /FAIL|MALI|Error|error/.test(l)).slice(0, 4);
    console.log('MALI  ' + f);
    out.forEach(l => console.log('        ' + l.trim().slice(0, 150)));
  }
}
console.log('\n' + files.length + ' sim   ' + (bad.length ? bad.length + ' MALI' : 'lahat pumasa'));
process.exit(bad.length ? 1 : 0);
