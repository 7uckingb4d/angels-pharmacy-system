// Staff: dashboard, products, inventory, sales, branches.  Admin: users, roles, contact inbox.
// Public: POST /api/admin/contacts (contact form)
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireStaff, requireAdmin } from '../middleware/auth-middleware.js';
import { BRANCHES } from '../config/branches.js';
import { isUuid, serializeProduct, sendRpcError } from '../lib/helpers.js';

const router = Router();
const LOW_STOCK = Number(process.env.LOW_STOCK_THRESHOLD) || 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── DASHBOARD ───────────────────────────────────────────────────── */
router.get('/dashboard', requireStaff, async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [orders, pendingRx, lowStock, revenue] = await Promise.all([
    supabaseAdmin.from('Order').select('status'),
    supabaseAdmin.from('Prescription').select('prescription_id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('Product').select('product_id', { count: 'exact', head: true }).eq('is_active', true).lte('stock_quantity', LOW_STOCK),
    supabaseAdmin.from('Order').select('total_amount').eq('status', 'completed').gte('completed_at', since),
  ]);
  const failed = [orders, pendingRx, lowStock, revenue].find(r => r.error);
  if (failed) { console.error(failed.error); return res.status(500).json({ error: 'Unable to load dashboard.' }); }

  const orderCounts = {};
  orders.data.forEach(o => { orderCounts[o.status] = (orderCounts[o.status] || 0) + 1; });
  const total = revenue.data.reduce((s, o) => s + Number(o.total_amount), 0);

  return res.json({
    orders: orderCounts,
    pending_prescriptions: pendingRx.count || 0,
    low_stock_items: lowStock.count || 0,
    revenue_last_30_days: total.toFixed(2),
  });
});

/* ── BRANCHES (static) ───────────────────────────────────────────── */
router.get('/branches', requireStaff, (_req, res) => res.json(BRANCHES));

/* ── PRODUCTS incl. inactive (staff) ─────────────────────────────── */
router.get('/products', requireStaff, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('Product').select('*, Category(category_name)').order('name');
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load products.' }); }
  return res.json(data.map(serializeProduct));
});

/* ── INVENTORY ───────────────────────────────────────────────────── */
router.get('/inventory', requireStaff, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('Product')
    .select('product_id, name, stock_quantity, price, is_active, Category(category_name)')
    .order('stock_quantity', { ascending: true });
  if (error) return res.status(500).json({ error: 'Unable to load inventory.' });
  return res.json(data.map(p => ({ ...p, category: p.Category?.category_name ?? null, is_low: p.stock_quantity <= LOW_STOCK })));
});

router.post('/inventory', requireAdmin, async (req, res) => {
  const { product_id, stock_quantity } = req.body ?? {};
  const stock = Number(stock_quantity);
  if (!isUuid(product_id) || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'product_id and a non-negative integer stock_quantity are required.' });
  }
  const { data, error } = await supabaseAdmin.rpc('adjust_stock', { p_product_id: product_id, p_new_stock: stock });
  if (error) return sendRpcError(res, error);
  return res.json(data);
});

/* ── SALES (completed orders) ────────────────────────────────────── */
router.get('/sales', requireStaff, async (req, res) => {
  const { from, to } = req.query;
  let query = supabaseAdmin.from('Order')
    .select('order_id, total_amount, completed_at, pickup_branch, OrderItem(quantity, unit_price, Product(name))')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(500);
  if (from) query = query.gte('completed_at', from);
  if (to) query = query.lte('completed_at', to);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Unable to load sales.' });
  return res.json(data);
});

/* ── CONTACT FORM (public) + INBOX (admin) ───────────────────────── */
router.post('/contacts', async (req, res) => {
  const { full_name, email, phone, branch, message } = req.body ?? {};
  if (!full_name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'full_name, email, and message are required.' });
  }
  if (!EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (message.length > 5000) return res.status(400).json({ error: 'Message is too long (5000 characters max).' });

  const { error } = await supabaseAdmin.from('ContactMessage').insert({
    full_name: full_name.trim().slice(0, 150),
    email: email.trim().slice(0, 254),
    phone: phone?.trim().slice(0, 30) || null,
    branch: branch?.trim().slice(0, 100) || null,
    message: message.trim(),
  });
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to send your message.' }); }
  return res.status(201).json({ message: 'Message sent successfully.' });
});

router.get('/contacts', requireAdmin, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('ContactMessage').select('*').order('submitted_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: 'Unable to load messages.' });
  return res.json(data);
});

router.patch('/contacts/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Message not found.' });
  const { error } = await supabaseAdmin.from('ContactMessage').update({ is_read: true }).eq('message_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ message: 'Marked as read.' });
});

/* ── USERS (admin) ───────────────────────────────────────────────── */
router.get('/users', requireAdmin, async (_req, res) => {
  const { data: profiles, error } = await supabaseAdmin.from('Profiles')
    .select('id, full_name, phone, created_at, role, is_active').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load users.' });

  const emails = {};
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) return res.status(500).json({ error: 'Unable to load user emails.' });
    data.users.forEach(u => { emails[u.id] = u.email; });
    if (data.users.length < 1000) break;
  }
  return res.json(profiles.map(p => ({ ...p, email: emails[p.id] || '—' })));
});

router.post('/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body ?? {};
  const assignable = ['customer', 'pharmacist', 'administrator'];
  if (!assignable.includes(role)) return res.status(400).json({ error: `Role must be one of: ${assignable.join(', ')}` });
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });

  const { data: target } = await supabaseAdmin.from('Profiles').select('role').eq('id', req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'owner') return res.status(403).json({ error: 'The owner role cannot be changed.' });

  const { error } = await supabaseAdmin.from('Profiles').update({ role }).eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ message: `User role updated to "${role}".` });
});

export default router;
