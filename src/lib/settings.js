// Pharmacy settings: defaults, validation, and the rules that depend on them.
// Pure functions only (no database) so they can be unit-tested.
import { STAFF_ROLES } from './roles.js';

export const DEFAULT_SETTINGS = Object.freeze({
  pharmacy_name: "Angel's Pharmacy",
  license_no: 'PH-123456',
  location: 'Valenzuela City',
  regulatory_body: 'Department of Health (DOH), Philippines',
  contact_email: 'caronanmj4@gmail.com',
  contact_phone: '09563868022',
  hours_weekday: '8:00 AM – 6:00 PM',
  hours_saturday: '8:00 AM – 12:00 PM',
  hours_sunday: 'Closed',
  low_stock_threshold: 10,
  accepting_orders: true,
});

const TEXT_FIELDS = {
  pharmacy_name: 120, license_no: 60, location: 200, regulatory_body: 120,
  contact_phone: 30, hours_weekday: 60, hours_saturday: 60, hours_sunday: 60,
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LOW_STOCK_MIN = 0;
export const LOW_STOCK_MAX = 1000;

// Returns { updates } with only the provided, valid fields, or { error }.
export function cleanSettings(input) {
  if (!input || typeof input !== 'object') return { error: 'Send the settings to save.' };
  const updates = {};

  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (input[field] === undefined) continue;
    const value = String(input[field] ?? '').trim();
    if (!value) return { error: `${label(field)} cannot be empty.` };
    if (value.length > max) return { error: `${label(field)} must be ${max} characters or fewer.` };
    updates[field] = value;
  }

  if (input.contact_email !== undefined) {
    const email = String(input.contact_email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { error: 'Enter a valid contact email.' };
    updates.contact_email = email;
  }

  if (input.low_stock_threshold !== undefined) {
    const n = Number(input.low_stock_threshold);
    if (!Number.isInteger(n) || n < LOW_STOCK_MIN || n > LOW_STOCK_MAX) {
      return { error: `Low-stock alert must be a whole number from ${LOW_STOCK_MIN} to ${LOW_STOCK_MAX}.` };
    }
    updates.low_stock_threshold = n;
  }

  if (input.accepting_orders !== undefined) {
    if (typeof input.accepting_orders !== 'boolean') return { error: 'Accepting orders must be on or off.' };
    updates.accepting_orders = input.accepting_orders;
  }

  if (!Object.keys(updates).length) return { error: 'Nothing to update.' };
  return { updates };
}

// When online orders are switched off, customers cannot order; staff (POS) still can.
export function orderingBlocked(settings, role) {
  if (settings?.accepting_orders !== false) return false;
  return !STAFF_ROLES.includes(role);
}

const LABELS = {
  pharmacy_name: 'Pharmacy name', license_no: 'License number', location: 'Location',
  regulatory_body: 'Regulatory body', contact_phone: 'Contact phone', hours_weekday: 'Monday–Friday hours',
  hours_saturday: 'Saturday hours', hours_sunday: 'Sunday hours',
};
const label = (field) => LABELS[field] || field;
