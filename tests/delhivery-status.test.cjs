const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/delhivery.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleExports, process: { env: {} } });
const derive = moduleExports.deriveDelhiveryShipmentStatus;
test('current Not Picked remains visible over historical Manifested', () => {
  const result = derive({ Status: { Status: 'Not Picked', StatusLocation: 'Chennai' }, Scans: [{ ScanDetail: { Scan: 'Manifested' } }] });
  assert.equal(result.rawStatus, 'Not Picked');
  assert.equal(result.location, 'Chennai');
  assert.notEqual(result.mappedStatus, 'cancelled');
});
test('current reporting stays separate from historical fulfilment progress', () => {
  const result = derive({ Status: { Status: 'Pending' }, Scans: [{ ScanDetail: { Scan: 'In Transit' } }] });
  assert.equal(result.rawStatus, 'Pending');
  assert.equal(result.mappedStatus, 'shipped');
});
test('scan label remains a fallback when headline is missing', () => {
  const result = derive({ Scans: [{ ScanDetail: { Scan: 'Delivered' } }] });
  assert.equal(result.rawStatus, 'Delivered');
  assert.equal(result.mappedStatus, 'delivered');
});
