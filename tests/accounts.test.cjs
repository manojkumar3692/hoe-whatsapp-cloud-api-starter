const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { exports, require: name => mocks[name] || require(name), Buffer, Date, Intl, Set, Number });
  return exports;
}
const accounting = load('lib/accounting.ts');
const base = { id: 'order-1', order_number: 'HOE-1', created_at: '2026-09-01T00:00:00Z', customer_name: 'Customer', customer_state: 'Tamil Nadu', amount_in_paise: 11800, payment_status: 'paid', payment_type: 'full', token_amount_in_paise: 0, balance_due_in_paise: 0, cod_balance_status: 'not_applicable', shipping_status: 'pending', is_hidden: false };
test('accounts require explicit paid status and supported payment type, including paid COD tokens', () => {
  const rows = [base, { ...base, payment_type: 'partial_cod', token_amount_in_paise: 9900, balance_due_in_paise: 1900, cod_balance_status: 'pending' }, ...['pending','failed','refunded'].map(payment_status => ({ ...base, payment_status, shipping_status: 'delivered' })), { ...base, is_hidden: true }, { ...base, payment_type: 'unknown' }];
  const total = accounting.summarize(rows);
  assert.equal(total.count, 2); assert.equal(total.sales, 23600);
  assert.equal(total.online, 21700); assert.equal(total.codPending, 1900);
  assert.equal(total.gst, 3600); assert.equal(total.cgst + total.sgst + total.igst, total.gst);
});
test('COD collection changes collection totals without changing sales or GST', () => {
  const order = { ...base, payment_type: 'partial_cod', token_amount_in_paise: 9900, balance_due_in_paise: 1900, cod_balance_status: 'collected' };
  const total = accounting.summarize([order]);
  assert.equal(total.sales, 11800); assert.equal(total.codPending, 0); assert.equal(total.codCollected, 1900);
  assert.equal(total.online + total.codCollected, total.sales);
  assert.equal(total.gst, 1800);
});
test('GST remains exact to the paise and unknown states are not silently interstate', () => {
  for (const amount of [1, 99, 9900, 11800, 456789]) {
    for (const state of ['Tamil Nadu', 'TN', 'Karnataka', null, 'typo']) {
      const t = accounting.gstSplit(amount, state);
      assert.equal(t.taxable + t.gst, amount);
      assert.equal(t.cgst + t.sgst + t.igst + t.unallocated, t.gst);
    }
  }
  assert.equal(accounting.gstSplit(11800, null).unallocated, 1800);
  assert.equal(accounting.gstSplit(11800, 'Karnataka').igst, 1800);
});
test('returns stay visible in gross paid totals and are flagged for credit-note review', () => {
  const order = { ...base, shipping_status: 'returned' };
  assert.equal(accounting.summarize([order]).sales, 11800);
  assert.equal(accounting.summarize([order]).review, 1);
  assert(accounting.reviewReasons(order).includes('Review return / credit note'));
  assert(accounting.reviewReasons({ ...base, payment_type: 'partial_cod' }).includes('Reconcile COD split'));
});
test('IST month boundaries, leap years and Monday week boundary are deterministic', () => {
  assert.equal(accounting.dateKey('2026-08-31T18:30:00Z'), '2026-09-01');
  assert.equal(accounting.dateKey('2026-08-31T18:29:59Z'), '2026-08-31');
  assert.equal(accounting.monthBounds('2024-02').to, '2024-03-01T00:00:00+05:30');
  assert.equal(accounting.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(accounting.weekStart(new Date('2026-09-20T18:30:00Z')), '2026-09-21');
  for (const invalid of ['2026-13', '2026-00', 'x', '2026-9', '1999-12']) assert(!accounting.validMonth(invalid));
});
test('register protects spreadsheet cells and reconciles with summary GST', () => {
  const { accountsRegister } = load('lib/accountsExport.ts', { './accounting': accounting });
  const csv = accountsRegister([{ ...base, customer_name: '=HYPERLINK("bad")' }]);
  assert(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert(csv.includes('"118.00","100.00","18.00","9.00","9.00","0.00"'));
});
test('accounts query loads more than 1000 rows and fails closed on database errors', async () => {
  const calls = [], ranges = [];
  const query = {};
  for (const method of ['select','eq','in','gte','lt','order']) query[method] = (...args) => { calls.push([method,...args]); return query; };
  query.range = async (from, to) => { ranges.push([from,to]); return { data: Array.from({ length: from < 1000 ? 500 : 1 }, () => base), error: null }; };
  const { loadAccountOrders } = load('lib/accountsQuery.ts', { './supabaseAdmin': { supabaseAdmin: () => ({ from: () => query }) } });
  assert.equal((await loadAccountOrders('from','to')).length, 1001);
  assert.equal(ranges.length, 3);
  assert(calls.some(c => c[0] === 'eq' && c[1] === 'payment_status' && c[2] === 'paid'));
  assert(calls.some(c => c[0] === 'eq' && c[1] === 'is_hidden' && c[2] === false));
  query.range = async () => ({ error: { message: 'failure' } });
  await assert.rejects(loadAccountOrders('from','to'), /could not be loaded/);
});
test('ZIP is readable by independent unzip, contains exact PDF and UTF-8 content', () => {
  const { createZip } = load('lib/zip.ts');
  const dir = mkdtempSync(join(tmpdir(), 'accounts-zip-'));
  try {
    const path = join(dir,'pack.zip');
    writeFileSync(path, createZip([{ name: 'invoices/one.pdf', data: Buffer.from('%PDF-1.7\nexample') }, { name: 'review.txt', data: Buffer.from('₹1,180') }]));
    execFileSync('/usr/bin/unzip', ['-t',path]);
    assert.equal(execFileSync('/usr/bin/unzip', ['-p',path,'review.txt']).toString(), '₹1,180');
    assert.equal(execFileSync('/usr/bin/unzip', ['-p',path,'invoices/one.pdf']).toString(), '%PDF-1.7\nexample');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('shared invoice renderer produces a PDF for full, COD and unresolved GST orders', async () => {
  const { renderInvoice } = load('lib/invoice.ts', { './accounting': accounting, './cartItems': { parseCartItems: value => value || [] } });
  for (const order of [base, { ...base, payment_type: 'partial_cod', cod_balance_status: 'collected', token_amount_in_paise: 9900, balance_due_in_paise: 1900 }, { ...base, customer_state: null }]) {
    const pdf = await renderInvoice({ ...order, items: [{ name: 'Product', quantity: 1, price_in_paise: 11800 }] });
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF'); assert(pdf.length > 1000);
  }
});

test('cancelled COD balances are held for review instead of sent to collection', () => {
  const order = { ...base, payment_type: 'partial_cod', token_amount_in_paise: 9900, balance_due_in_paise: 1900, cod_balance_status: 'pending', shipping_status: 'cancelled' };
  const total = accounting.summarize([order]);
  assert.equal(total.codPending, 0); assert.equal(total.codReview, 1900);
  assert.equal(total.online + total.codCollected + total.codPending + total.codReview, total.sales);
});
