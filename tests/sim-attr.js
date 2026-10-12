// Show what the browser actually receives for each attribute form.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const keys = ['London', 'Unspecified', "Bill's Setup", 'BTC/USD'];

console.log('BROKEN (was): onclick="fn(\'tab\', ${JSON.stringify(key)})"');
keys.forEach(k => {
  const attr = `onclick="showCategoryTrades('session', ${JSON.stringify(k)})"`;
  // The HTML parser ends the value at the next unescaped double quote.
  const m = /onclick="([^"]*)"/.exec(attr);
  console.log('   ' + JSON.stringify(k).padEnd(18) + 'browser sees onclick = ' + JSON.stringify(m[1]));
});

console.log('\nFIXED: onclick="fn(\'tab\', ${escapeHtml(JSON.stringify(key))})"');
let ok = true;
keys.forEach(k => {
  const attr = `onclick="showCategoryTrades('session', ${esc(JSON.stringify(k))})"`;
  const m = /onclick="([^"]*)"/.exec(attr);
  // The parser decodes entities when building the value.
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const good = decoded === `showCategoryTrades('session', ${JSON.stringify(k)})`;
  if (!good) ok = false;
  console.log('   ' + JSON.stringify(k).padEnd(18) + 'browser sees onclick = ' + JSON.stringify(decoded) + (good ? '  ok' : '  FAIL'));
});

console.log('\nsingle-quoted form used elsewhere: onclick=\'fn(${JSON.stringify(id)})\'');
keys.forEach(k => {
  const attr = `onclick='openTradeFromCard(${JSON.stringify(k)})'`;
  const m = /onclick='([^']*)'/.exec(attr);
  const good = m && m[1] === `openTradeFromCard(${JSON.stringify(k)})`;
  console.log('   ' + JSON.stringify(k).padEnd(18) + (good ? 'ok' : 'breaks on the apostrophe'));
});

console.log('\n' + (ok ? 'The escapeHtml form survives every key, apostrophes included.' : 'FAIL'));
