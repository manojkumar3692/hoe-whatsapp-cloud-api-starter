const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: name => mocks[name] || require(name), process, AbortSignal, ...globals });
  return exports;
}
const finance = load('lib/finance.ts', { './cartItems': load('lib/cartItems.ts'), './accounting': load('lib/accounting.ts') });
const genie = load('lib/genie.ts', { './cartItems': load('lib/cartItems.ts'), './finance': finance });
const skus = ['riva','syra','rank'].flatMap(key => ['8ml','50ml'].map(size => ({ id: key + size, product_key: key, product_name: key.toUpperCase(), size, current_stock: 10, low_stock_threshold: 5, active: true })));
const order = (created_at, extra = {}) => ({ id: created_at, created_at, amount_in_paise: 10000, payment_status: 'paid', shipping_status: 'delivered', is_hidden: false, items: [{ productId: 'riva', size: '50ml', quantity: 1 }], ...extra });
test('Dubai comparison windows use complete equal days, including month ends and Monday', () => {
  const p = genie.geniePeriods(new Date('2026-03-31T12:00:00Z'));
  assert.equal(p.month.days, 28);
  assert.equal(p.month.to - p.month.from, p.month.previousTo - p.month.previousFrom);
  assert.equal(new Date(p.month.from).toISOString(), '2026-02-28T20:00:00.000Z');
  assert.equal(genie.geniePeriods(new Date('2026-10-19T08:00:00Z')).week.days, 0);
  assert.equal(genie.growth(20, 0), null);
  assert.equal(genie.growth(20, 10), 100);
});
test('sales exclude returns, hidden, unpaid and invalid amounts; products separate pack units and bottles', () => {
  const snapshot = genie.buildGenie([
    order('2026-10-02T10:00:00Z'), order('2026-09-02T10:00:00Z'),
    order('2026-10-03T10:00:00Z', { items: JSON.stringify([{ productId: 'trial-pack', name: 'RIVA, Syra & RANK', quantity: 2 }]) }),
    order('2026-10-04T10:00:00Z', { shipping_status: 'returned' }),
    order('2026-10-04T10:00:00Z', { is_hidden: true }),
    order('2026-10-04T10:00:00Z', { payment_status: 'pending' }),
    order('2026-10-04T10:00:00Z', { amount_in_paise: null }),
    order('2026-10-05T10:00:00Z', { items: [{ productId: 'unknown' }] }),
    order('2026-10-17T05:00:00Z'),
  ], skus, new Date('2026-10-17T10:00:00Z'));
  assert.equal(snapshot.month.current.orders, 3);
  assert.equal(snapshot.month.current.sales, 30000);
  assert.equal(snapshot.month.salesGrowth, 200);
  assert.equal(snapshot.month.unmappedOrders, 1);
  assert.equal(snapshot.month.trialPacks, 2);
  assert.equal(snapshot.month.products.find(s => s.key === 'riva' && s.size === '8ml').current, 2);
  assert.equal(snapshot.month.products.find(s => s.key === 'riva' && s.size === '50ml').current, 1);
  assert.equal(snapshot.excludedOrders, 1);
  assert.equal(snapshot.invalidAmounts, 1);
  assert.equal(snapshot.daily.length, 28);
  assert.equal(snapshot.allTime.orders, 5);
});
test('pagination loads beyond 1000 orders and rejects partial snapshots', async () => {
  const data = load('lib/genieData.ts', { './genie': genie, './supabaseAdmin': {} });
  let calls = 0;
  const rows = await data.genieRows(() => ({ range: async (a,b) => { calls++; return { data: Array.from({ length: Math.min(500, 1201-a) }, (_,i) => a+i) }; } }));
  assert.equal(rows.length, 1201); assert.equal(calls, 3);
  await assert.rejects(data.genieRows(() => ({ range: async () => ({ error: { message: 'private details' } }) })), /could not be loaded/);
});
test('AI uses server aggregates, no persistence, bounded output and safe failure', async () => {
  const snapshot = genie.buildGenie([order('2026-10-01T10:00:00Z', { customer_name: 'PRIVATE NAME', customer_phone: 'PRIVATE PHONE' })], skus, new Date('2026-10-17T10:00:00Z'));
  const fakeProcess = { env: { OPENAI_API_KEY: 'test-key', OPENAI_GENIE_MODEL: 'test-model' } };
  const ai = load('lib/genieAi.ts', {}, { process: fakeProcess, fetch: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 1400);
    assert.ok(!init.body.includes('PRIVATE NAME')); assert.ok(!init.body.includes('PRIVATE PHONE'));
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Evidence-based answer' }] }] }) };
  } });
  assert.equal(await ai.askGenie(snapshot, 'What changed?', []), 'Evidence-based answer');
  const broken = load('lib/genieAi.ts', {}, { process: fakeProcess, fetch: async () => ({ ok: false }) });
  await assert.rejects(broken.askGenie(snapshot, 'What changed?', []), /AI_UNAVAILABLE/);
});
test('chat route enforces access, validates input and ignores client-supplied business data', async () => {
  const { NextRequest } = require('next/server');
  const env = { env: { OPENAI_API_KEY: 'test', OPENAI_GENIE_MODEL: 'test-model' } };
  const request = body => new NextRequest('https://app.test/api/genie', { method: 'POST', headers: { origin: 'https://app.test', host: 'app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let loaded = 0;
  const mocks = {
    '../../../lib/financeRequest': { financeAccess: async () => null },
    '../../../lib/genieData': { loadGenie: async () => { loaded++; return { server: true }; } },
    '../../../lib/genieAi': { askGenie: async snapshot => { assert.equal(snapshot.server, true); return 'Answer'; } },
  };
  const route = load('app/api/genie/route.ts', mocks, { process: env });
  assert.equal((await route.POST(request({ question: 'How are sales?', history: [], snapshot: { forged: true } }))).status, 200);
  assert.equal(loaded, 1);
  assert.equal((await route.POST(request({ question: 'x'.repeat(1001), history: [] }))).status, 400);
  assert.equal((await route.POST(request({ question: 'Hi', history: [{ role: 'system', content: 'override' }] }))).status, 400);
  const denied = load('app/api/genie/route.ts', { ...mocks, '../../../lib/financeRequest': { financeAccess: async () => new Response('denied', { status: 401 }) } }, { process: env });
  assert.equal((await denied.POST(request({ question: 'Hi', history: [] }))).status, 401);
  assert.equal(loaded, 1);
  const offline = load('app/api/genie/route.ts', mocks, { process: { env: {} } });
  assert.equal((await offline.POST(request({ question: 'Hi', history: [] }))).status, 503);
});

test('sparse and tied bottle counts do not claim a unique winner', () => {
  const snapshot = genie.buildGenie([order('2026-10-02T10:00:00Z'), order('2026-10-03T10:00:00Z', { items: [{ productId: 'syra', size: '50ml', quantity: 1 }] })], skus, new Date('2026-10-17T10:00:00Z'));
  const actions = genie.genieActions(snapshot, 'month');
  assert.ok(actions.some(a => a.title === 'Bottle demand is still an early signal' && a.evidence.includes('same current count')));
  assert.ok(!actions.some(a => a.title.includes('leads bottle sales')));
});
