// POST /api/orders  GET /api/orders  GET /api/orders/admin/all (staff)
// GET /api/orders/:id  PATCH /api/orders/:id/status (staff: admin, pharmacist, counter)
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireStaff, ADMIN_ROLES, STAFF_ROLES } from '../middleware/auth-middleware.js';
import { isUuid, sendRpcError } from '../lib/helpers.js';
import { orderingBlocked } from '../lib/settings.js';
import { getSettings } from '../lib/settings-store.js';

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
router.post('/', requireAuth, async (req, res) => {
  const { items, prescription_id, notes } = req.body ?? {};
  if (orderingBlocked(await getSettings(), req.profile.role)) {
    return res.status(503).json({ error: 'Online orders are paused right now. Please visit or call the pharmacy.' });
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

  // Prices always come from the database; an admin ringing up a POS walk-in sale skips the Rx upload step.
  const { data, error } = await supabaseAdmin.rpc('place_order', {
    p_customer_id: req.user.id,
    p_items: lines,
    p_pickup_branch: null,
    p_notes: typeof notes === 'string' ? notes : null,
    p_prescription_id: prescription_id || null,
    p_skip_rx_check: ADMIN_ROLES.includes(req.profile.role),
  });
  if (error) return sendRpcError(res, error);

  return res.status(201).json({ message: 'Order placed successfully.', ...data });
});

/* ── ALL ORDERS (staff) ──────────────────────────────────────────── */
router.get('/admin/all', requireStaff, async (req, res) => {
  const { status } = req.query;
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status filter.' });

  let query = supabaseAdmin
    .from('Order')
    .select(`order_id, status, total_amount, placed_at, notes,
             profiles:Profiles(full_name, phone), OrderItem(quantity, Product(name))`)
    .order('placed_at', { ascending: false })
    .limit(300);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load orders.' }); }
  return res.json(data);
});

/* ── MY ORDERS ───────────────────────────────────────────────────── */
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('Order')
    .select(`order_id, status, total_amount, placed_at, ready_at, completed_at, notes, OrderItem(${ITEM_FIELDS})`)
    .eq('customer_id', req.user.id)
    .order('placed_at', { ascending: false });
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load your orders.' }); }
  return res.json(data.map(withImage));
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
  return res.json({ message: `Order status updated to "${status}".`, order: data });
});

export default router;
