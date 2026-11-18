// POST /api/orders  GET /api/orders  GET /api/orders/admin/all (staff)
// GET /api/orders/:id  PATCH /api/orders/:id/status (staff: admin, pharmacist, counter)
// POST /api/orders/:id/payment (staff) — counter payment: cash with change, or GCash (FT-10 / FT-11)
// Every order is in-store pick-up only (no delivery).
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireStaff, ADMIN_ROLES, STAFF_ROLES, POS_ROLES } from '../middleware/auth-middleware.js';
import { isUuid, sendRpcError } from '../lib/helpers.js';
import { orderingBlocked } from '../lib/settings.js';
import { getSettings } from '../lib/settings-store.js';
import { audit, isMissingSchema, V6_MIGRATION } from '../lib/audit.js';
import { checkPayment, orderLabel } from '../lib/payment.js';

// Runs the query with the v6 columns (order number, payments); falls back to the old columns
// so the site keeps working before the v6 migration is run.
async function selectWithFallback(build, fullSelect, basicSelect) {
  const first = await build(fullSelect);
  if (!first.error || !isMissingSchema(first.error)) return first;
  console.warn(`Orders: v6 columns missing (${first.error.message}) — run ${V6_MIGRATION}`);
  return build(basicSelect);
}
const PAYMENT_FIELDS = 'Payment(payment_id, status, method, amount, amount_tendered, change_due, paid_at, reference_number)';
const paidInfo = (order) => {
  const paid = (order.Payment || []).find(p => p.status === 'paid') || null;
  const { Payment, ...rest } = order;
  return { ...rest, order_label: orderLabel(order), payment: paid, is_paid: Boolean(paid) };
};

const router = Router();
const STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];

const ITEM_FIELDS = 'order_item_id, product_id, quantity, unit_price, subtotal, Product(name, img_path, requires_rx)';
const withImage = (order) => ({
  ...order,
  OrderItem: (order.OrderItem || []).map(({ Product, ...i }) => ({
    ...i,
    medicines: Product ? { name: Product.name, image_url: Product.img_path, requires_rx: Product.requires_rx } : null,
  })),
});

/* ── PLACE ORDER ─────────────────────────────────────────────────── */
// Customers order for themselves. Admin/counter (POS, FT-12) may pass customer_id to order for a
// registered customer; leaving it out records a walk-in sale under the staff account.
router.post('/', requireAuth, async (req, res) => {
  const { items, prescription_id, notes, customer_id, fulfillment } = req.body ?? {};
  if (orderingBlocked(await getSettings(), req.profile.role)) {
    return res.status(503).json({ error: 'Online orders are paused right now. Please visit or call the pharmacy.' });
  }
  if (fulfillment !== undefined && fulfillment !== 'pickup') {
    return res.status(400).json({ error: 'Delivery is not available. All orders are for in-store pick-up only.' });
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return res.status(400).json({ error: 'items must contain between 1 and 50 entries.' });
  }
  const lines = [];
  for (const item of items) {
    const product_id = item?.product_id ?? item?.medicine_id;
    const quantity = Number(item?.quantity);
    if (!isUuid(product_id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: 'Each item needs a valid medicine id and a quantity from 1 to 99.' });
    }
    lines.push({ product_id, quantity });
  }
  if (prescription_id && !isUuid(prescription_id)) {
    return res.status(400).json({ error: 'Invalid prescription id.' });
  }

  // Who the order is for.
  let ownerId = req.user.id;
  let rxId = prescription_id || null;
  const isPosOrder = customer_id !== undefined && customer_id !== null && customer_id !== '';
  if (isPosOrder) {
    if (!POS_ROLES.includes(req.profile.role)) return res.status(403).json({ error: 'Only admin or counter staff can order for a customer.' });
    if (!isUuid(customer_id)) return res.status(400).json({ error: 'Choose a registered customer.' });
    const { data: customer } = await supabaseAdmin.from('Profiles')
      .select('id, is_active, role').eq('id', customer_id).maybeSingle();
    if (!customer || !customer.is_active) return res.status(404).json({ error: 'Customer not found or inactive.' });
    ownerId = customer.id;
    if (!rxId) {
      // Rx items use the customer's latest verified prescription.
      const { data: rx } = await supabaseAdmin.from('Prescription').select('prescription_id')
        .eq('customer_id', customer.id).eq('status', 'verified')
        .order('reviewed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      rxId = rx?.prescription_id || null;
    }
  }

  // Prices always come from the database; an admin ringing up a POS sale skips the Rx upload step.
  const { data, error } = await supabaseAdmin.rpc('place_order', {
    p_customer_id: ownerId,
    p_items: lines,
    p_pickup_branch: null,
    p_notes: typeof notes === 'string' ? notes : null,
    p_prescription_id: rxId,
    p_skip_rx_check: ADMIN_ROLES.includes(req.profile.role),
  });
  if (error) return sendRpcError(res, error);

  const { data: placed } = await supabaseAdmin.from('Order').select('*').eq('order_id', data.order_id).maybeSingle();
  const order_number = placed?.order_number ?? null;
  const label = orderLabel({ order_id: data.order_id, order_number });

  await audit(req, 'order.placed', {
    target_type: 'order', target_id: data.order_id,
    details: { order: label, total: data.total_amount, items: lines.length, pos: isPosOrder || STAFF_ROLES.includes(req.profile.role), customer_id: ownerId },
  });

  return res.status(201).json({
    message: 'Order placed successfully. Pick it up in store — no delivery.',
    ...data, order_number, order_label: label, fulfillment: 'pickup',
  });
});

