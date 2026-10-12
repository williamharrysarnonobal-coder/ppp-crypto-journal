const fs = require('fs');
process.chdir(__dirname);
let p = fs.readFileSync('probe-poststop.js', 'utf8');
const i = p.indexOf("  console.log('1. ANG COLUMN"), j = p.indexOf("  ok('walang JS error'");
p = p.slice(0, i) + fs.readFileSync('mid-dbg.txt', 'utf8') + p.slice(j);
p = p.replace('PORT=8896, CDP=9328', 'PORT=8925, CDP=9357');
fs.writeFileSync('probe-dbg.js', p);

