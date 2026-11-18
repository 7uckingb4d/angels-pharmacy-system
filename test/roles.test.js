// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRole } from '../src/lib/roles.js';
import { requireAdmin, requirePharmacy, requireStaff } from '../src/middleware/auth-middleware.js';

// Each guard is [requireAuth, roleCheck]; call only the role check with a fake request.
function allowed(guard, role) {
  let passed = false;
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  guard[1]({ profile: { role } }, res, () => { passed = true; });
  return passed && status === 200;
}

test('old owner/administrator accounts count as admin', () => {
  assert.equal(normalizeRole('owner'), 'admin');
  assert.equal(normalizeRole('administrator'), 'admin');
  assert.equal(normalizeRole('counter'), 'counter');
  assert.equal(normalizeRole(null), 'customer');
});

test('only admin can add, edit or remove products', () => {
  assert.equal(allowed(requireAdmin, 'admin'), true);
  assert.equal(allowed(requireAdmin, 'pharmacist'), false);
  assert.equal(allowed(requireAdmin, 'counter'), false);
});

test('counter cannot review prescriptions; pharmacist and admin can', () => {
  assert.equal(allowed(requirePharmacy, 'pharmacist'), true);
  assert.equal(allowed(requirePharmacy, 'admin'), true);
  assert.equal(allowed(requirePharmacy, 'counter'), false);
});

test('counter, pharmacist and admin can update order status; customers cannot', () => {
  assert.equal(allowed(requireStaff, 'counter'), true);
  assert.equal(allowed(requireStaff, 'pharmacist'), true);
  assert.equal(allowed(requireStaff, 'admin'), true);
  assert.equal(allowed(requireStaff, 'customer'), false);
});