/* ── ALL ORDERS (staff) ──────────────────────────────────────────── */
router.get('/admin/all', requireStaff, async (req, res) => {
  const { status } = req.query;
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status filter.' });

  const basic = `order_id, status, total_amount, placed_at, notes,
             profiles:Profiles(full_name, phone), OrderItem(quantity, Product(name))`;
  const full = `order_id, order_number, fulfillment, status, total_amount, placed_at, notes,
             profiles:Profiles(full_name, phone), OrderItem(quantity, Product(name)), ${PAYMENT_FIELDS}`;
  const { data, error } = await selectWithFallback((select) => {
    let query = supabaseAdmin.from('Order').select(select).order('placed_at', { ascending: false }).limit(300);
    if (status) query = query.eq('status', status);
    return query;
  }, full, basic);

  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load orders.' }); }
  return res.json(data.map(paidInfo));
});

/* ── MY ORDERS ───────────────────────────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  const basic = `order_id, status, total_amount, placed_at, ready_at, completed_at, notes, OrderItem(${ITEM_FIELDS})`;
  const full = `order_id, order_number, fulfillment, status, total_amount, placed_at, ready_at, completed_at, notes, OrderItem(${ITEM_FIELDS}), ${PAYMENT_FIELDS}`;
  const { data, error } = await selectWithFallback((select) => supabaseAdmin
    .from('Order').select(select).eq('customer_id', req.user.id).order('placed_at', { ascending: false }), full, basic);
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load your orders.' }); }
  return res.json(data.map(o => paidInfo(withImage(o))));
});

/* ── SINGLE ORDER ────────────────────────────────────────────────── */
router.get('/:id', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Order not found.' });

  let query = supabaseAdmin
    .from('Order')
    .select(`*, OrderItem(${ITEM_FIELDS})`)
    .eq('order_id', req.params.id);
  if (!STAFF_ROLES.includes(req.profile.role)) query = query.eq('customer_id', req.user.id);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Order not found.' });
  return res.json(withImage(data));
});

/* ── UPDATE STATUS (staff) ───────────────────────────────────────── */
router.patch('/:id/status', requireStaff, async (req, res) => {
  const { status } = req.body ?? {};
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUSES.join(', ')}` });
  }

  const { data, error } = await supabaseAdmin.rpc('update_order_status', {
    p_order_id: req.params.id, p_status: status,
  });
  if (error) return sendRpcError(res, error);
  await audit(req, 'order.status_changed', {
    target_type: 'order', target_id: req.params.id,
    details: { order: orderLabel(data), status },
  });
  return res.json({ message: `Order status updated to "${status}".`, order: data });
});

/* ── RECORD PAYMENT (staff) — FT-10 / FT-11 ──────────────────────── */
router.post('/:id/payment', requireStaff, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Order not found.' });
  const { data: order, error: orderErr } = await supabaseAdmin.from('Order')
    .select('*').eq('order_id', req.params.id).maybeSingle();
  if (orderErr || !order) return res.status(404).json({ error: 'Order not found.' });
  if (order.status === 'cancelled') return res.status(409).json({ error: 'This order is cancelled.' });

  const { method, tendered, reference } = req.body ?? {};
  const check = checkPayment({ total: order.total_amount, method, tendered, reference });
  if (check.error) {
    if (check.code === 'TENDER_SHORT') {
      await audit(req, 'order.payment_refused', {
        target_type: 'order', target_id: order.order_id,
        details: { order: orderLabel(order), total: Number(order.total_amount), tendered: Number(tendered) },
      });
    }
    return res.status(400).json({ error: check.error, code: check.code || null });
  }

  const { data, error } = await supabaseAdmin.rpc('record_payment', {
    p_order_id: order.order_id,
    p_method: check.method,
    p_tendered: check.amount_tendered,
    p_reference: check.reference_number,
    p_staff_id: req.user.id,
  });
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'This payment (or GCash reference) was already recorded.' });
    return sendRpcError(res, error);
  }

  await audit(req, 'order.payment_recorded', {
    target_type: 'order', target_id: order.order_id,
    details: { order: orderLabel(order), method: data.method, total: Number(data.total), tendered: Number(data.amount_tendered), change: Number(data.change_due) },
  });
  return res.status(201).json({ message: 'Payment recorded.', ...data, order_label: orderLabel(order) });
});

export default router;
