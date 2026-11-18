// Counter payment rules (pure functions — unit tested in test/payment.test.js).
// FT-10: cash tendered above the total → change is calculated and the payment is recorded.
// FT-11: cash tendered below the total → refused with TENDER_SHORT_MESSAGE; the order stays unpaid.
export const PAYMENT_METHODS = ['cash', 'gcash'];
export const TENDER_SHORT_MESSAGE = 'Tendered amount is less than the total due.';

const toCents = (v) => Math.round(Number(v) * 100);

// Returns { error } or { method, amount, amount_tendered, change_due, reference_number }.
export function checkPayment({ total, method, tendered, reference } = {}) {
  const totalCents = toCents(total);
  if (!Number.isFinite(totalCents) || totalCents < 0) return { error: 'Order total is invalid.' };
  if (!PAYMENT_METHODS.includes(method)) return { error: 'Choose a payment method (Cash or GCash).' };

  if (method === 'gcash') {
    const ref = String(reference ?? '').trim();
    if (ref.length < 4 || ref.length > 100) return { error: 'Enter the GCash reference number.' };
    return { method, amount: totalCents / 100, amount_tendered: totalCents / 100, change_due: 0, reference_number: ref };
  }

  if (tendered === undefined || tendered === null || tendered === '') return { error: 'Enter the amount tendered.' };
  const tenderedCents = toCents(tendered);
  if (!Number.isFinite(tenderedCents) || tenderedCents < 0) return { error: 'Enter a valid tendered amount.' };
  if (tenderedCents > 100000000) return { error: 'Tendered amount is too large.' };
  if (tenderedCents < totalCents) return { error: TENDER_SHORT_MESSAGE, code: 'TENDER_SHORT' };

  return {
    method,
    amount: totalCents / 100,
    amount_tendered: tenderedCents / 100,
    change_due: (tenderedCents - totalCents) / 100,
    reference_number: null,
  };
}

// "ORD-10492" — falls back to the short id when the order number column is not set up yet.
export function orderLabel(order) {
  if (order?.order_number) return `ORD-${order.order_number}`;
  return order?.order_id ? `ORD-${String(order.order_id).slice(0, 8).toUpperCase()}` : 'ORD-—';
}
