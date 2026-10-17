const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: name => mocks[name] || require(name), process });
  return exports;
}
const cart = load('lib/cartItems.ts');
const followups = load('lib/followups.ts', { './cartItems': cart });
const finance = load('lib/finance.ts', { './cartItems': cart, './accounting': load('lib/accounting.ts') });
const catalog = load('lib/productCatalog.ts');

test('RIVA reminders, order display, Trial Pack follow-ups and costing', () => {
  assert.equal(catalog.resolveProductSlug('riva'), 'riva-women-perfume');
  assert.equal(catalog.resolveProductImageUrl('riva'), 'https://www.houseofeon.in/products/riva.png');
  const pack = JSON.stringify([{ productId: 'trial-pack', name: 'RIVA, Syra & RANK', quantity: 2 }]);
  assert.ok(followups.trialPackFragrances(pack).includes('RIVA'));
  assert.equal(followups.orderItemNames([{ name: 'RIVA', productId: 'riva' }])[0], 'RIVA');
  const skus = ['riva', 'syra', 'rank'].map(product_key => ({ id: product_key, product_key, size: '8ml' }));
  assert.equal(finance.orderUnits(pack, skus).reduce((sum, row) => sum + row.quantity, 0), 6);
  assert.equal(finance.orderUnits([{ productId: 'riva-women-perfume', size: '50ml', quantity: 2 }], [{ id: 'riva50', product_key: 'riva', size: '50ml' }])[0].quantity, 2);
});

test('Postgres: RIVA backfill, repeat migration, reservations, paid updates and refunds', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create table orders(id uuid primary key default gen_random_uuid(), order_number text, items jsonb, payment_status text);`);
    for (const file of ['008_inventory.sql', '010_storefront_inventory.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    const bottle = [{ productId: 'riva', name: 'RIVA', size: '50ml', quantity: 2 }];
    // Historical paid order stores a JSON string, not a native JSON array.
    await db.query('insert into orders(order_number, items, payment_status) values ($1,$2::jsonb,$3)', ['RIVA-old', JSON.stringify(JSON.stringify(bottle)), 'paid']);
    const migration = readFileSync('supabase/migrations/014_riva_inventory.sql', 'utf8');
    await db.exec(migration);
    const stock = async size => (await db.query("select current_stock from inventory_skus where product_key='riva' and size=$1", [size])).rows[0].current_stock;
    assert.equal(await stock('50ml'), 3);
    await db.exec(migration);
    assert.equal(await stock('50ml'), 3);
    assert.equal((await db.query("select count(*)::int n from inventory_skus where product_key='riva'")).rows[0].n, 2);
    await db.exec("update orders set payment_status='failed' where order_number='RIVA-old'");
    assert.equal(await stock('50ml'), 5);
    await db.exec("select adjust_inventory(id,'set',10,'Verified physical stock') from inventory_skus where product_key='riva'");
    await db.exec(migration);
    assert.equal(await stock('50ml'), 10);
    const pack = [{ productId: 'trial-pack', name: 'RIVA, Syra & RANK', size: '3x8ml', quantity: 2 }];
    await db.query('select reserve_storefront_inventory($1,$2::jsonb)', ['riva-reservation', JSON.stringify(JSON.stringify(pack))]);
    const availability = (await db.query("select * from get_storefront_inventory_availability() where product_key='riva' and size='8ml'")).rows[0];
    assert.equal(availability.reserved_stock, 2);
    assert.equal(availability.available_stock, 8);
    await db.query('insert into orders(order_number,items,payment_status,inventory_reservation_key) values ($1,$2::jsonb,$3,$4)', ['RIVA-pack', JSON.stringify(JSON.stringify(pack)), 'paid', 'riva-reservation']);
    assert.equal(await stock('8ml'), 8);
    await db.exec("update orders set payment_status='paid' where order_number='RIVA-pack'");
    assert.equal(await stock('8ml'), 8);
    assert.equal((await db.query("select count(*)::int n from inventory_unmapped_items")).rows[0].n, 0);
    await db.exec("update orders set payment_status='refunded' where order_number='RIVA-pack'");
    assert.equal(await stock('8ml'), 10);
    assert.equal((await db.query("select inventory_parse_items('\"invalid\"'::jsonb) as items")).rows[0].items.length, 0);
    assert.equal((await db.query("select has_function_privilege('anon','sync_order_inventory(uuid,text,jsonb,boolean)','EXECUTE') allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});
