// Finance: credit card bill — Paid, the bill shown afterwards, Undo, refunds,
// and the guard on deleting a bill payment. Runs the real functions from
// dashboard.js against an in-memory database (the owner's own numbers).
const __ROOT = require('path').resolve(__dirname, '..').replace(/\\/g, '/');
const fs = require('fs');
const js = fs.readFileSync(__ROOT + '/js/dashboard.js', 'utf8');
const grab = name => {
  const i = js.search(new RegExp(`(async )?function ${name}\\(`));
  if(i < 0) throw new Error('missing ' + name);
  let d = 0;
  for(let j = js.indexOf('{', i); j < js.length; j++){ if(js[j] === '{') d++; else if(js[j] === '}' && --d === 0) return js.slice(i, j + 1); }
};
const FNS = ['_finMonthISO', '_finMonthTxTotal', '_finRecStartedBy', '_finRecEndedBefore', '_finRecIsFullyPaid', '_finRecDueIn',
  '_finRecBilledIn', '_finMonthlyRecurringItems', '_finMonthlyRecurringTotal', '_finBillPaidCovers', 'finOwedFor', '_finUnsettledTxTotal',
  '_adjustFinAccountBalance', '_finPatchRecurring', '_markOneRecPaid', 'confirmPayAllDueForAccount', 'undoAccountBillPayment',
  '_finBillPaymentOwner', 'deleteFinTx'];

let fail = 0;
const ok = (l, c, x) => { if(!c) fail++; console.log('  ' + (c ? 'ok   ' : 'MALI ') + l.padEnd(56) + (x || '')); };
const r2 = v => Math.round(v * 100) / 100;

