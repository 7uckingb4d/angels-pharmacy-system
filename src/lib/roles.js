// Single source of truth for staff roles.
//   admin      — everything (users, products, POS, prescriptions, orders, settings)
//   pharmacist — review prescriptions, view products, update order status
//   counter    — POS (place pick-up orders for registered customers, take payments) + order status
//   customer   — shop, upload prescriptions, track own orders
// Old databases may still store 'owner' / 'administrator'; both are treated as 'admin'.
export const ROLE_LIST = ['admin', 'pharmacist', 'counter', 'customer'];
export const ADMIN_ROLES = ['admin'];
export const PHARMACY_ROLES = ['admin', 'pharmacist'];
export const STAFF_ROLES = ['admin', 'pharmacist', 'counter'];
// POS / counter checkout (test cases FT-10 to FT-12): admin + counter.
export const POS_ROLES = ['admin', 'counter'];

const LEGACY = { owner: 'admin', administrator: 'admin' };

export function normalizeRole(role) {
  const value = String(role || 'customer').trim().toLowerCase();
  if (LEGACY[value]) return LEGACY[value];
  return ROLE_LIST.includes(value) ? value : 'customer';
}
