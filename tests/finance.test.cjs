const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: name => mocks[name] || require(name), Buffer, Date, Intl, URL, AbortSignal, fetch, process, ...globals });
  return exports;
}
const accounting = load('lib/accounting.ts');
const finance = load('lib/finance.ts', { './accounting': accounting, './cartItems': load('lib/cartItems.ts') });
const id = '10000000-0000-4000-8000-000000000001', skuId = '20000000-0000-4000-8000-000000000001';
const rawBill = { supplier: 'Box supplier', supplier_gstin: '33ABCDE1234F1Z5', invoice_number: 'B-1', invoice_date: '2026-09-01', due_date: '2026-09-30', service_month: '2026-09', category: 'materials', items: [{ description: 'Boxes', quantity: '100', unit: 'pcs', unit_cost: '12.50' }], cgst: '112.50', sgst: '112.50', igst: '0', itc_status: 'pending' };
const bill = { ...finance.validateBill(rawBill), id, voided: false, version: 1 };
const order = { id, order_number: 'HOE-1', created_at: '2026-09-01T00:00:00Z', customer_state: 'Tamil Nadu', amount_in_paise: 11800, payment_status: 'paid', payment_type: 'full', shipping_status: 'delivered', items: [{ productId: 'zyrox', size: '50ml', quantity: 2 }] };
const skus = [{ id: skuId, product_key: 'zyrox', size: '50ml', product_name: 'Zyrox' }];
const costs = [{ id, sku_id: skuId, effective_from: '2026-08-01', unit_cost_paise: 1000 }];

test('purchase amounts use exact paise, fractional quantities and invoice tax validation', () => {
  assert.equal(bill.subtotal_paise, 125000); assert.equal(bill.total_paise, 147500);
  assert.equal(finance.itemTotal(finance.parseItems([{ description: 'Oil', unit: 'ml', quantity: '0.125', unit_cost: '9.99' }])), 125);
  for (const bad of ['-1','1e3','1.001','NaN','']) assert.throws(() => finance.decimalUnits(bad, 2, 'Price'));
  assert.throws(() => finance.validateBill({ ...rawBill, igst: '1' }), /not both/);
  assert.throws(() => finance.validateBill({ ...rawBill, invoice_date: '2026-02-30' }), /valid/);
  assert.throws(() => finance.validateBill({ ...rawBill, itc_status: 'eligible', itc_note: '' }), /reconciliation note/);
  assert.throws(() => finance.validateBill({ ...rawBill, category: '__proto__' }), /category/);
});
test('cash paid follows payment date and unpaid balances include earlier invoices', () => {
  const summary = finance.summarizeBills([{ ...bill, invoice_date: '2026-08-01' }], [{ id, bill_id: id, paid_on: '2026-09-02', amount_paise: 50000 }], '2026-09');
  assert.equal(summary.purchases, 0); assert.equal(summary.cashPaid, 50000); assert.equal(summary.outstanding, 97500);
});
test('dated standard costs do not use future prices and unknown products remain incomplete', () => {
  const result = finance.costOrders([order], skus, [...costs, { ...costs[0], effective_from: '2026-10-01', unit_cost_paise: 5000 }]);
  assert.equal(result.cogs, 2000); assert.equal(result.covered, 1);
  assert.equal(finance.costOrders([{ ...order, items: [{ productId: 'zyrox', quantity: 1 }] }], skus, costs).missing.length, 1);
  assert.equal(finance.costOrders([{ ...order, shipping_status: 'returned' }], skus, costs).covered, 0);
  assert.equal(finance.costOrders([{ ...order, payment_status: 'pending' }], skus, costs).covered, 0);
});
test('discovery packs consume three identified 8 ml fragrances, never an ambiguous guess', () => {
  const trialSkus = ['zyrox', 'rank', 'silent-gold'].map((key, i) => ({ id: String(i), product_key: key, size: '8ml' }));
  const raw = JSON.stringify([{ productId: 'trial-pack', name: 'Zyrox, RANK & Silent Gold', quantity: 2 }]);
  const units = finance.orderUnits(raw, trialSkus);
  assert.equal(units.length, 3); assert.equal(units.reduce((n, r) => n + r.quantity, 0), 6);
  assert.equal(finance.orderUnits([{ productId: 'trial-pack', name: 'Zyrox', quantity: 1 }], trialSkus), null);
});
test('profit excludes stock purchases and does not double-count Meta invoices', () => {
  const meta = { ...bill, category: 'meta_ads', subtotal_paise: 1000, cgst_paise: 90, sgst_paise: 90, igst_paise: 0 };
  const shipping = { ...bill, category: 'shipping', subtotal_paise: 500, cgst_paise: 0, sgst_paise: 0, igst_paise: 0 };
  const sync = { through_date: '2026-09-30', currency: 'INR', timezone: 'Asia/Kolkata' };
  const result = finance.profitSummary([order], [bill, meta, shipping], [{ day: '2026-09-01', spend_paise: 1000 }], sync, skus, costs, '2026-09', '2026-09-30');
  assert.equal(result.advertising, 1180); assert.equal(result.expenses, 500);
  assert.equal(result.estimate, 10000 - 2000 - 1180 - 500);
  assert.equal(finance.profitSummary([order], [], [], undefined, skus, costs, '2026-09', '2026-09-30').estimate, null);
  assert.equal(finance.profitSummary([order], [], [], sync, skus, [], '2026-09', '2026-09-30').estimate, null);
});

