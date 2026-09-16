const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { exports, require: name => mocks[name] || require(name), URL, Buffer, Date, process });
  return exports;
}

test('push subscriptions accept browser services but reject arbitrary endpoints and malformed keys', () => {
  const { validSubscription, isAllowedPushEndpoint } = load('lib/pushValidation.ts');
  const keys = { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) };
  for (const endpoint of ['https://fcm.googleapis.com/push/test', 'https://updates.push.services.mozilla.com/wpush/test', 'https://web.push.apple.com/test', 'https://wns.notify.windows.com/test']) {
    assert(validSubscription({ endpoint, keys }));
  }
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://localhost/test', 'https://127.0.0.1/test', 'https://push.apple.com.evil.test/test', 'https://fcm.googleapis.com:8443/test', 'https://user:pass@fcm.googleapis.com/test']) assert(!isAllowedPushEndpoint(endpoint));
  assert(!validSubscription({ endpoint: 'https://fcm.googleapis.com/test', keys: { auth: 'bad', p256dh: 'bad' } }));
});

test('real PostgreSQL trigger queues paid orders once, excludes abandoned/hidden orders, and leases retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.orders(id uuid primary key default gen_random_uuid(), payment_status text default 'pending', is_hidden boolean default false, payment_type text default 'full');
      insert into public.orders(payment_status) values ('paid');`);
    const migration = readFileSync('supabase/migrations/012_order_push_notifications.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Re-running is safe and does not backfill.
    const count = async () => (await db.query('select count(*)::int as n from public.order_push_events')).rows[0].n;
    assert.equal(await count(), 0);
    const pending = (await db.query("insert into orders(payment_status) values ('pending') returning id")).rows[0].id;
    await db.exec("insert into orders(payment_status) values ('failed'); insert into orders(payment_status,is_hidden) values ('paid',true);");
    assert.equal(await count(), 0);
    await db.query("update orders set payment_status='paid' where id=$1", [pending]);
    await db.query("update orders set payment_status='paid' where id=$1", [pending]);
    await db.query("update orders set payment_status='refunded' where id=$1", [pending]);
    await db.query("update orders set payment_status='paid' where id=$1", [pending]);
    assert.equal(await count(), 1);
    await db.exec("insert into orders(payment_status,payment_type) values ('paid','partial_cod')");
    assert.equal(await count(), 2);
    const claims = await db.query('select * from claim_order_push_events()');
    assert.equal(claims.rows.length, 2);
    assert(claims.rows.every(row => row.attempts === 1));
    assert.equal((await db.query('select * from claim_order_push_events()')).rows.length, 0);
    await db.exec("update order_push_events set claimed_at=now()-interval '6 minutes'");
    assert.equal((await db.query('select * from claim_order_push_events()')).rows.length, 2);
    await db.exec("update order_push_events set status='pending',available_at=now()+interval '1 hour'");
    assert.equal((await db.query('select * from claim_order_push_events()')).rows.length, 0);
    await db.exec("update order_push_events set available_at=now(),attempts=8");
    assert.equal((await db.query('select * from claim_order_push_events()')).rows.length, 0);
    const permissions = (await db.query("select has_function_privilege('anon', 'claim_order_push_events()', 'execute') as anon, has_table_privilege('authenticated', 'push_subscriptions', 'select') as authenticated")).rows[0];
    assert.equal(permissions.anon, false); assert.equal(permissions.authenticated, false);
  } finally { await db.close(); }
});

test('dispatch authenticates machine requests before doing work', async () => {
  const old = process.env.PUSH_WEBHOOK_SECRET;
  process.env.PUSH_WEBHOOK_SECRET = 'test-secret';
  const response = { json: (body, init = {}) => ({ body, status: init.status || 200 }) };
  let calls = 0;
  const route = load('app/api/push/dispatch/route.ts', {
    'next/server': { NextResponse: response },
    '../../../../lib/push': { pushConfigured: () => true, dispatchOrderPush: async () => { calls++; return { processed: 1, delivered: 1, retried: 0 }; } },
  });
  try {
    const request = token => ({ method: 'POST', headers: { get: () => token } });
    assert.equal((await route.POST(request('Bearer wrong'))).status, 401);
    assert.equal(calls, 0);
    assert.equal((await route.POST(request('Bearer test-secret'))).status, 200);
    assert.equal(calls, 1);
  } finally { if (old === undefined) delete process.env.PUSH_WEBHOOK_SECRET; else process.env.PUSH_WEBHOOK_SECRET = old; }
});

test('service worker displays pushes and restricts notification navigation to dashboard orders', async () => {
  const events = {}, shown = [], opened = [];
  const self = { addEventListener: (name, handler) => { events[name] = handler; }, location: { origin: 'https://dashboard.example.test' }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, URL });
  let work;
  events.push({ data: { json: () => ({ title: 'New paid order', url: 'https://evil.test' }) }, waitUntil: promise => { work = promise; } });
  await work;
  assert.equal(shown[0][1].data.url, '/orders');
  events.notificationclick({ notification: { close() {}, data: { url: '/orders/test-order' } }, waitUntil: promise => { work = promise; } });
  await work;
  assert.equal(opened[0], 'https://dashboard.example.test/orders/test-order');
});

test('sender retries transient errors, skips prior receipts, and removes expired subscriptions', async () => {
  const endpoints = ['already-sent', 'new', 'expired', 'temporary'].map(name => `https://fcm.googleapis.com/${name}`);
  const sent = [], deleted = [], receipts = [], updates = [];
  const event = { id: 'event-1', order_id: 'order-1', created_at: new Date().toISOString(), attempts: 1 };
  const mockDb = {
    rpc: async () => ({ data: [event] }),
    from(table) {
      let mode = 'select';
      const chain = {
        select() { return chain; }, lte() { return chain; }, gt() { return chain; },
        eq(key, value) { if (mode === 'delete') deleted.push(value); return chain; },
        maybeSingle: async () => ({ data: { id: 'order-1', order_number: 'EON-1', payment_status: 'paid', is_hidden: false } }),
        delete() { mode = 'delete'; return chain; },
        upsert(row) { receipts.push(row); return Promise.resolve({ error: null }); },
        update(row) { updates.push(row); mode = 'update'; return chain; },
        then(resolve) {
          resolve({ data: mode === 'select' ? table === 'push_subscriptions' ? endpoints.map(endpoint => ({ endpoint, keys: {} })) : [{ endpoint: endpoints[0] }] : null, error: null });
        },
      };
      return chain;
    },
  };
  const oldEnv = { ...process.env };
  Object.assign(process.env, { WEB_PUSH_PUBLIC_KEY: 'test', WEB_PUSH_PRIVATE_KEY: 'test', WEB_PUSH_SUBJECT: 'mailto:test@example.test' });
  const { dispatchOrderPush } = load('lib/push.ts', {
    './supabaseAdmin': { supabaseAdmin: () => mockDb },
    './pushValidation': { isAllowedPushEndpoint: () => true },
    'web-push': { sendNotification: async (sub, payload) => {
      sent.push(sub.endpoint);
      assert(!payload.includes('customer'));
      if (sub.endpoint.endsWith('expired')) throw { statusCode: 410 };
      if (sub.endpoint.endsWith('temporary')) throw { statusCode: 503 };
    } },
  });
  try {
    const result = await dispatchOrderPush();
    assert.equal(result.delivered, 1); assert.equal(result.retried, 1);
    assert(!sent.includes(endpoints[0]));
    assert.deepEqual(deleted, [endpoints[2]]);
    assert.equal(receipts[0].endpoint, endpoints[1]);
    assert.equal(updates[0].status, 'pending');
    assert(new Date(updates[0].available_at).getTime() > Date.now());
  } finally {
    for (const key of ['WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT']) {
      if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
    }
  }
});

test('logout clears authentication even if removing device alerts fails', async () => {
  const cookies = [];
  const route = load('app/api/auth/logout/route.ts', {
    'next/server': { NextResponse: { redirect: (url, status) => ({ url, status, cookies: { set: (...args) => cookies.push(args) } }) } },
    '../../../../lib/auth': { SESSION_COOKIE: 'session', PUSH_DEVICE_COOKIE: 'device' },
    '../../../../lib/supabaseAdmin': { supabaseAdmin: () => ({ from: () => ({ delete: () => ({ eq: async () => ({ error: new Error('Database unavailable') }) }) }) }) },
  });
  const result = await route.POST({ url: 'https://dashboard.example.test/api/auth/logout', cookies: { get: () => ({ value: 'https://fcm.googleapis.com/test' }) } });
  assert.equal(result.status, 303);
  assert.equal(result.url.pathname, '/login');
  assert.equal(result.url.searchParams.get('alerts'), 'still-enabled');
  assert(cookies.some(([name, value, options]) => name === 'session' && value === '' && options.maxAge === 0));
});
