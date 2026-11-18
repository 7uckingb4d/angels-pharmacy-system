// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, orderingBlocked, DEFAULT_SETTINGS } from '../src/lib/settings.js';

test('low-stock alert accepts whole numbers 0 to 1000 only', () => {
  assert.equal(cleanSettings({ low_stock_threshold: 0 }).updates.low_stock_threshold, 0);
  assert.equal(cleanSettings({ low_stock_threshold: '25' }).updates.low_stock_threshold, 25);
  assert.equal(cleanSettings({ low_stock_threshold: 1000 }).updates.low_stock_threshold, 1000);
  assert.ok(cleanSettings({ low_stock_threshold: 1001 }).error);
  assert.ok(cleanSettings({ low_stock_threshold: -1 }).error);
  assert.ok(cleanSettings({ low_stock_threshold: 2.5 }).error);
});

test('contact email must be a valid address', () => {
  assert.equal(cleanSettings({ contact_email: ' Shop@Example.com ' }).updates.contact_email, 'shop@example.com');
  assert.ok(cleanSettings({ contact_email: 'not-an-email' }).error);
});

test('pharmacy details cannot be saved empty', () => {
  assert.ok(cleanSettings({ license_no: '   ' }).error);
  assert.equal(cleanSettings({ license_no: ' PH-999 ' }).updates.license_no, 'PH-999');
  assert.ok(cleanSettings({}).error);
});

test('online orders switch must be true or false', () => {
  assert.equal(cleanSettings({ accepting_orders: false }).updates.accepting_orders, false);
  assert.ok(cleanSettings({ accepting_orders: 'no' }).error);
});

test('when online orders are off, customers are blocked but staff POS still works', () => {
  const off = { ...DEFAULT_SETTINGS, accepting_orders: false };
  assert.equal(orderingBlocked(off, 'customer'), true);
  assert.equal(orderingBlocked(off, 'admin'), false);
  assert.equal(orderingBlocked(off, 'counter'), false);
  assert.equal(orderingBlocked(DEFAULT_SETTINGS, 'customer'), false);
});