test('real Postgres: migration, bill versioning, invoice duplicates, overpayment and payment idempotency', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create table inventory_skus(id uuid primary key); insert into inventory_skus values ('${skuId}'); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    const migration = readFileSync('supabase/migrations/013_finance.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    const save = (entry, version = 0, bid = id) => db.query('select finance_save_bill($1,$2,$3::jsonb)', [bid, version, JSON.stringify(entry)]);
    await save(bill);
    await assert.rejects(save(bill), /Bill changed/);
    await assert.rejects(save(bill, 0, '10000000-0000-4000-8000-000000000002'), /unique/);
    const pid = '30000000-0000-4000-8000-000000000001';
    const pay = amount => db.query('select finance_record_payment($1,$2,$3,$4,$5)', [pid,id,'2020-01-01',amount,'UPI-1']);
    await pay(50000); await pay(50000);
    assert.equal((await db.query('select count(*)::int as n from finance_bill_payments')).rows[0].n, 1);
    await assert.rejects(pay(40000), /retry does not match/);
    await assert.rejects(db.query('select finance_record_payment($1,$2,$3,$4,$5)', ['30000000-0000-4000-8000-000000000002',id,'2020-01-01',100000,'UPI-2']), /exceeds/);
    await assert.rejects(save({ ...bill, items: [{ description: 'Box', unit: 'pcs', quantity_milli: 1000, unit_cost_paise: 10 }], subtotal_paise: 10, cgst_paise: 0, sgst_paise: 0, total_paise: 10 }, 1), /below recorded payments/);
    await save({ ...bill, notes: 'Changed note' }, 1);
    assert.equal((await db.query('select version from finance_bills')).rows[0].version, 2);
    assert.equal((await db.query('select count(*)::int as n from finance_audit')).rows[0].n, 3);
    const costsInput = [{ description: 'Perfume', unit: 'ml', quantity_milli: 1000, unit_cost_paise: 500 }];
    await db.query('select finance_add_cost($1,$2,$3,$4,$5)', [pid,skuId,'2026-09-01',JSON.stringify(costsInput),'Supplier basis']);
    await db.query('select finance_add_cost($1,$2,$3,$4,$5)', [pid,skuId,'2026-09-01',JSON.stringify(costsInput),'Supplier basis']);
    assert.equal((await db.query('select count(*)::int as n from finance_product_costs')).rows[0].n, 1);
    assert.equal((await db.query("select has_function_privilege('anon','finance_save_bill(uuid,integer,jsonb)','EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select public from storage.buckets where id='accounting-documents'")).rows[0].public, false);
  } finally { await db.close(); }
});
test('real Postgres: atomic Meta replacement, failed-report rollback, stale-sync protection', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table inventory_skus(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
    await db.exec(readFileSync('supabase/migrations/013_finance.sql', 'utf8'));
    const row = { account_id: '123', campaign_id: '456', campaign_name: 'Campaign', day: '2026-09-01', spend_paise: 1000, clicks: 2, impressions: 100, purchases: 1, purchase_value_paise: 11800 };
    const commit = (rows, started = '2026-09-21T00:00:00Z') => db.query('select finance_commit_meta($1,$2,$3,$4,$5,$6,$7,$8,$9)', ['123','2026-09','2026-09-21',started,'Ad account','INR','Asia/Kolkata',JSON.stringify(rows),'[]']);
    await commit([row]); await commit([row]);
    assert.equal((await db.query('select count(*)::int as n from finance_meta_daily')).rows[0].n, 1);
    await assert.rejects(commit([{ ...row, spend_paise: -1 }]), /check constraint/);
    assert.equal(Number((await db.query('select spend_paise from finance_meta_daily')).rows[0].spend_paise), 1000);
    await assert.rejects(commit([row],'2026-09-20T00:00:00Z'), /newer sync/);
    await assert.rejects(commit([{ ...row, day: '2026-08-31' }]), /outside/);
    await commit([]);
    assert.equal((await db.query('select count(*)::int as n from finance_meta_daily')).rows[0].n, 0);
  } finally { await db.close(); }
});

