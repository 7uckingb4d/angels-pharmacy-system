// Run with: npm test   (test cases FT-10 and FT-11)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPayment, TENDER_SHORT_MESSAGE, orderLabel } from '../src/lib/payment.js';

test('FT-10: total ₱100, cash tendered ₱200 → change ₱100', () => {
  const r = checkPayment({ total: 100, method: 'cash', tendered: 200 });
  assert.equal(r.error, undefined);
  assert.equal(r.change_due, 100);
  assert.equal(r.amount_tendered, 200);
  assert.equal(r.method, 'cash');
});

test('FT-11: total ₱100, cash tendered ₱50 → refused with the exact message', () => {
  const r = checkPayment({ total: 100, method: 'cash', tendered: 50 });
  assert.equal(r.error, 'Tendered amount is less than the total due.');
  assert.equal(TENDER_SHORT_MESSAGE, 'Tendered amount is less than the total due.');
});

test('exact cash gives zero change; centavos are handled', () => {
  assert.equal(checkPayment({ total: 100, method: 'cash', tendered: 100 }).change_due, 0);
  assert.equal(checkPayment({ total: 99.75, method: 'cash', tendered: 100 }).change_due, 0.25);
  assert.equal(checkPayment({ total: 100, method: 'cash', tendered: 99.99 }).error, TENDER_SHORT_MESSAGE);
});

test('GCash needs a reference number and has no change', () => {
  assert.ok(checkPayment({ total: 100, method: 'gcash', reference: '' }).error);
  const r = checkPayment({ total: 100, method: 'gcash', reference: '1234567890' });
  assert.equal(r.change_due, 0);
  assert.equal(r.reference_number, '1234567890');
});

test('unknown payment methods are refused', () => {
  assert.ok(checkPayment({ total: 100, method: 'delivery-cod', tendered: 200 }).error);
});

test('orders get an ORD- number', () => {
  assert.equal(orderLabel({ order_number: 10492 }), 'ORD-10492');
});
