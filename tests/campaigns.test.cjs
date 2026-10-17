const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, { exports, require: name => mocks[name] || require(name), Map, Array, String });
  return exports;
}

const cartItems = load('lib/cartItems.ts');
const followups = load('lib/followups.ts', { './cartItems': cartItems });
const phone = load('lib/phone.ts');
const audience = load('lib/campaignAudience.ts', {
  './followups': followups,
  './phone': phone,
});

test('Trial Pack campaign audience uses only paid, visible orders and deduplicates phones', () => {
  const rows = [
    { customer_name: 'Newest name', customer_phone: '98765 43210', customer_city: 'Chennai', payment_status: 'paid', is_hidden: false, items: JSON.stringify([{ productId: 'trial-pack', name: 'Discovery Trial Pack' }]) },
    { customer_name: 'Older duplicate', customer_phone: '919876543210', customer_city: 'Old city', payment_status: 'paid', is_hidden: false, items: [{ name: 'Trial Pack 3x8ml' }] },
    { customer_name: 'Pending', customer_phone: '9999999999', payment_status: 'pending', is_hidden: false, items: [{ productId: 'trial-pack' }] },
    { customer_name: 'Hidden', customer_phone: '8888888888', payment_status: 'paid', is_hidden: true, items: [{ name: 'Trial Pack' }] },
    { customer_name: 'Bottle buyer', customer_phone: '7777777777', payment_status: 'paid', is_hidden: false, items: [{ productId: 'silent-gold', name: 'Silent Gold 50ml' }] },
  ];

  const result = audience.trialPackAudienceFromOrders(rows, 500);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Newest name');
  assert.equal(result[0].phone, '919876543210');
  assert.equal(result[0].product, 'Trial Pack');
});

test('Trial Pack audience applies the campaign limit after filtering', () => {
  const rows = [
    { customer_name: 'Not a match', customer_phone: '9999999999', payment_status: 'paid', is_hidden: false, items: [{ name: 'Bottle' }] },
    { customer_name: 'First', customer_phone: '9876543210', payment_status: 'paid', is_hidden: false, items: [{ name: '3×8ml Trial Pack' }] },
    { customer_name: 'Second', customer_phone: '8765432109', payment_status: 'paid', is_hidden: false, items: [{ productId: 'trial-pack' }] },
  ];

  const result = audience.trialPackAudienceFromOrders(rows, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'First');
});