const meta = load('lib/metaAds.ts', { './accounting': accounting, './finance': finance, './supabaseAdmin': { supabaseAdmin: () => ({}) } });
test('Meta purchase aliases are not summed and reporting periods clamp to today', () => {
  assert.equal(meta.purchaseAction([{ action_type: 'purchase', value: '3' }, { action_type: 'omni_purchase', value: '3' }]), 3);
  assert.equal(meta.metaPeriod('2024-02', new Date('2026-09-21T00:00:00Z')).until, '2024-02-29');
  assert.equal(meta.metaPeriod('2026-09', new Date('2026-09-21T00:00:00Z')).until, '2026-09-21');
  assert.throws(() => meta.metaPeriod('2027-01', new Date('2026-09-21T00:00:00Z')), /Future/);
});
test('Meta paginates using a fixed trusted endpoint and never follows token-bearing next URLs', async () => {
  const requested = [];
  const fetcher = async (url, opts) => { requested.push(url.toString()); assert.equal(opts.headers.Authorization,'Bearer secret'); return { ok: true, json: async () => requested.length === 1 ? { data: [{ id: 1 }], paging: { next: 'https://evil.test/?access_token=secret', cursors: { after: 'cursor2' } } } : { data: [{ id: 2 }] } }; };
  const result = await meta.graphPages('act_123/campaigns',{},'secret','v23.0',fetcher);
  assert.equal(result.length,2); assert(requested.every(url => url.startsWith('https://graph.facebook.com/v23.0/act_123/campaigns'))); assert(requested[1].includes('after=cursor2')); assert(requested.every(url => !url.includes('secret')));
  await assert.rejects(meta.graphPages('act_123/insights',{},'secret','v23.0',async () => ({ ok:false,json:async()=>({error:{code:190,message:'secret-token'}}) })), /access expired/);
});

test('finance writes require a session and same-origin requests', async () => {
  const access = load('lib/financeRequest.ts', { './auth': { SESSION_COOKIE: 'session', getExpectedSessionValue: async () => 'valid' } }, { process: { env: { ADMIN_PASSWORD: 'configured' } } });
  function request(cookie, origin = 'https://app.test', host = 'app.test') { return { cookies: { get: () => ({ value: cookie }) }, headers: new Headers({ origin, host }) }; }
  assert.equal((await access.financeAccess(request('wrong'), true)).status, 401);
  assert.equal((await access.financeAccess(request('valid','https://evil.test'), true)).status, 403);
  assert.equal((await access.financeAccess(request('valid','invalid'), true)).status, 403);
  assert.equal(await access.financeAccess(request('valid'), true), null);
});

test('Meta sync commits once only after complete validated API results', async () => {
  const commits = [];
  let failInsights = false;
  const fetcher = async url => ({ ok: !failInsights || !url.pathname.endsWith('/insights'), json: async () => {
    if (url.pathname.endsWith('/campaigns')) return { data: [{ id: '456', name: 'Ads', effective_status: 'ACTIVE', daily_budget: '10000', objective: 'OUTCOME_SALES' }] };
    if (url.pathname.endsWith('/insights')) return failInsights ? { error: { code: 190 } } : { data: [{ account_id:'123',account_currency:'INR',campaign_id:'456',campaign_name:'Ads',date_start:'2020-01-01',date_stop:'2020-01-01',spend:'12.34',clicks:'3',impressions:'100',actions:[{action_type:'purchase',value:'2'}] }] };
    return { id:'act_123',name:'Ad account',currency:'INR',timezone_name:'Asia/Kolkata' };
  } });
  const m = load('lib/metaAds.ts', { './accounting': accounting, './finance': finance, './supabaseAdmin': { supabaseAdmin: () => ({ rpc: async (fn, args) => { commits.push({ fn, args }); return { error:null }; } }) } }, { fetch:fetcher,process:{env:{META_AD_ACCOUNT_ID:'123',META_ADS_ACCESS_TOKEN:'server-secret',META_ADS_API_VERSION:'v23.0'}} });
  await m.syncMetaMonth('2020-01'); assert.equal(commits.length,1); assert.equal(commits[0].args.p_daily[0].spend_paise,1234); assert.equal(commits[0].args.p_campaigns[0].daily_budget_paise,10000);
  failInsights = true;
  await assert.rejects(m.syncMetaMonth('2020-01'), /access expired/);
  assert.equal(commits.length,1);
});