function world(){
  const db = {
    finance_accounts: [
      { id: 1, account_name: 'ENBD U by Emaar', account_class: 'Credit', current_balance: 0, last_bill_paid: '2026-08-01', last_bill_payment_tx_id: 169, currency: 'AED' },
      { id: 2, account_name: 'ENBD', account_class: 'Debit', current_balance: 15411.42, currency: 'AED' }],
    finance_recurring: [
      { id: 9, account_id: 1, kind: 'Installment', name: 'iPhone', total_amount: 6255, total_payments: 12, payments_applied: 11, first_bill: '2025-10-20' },
      { id: 11, account_id: 1, kind: 'Installment', name: 'Dubai', total_amount: 108.62 * 12, total_payments: 12, payments_applied: 2, first_bill: '2026-07-06' },
      { id: 12, account_id: 1, kind: 'Installment', name: 'Smaidi', total_amount: 252.84 * 12, total_payments: 12, payments_applied: 2, first_bill: '2026-07-06' },
      { id: 14, account_id: 1, kind: 'Installment', name: 'Tabby', total_amount: 69.61 * 4, total_payments: 4, payments_applied: 1, first_bill: '2026-08-06' },
      { id: 15, account_id: 1, kind: 'Installment', name: 'Palmira', total_amount: 375 * 4, total_payments: 4, payments_applied: 1, first_bill: '2026-08-05' },
      // Finished long ago: Undo must never touch it.
      { id: 3, account_id: 1, kind: 'Installment', name: 'Old TV', total_amount: 1200, total_payments: 6, payments_applied: 6, first_bill: '2025-01-10' }],
    finance_transactions: [
      { id: 169, tx_type: 'Transfer', amount: 2241.58, account_id: 2, to_account_id: 1, tx_date: '2026-09-24' },
      { id: 300, tx_type: 'Expense', amount: 845.14, account_id: 1, tx_date: '2026-09-15', settled_bill: null },
      { id: 301, tx_type: 'Expense', amount: 451.62, account_id: 1, tx_date: '2026-10-12', settled_bill: null }]
  };
  let nextId = 400;
  const fetch = async (url, init = {}) => {
    const u = new URL(url); const table = u.pathname.split('/').pop(); const m = init.method || 'GET';
    const q = [...u.searchParams.entries()];
    const match = row => q.every(([k, v]) => {
      if(k === 'or') return /tx_date\.lt\.(\d{4}-\d\d-\d\d)/.test(v) ? (row.tx_date == null || row.tx_date < v.match(/tx_date\.lt\.([\d-]+)/)[1]) : true;
      if(v.startsWith('eq.')) return String(row[k]) === v.slice(3);
      if(v === 'is.null') return row[k] == null;
      if(v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
      return true;
    });
    const rows = db[table];
    if(m === 'POST'){ const b = JSON.parse(init.body); const row = { id: nextId++, ...b }; rows.push(row); return { ok: true, json: async () => [row], text: async () => '' }; }
    if(m === 'PATCH'){ const b = JSON.parse(init.body); const hit = rows.filter(match); hit.forEach(r => Object.assign(r, b)); return { ok: true, json: async () => hit, text: async () => '' }; }
    if(m === 'DELETE'){ const hit = rows.filter(match); db[table] = rows.filter(r => !hit.includes(r)); return { ok: true, json: async () => hit, text: async () => '' }; }
    return { ok: true, json: async () => rows.filter(match) };
  };
  const el = () => ({ textContent: '', value: '2', innerHTML: '', disabled: false, classList: { add(){}, remove(){}, contains: () => false } });
  const alerts = [];
  const env = {
    fetch, SUPABASE_URL: 'https://x', SUPABASE_KEY: 'k', USER_ACCESS_TOKEN: 't',
    document: { getElementById: el, querySelector: el },
    customAlert: async m => { alerts.push(m); }, customConfirm: async () => true, showToast(){}, console,
    renderFinanceRecurring(){}, renderFinanceAccounts(){}, renderFinanceTransactions(){}, openFinAccountDetailsModal(){},
    closeFinCreditPaymentModal(){}, finMoney: v => String(v), FIN_TX_SELECTED: new Set(),
    _finPreviousMonthLabel: () => new Date(2026, 8, 1)   // the September bill, paid in October
  };
  const names = Object.keys(env);
  const body = `let FIN_ACCOUNTS = db.finance_accounts, FIN_RECURRING = db.finance_recurring, FIN_TXNS = db.finance_transactions;
    let _finCreditPaymentAccountId = 1;
    async function loadFinanceTransactions(){ FIN_TXNS = db.finance_transactions; }
    ${FNS.map(grab).join('\n')}
    return { db, alerts, get FIN_TXNS(){ return FIN_TXNS; }, confirmPayAllDueForAccount, undoAccountBillPayment, deleteFinTx, _finMonthlyRecurringTotal, _finMonthTxTotal, finOwedFor, _finRecDueIn };`;
  return new Function('db', 'alerts', ...names, body)(db, alerts, ...names.map(n => env[n]));
}

(async () => {
  const sep = new Date(2026, 8, 1), oct = new Date(2026, 9, 1);
  console.log('1. PAID (September bill)\n');
  const w = world();
  const billShown = r2(w._finMonthlyRecurringTotal(1, sep) + w._finMonthTxTotal(1, sep));
  ok('modal shows the bill', billShown === 2172.46, String(billShown));
  await w.confirmPayAllDueForAccount();
  const pay = w.db.finance_transactions.find(t => t.description === 'September bill payment');
  ok('logged payment = the bill (iPhone 12/12 included)', pay && r2(pay.amount) === 2172.46, pay && String(r2(pay.amount)));
  ok('ENBD down by exactly that', r2(w.db.finance_accounts[1].current_balance) === r2(15411.42 - 2172.46), String(w.db.finance_accounts[1].current_balance));
  ok('iPhone now 12 of 12', w.db.finance_recurring[0].payments_applied === 12);
  ok('old finished item untouched', w.db.finance_recurring[5].payments_applied === 6);
  ok('September expense settled', w.db.finance_transactions.find(t => t.id === 300).settled_bill === '2026-09-01');
  ok('October expense NOT settled (next bill)', w.db.finance_transactions.find(t => t.id === 301).settled_bill == null);
  const billAfter = r2(w._finMonthlyRecurringTotal(1, sep) + w._finMonthTxTotal(1, sep));
  ok('Bill for September unchanged after paying', billAfter === 2172.46, String(billAfter));
  ok('October bill has no iPhone', !w._finRecDueIn(1, oct).some(r => r.name === 'iPhone'));

  console.log('\n2. DELETE THE PAYMENT FROM TRANSACTIONS\n');
  await w.deleteFinTx(pay.id);
  ok('blocked, points to Undo', w.db.finance_transactions.some(t => t.id === pay.id) && /Undo/.test(w.alerts.pop() || ''));

  console.log('\n3. UNDO\n');
  await w.undoAccountBillPayment(1);
  ok('payment removed, ENBD restored', !w.db.finance_transactions.some(t => t.id === pay.id) && r2(w.db.finance_accounts[1].current_balance) === 15411.42);
  ok('iPhone back to 11', w.db.finance_recurring[0].payments_applied === 11);
  ok('Dubai back to 2', w.db.finance_recurring[1].payments_applied === 2);
  ok('old finished item still 6 of 6', w.db.finance_recurring[5].payments_applied === 6, String(w.db.finance_recurring[5].payments_applied));
  ok('September expense unsettled again', w.db.finance_transactions.find(t => t.id === 300).settled_bill == null);

  console.log('\n4. REFUND ON THE CARD\n');
  const w2 = world();
  w2.db.finance_transactions.push({ id: 302, tx_type: 'Income', amount: 45.14, account_id: 1, tx_date: '2026-09-20', settled_bill: null });
  ok('refund lowers the bill', r2(w2._finMonthTxTotal(1, sep)) === 800, String(r2(w2._finMonthTxTotal(1, sep))));

  console.log('\n' + (fail ? fail + ' MALI' : 'lahat pumasa'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('BUMAGSAK: ' + e.stack); process.exit(1); });