test('purchase endpoint verifies attachment bytes, keeps files private, and cleans up failed saves', async () => {
  const { NextRequest, NextResponse } = require('next/server');
  const uploaded = [], removed = [], writes = [];
  let saveError = null;
  const db = { storage: { from: bucket => { assert.equal(bucket,'accounting-documents'); return { upload: async (path,bytes,opts) => { uploaded.push({path,bytes,opts}); return {error:null}; }, remove: async paths => { removed.push(...paths); return {error:null}; } }; } }, rpc: async (name,args) => { writes.push({name,args}); return {error:saveError}; } };
  const route = load('app/api/accounts/bills/route.ts', {
    '../../../../lib/supabaseAdmin': { supabaseAdmin: () => db },
    '../../../../lib/finance': finance,
    '../../../../lib/financeRequest': { financeAccess: async () => null, financeError: () => NextResponse.json({error:'Conflict'},{status:409}), validId: value => value === id },
  }, { File, FormData });
  const request = bytes => { const form = new FormData(); form.set('bill',JSON.stringify({...rawBill,id,version:0})); form.set('invoice',new File([bytes],'receipt.pdf',{type:'application/pdf'})); return new NextRequest('https://app.test/api/accounts/bills',{method:'POST',body:form}); };
  assert.equal((await route.POST(request('<html>not a PDF</html>'))).status,400);
  assert.equal(uploaded.length,0);
  assert.equal((await route.POST(request('%PDF-1.7\nsample'))).status,200);
  assert.equal(uploaded.length,1); assert(uploaded[0].path.startsWith(id+'/')); assert.equal(uploaded[0].opts.upsert,false);
  assert.equal(writes[0].args.p_bill.total_paise,147500);
  saveError = {code:'23505'};
  assert.equal((await route.POST(request('%PDF-1.7\nsample'))).status,409);
  assert.equal(removed.length,1); assert.equal(removed[0],uploaded[1].path);
});

test('billing probe reads funding activity without guessing units or exposing payment details', async () => {
  const env = { META_AD_ACCOUNT_ID: 'act_627309202982496', META_ADS_ACCESS_TOKEN: 'test-private-token', META_ADS_API_VERSION: 'v23.0' };
  const calls = [];
  const events = [
    { event_time: '2026-08-19T12:00:00+0530', event_type: 'funding_event_successful', extra_data: JSON.stringify({ amount: '40', currency: 'INR', transaction_id: 'abc', card_number: 'secret-card' }) },
    { event_time: '2026-08-20T12:00:00+0530', event_type: 'ad_account_billing_charge', extra_data: 'not-json' },
    { event_time: '2026-08-20T12:00:00+0530', event_type: 'update_campaign_name', extra_data: {} },
  ];
  const billing = load('lib/metaBilling.ts', { './metaAds': {
    metaPeriod: () => ({ since: '2026-08-01', until: '2026-08-31' }),
    graphPages: async (path, params, token) => {
      calls.push({ path, params, token });
      return path.endsWith('/activities') ? events : [{ id: 'act_627309202982496', currency: 'INR', timezone_name: 'Asia/Kolkata' }];
    },
  } }, { process: { env } });
  const result = await billing.checkMetaBilling('2026-08');
  assert.equal(result.events.length, 2);
  assert.equal(result.events[1].details.amount, '40');
  assert.equal(result.events[1].details.transaction_id, 'abc');
  assert.equal(JSON.stringify(result).includes('secret-card'), false);
  assert.equal(JSON.stringify(result).includes('test-private-token'), false);
  assert.equal(calls[1].params.since, String(Date.parse('2026-08-01T00:00:00+05:30') / 1000));
  assert.equal(calls[1].params.until, String(Date.parse('2026-09-01T00:00:00+05:30') / 1000));
  events.length = 0;
  assert.match((await billing.checkMetaBilling('2026-08')).message, /does not establish/);
  events.push({ event_type: 'funding_event_successful', event_time: '2026-07-31T12:00:00Z' });
  await assert.rejects(() => billing.checkMetaBilling('2026-08'), /outside/);
  delete env.META_ADS_ACCESS_TOKEN;
  await assert.rejects(() => billing.checkMetaBilling('2026-08'), /Set META_ADS_ACCESS_TOKEN/);
});

test('billing route enforces access checks and hides unexpected upstream errors', async () => {
  let deny = true, invoked = false;
  const route = load('app/api/accounts/meta/billing-check/route.ts', {
    'next/server': { NextResponse: { json: (body, opts) => ({ body, ...opts }) } },
    '../../../../../lib/financeRequest': { financeAccess: async (req, write) => { assert.equal(write, true); return deny ? { status: 401 } : null; } },
    '../../../../../lib/metaBilling': { checkMetaBilling: async () => { invoked = true; throw new Error('network secret-private-token'); } },
  });
  assert.equal((await route.POST({ json: async () => ({ month: '2026-08' }) })).status, 401);
  assert.equal(invoked, false);
  deny = false;
  const response = await route.POST({ json: async () => ({ month: '2026-08' }) });
  assert.equal(response.body.error, 'Billing API check failed. Retry later.');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
