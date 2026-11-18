// Staff: dashboard.  Pharmacist + admin: products, inventory, sales.  Admin: users, roles, contact inbox.
// Public: POST /api/admin/contacts (contact form)
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireStaff, requirePharmacy, requireAdmin, requirePos } from '../middleware/auth-middleware.js';
import { ROLE_LIST, normalizeRole } from '../lib/roles.js';
import { isUuid, serializeProduct, sendRpcError } from '../lib/helpers.js';

const router = Router();
import { getSettings } from '../lib/settings-store.js';
import { audit, isMissingSchema, V6_MIGRATION } from '../lib/audit.js';

const lowStockLimit = async () => (await getSettings()).low_stock_threshold;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── DASHBOARD ───────────────────────────────────────────────────── */
router.get('/dashboard', requireStaff, async (_req, res) => {
  const LOW_STOCK = await lowStockLimit();
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

/* ── PRODUCTS incl. inactive (staff — counter needs it for the POS) ─ */
router.get('/products', requireStaff, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('Product').select('*, Category(category_name)').order('name');
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load products.' }); }
  return res.json(data.map(serializeProduct));
});

/* ── INVENTORY ───────────────────────────────────────────────────── */
router.get('/inventory', requirePharmacy, async (_req, res) => {
  const LOW_STOCK = await lowStockLimit();
  const { data, error } = await supabaseAdmin.from('Product')
    .select('product_id, name, stock_quantity, price, is_active, Category(category_name)')
    .order('stock_quantity', { ascending: true });
  if (error) return res.status(500).json({ error: 'Unable to load inventory.' });
  return res.json(data.map(p => ({
    ...p,
    category: p.Category?.category_name ?? null,
    threshold: LOW_STOCK,
    is_out: p.stock_quantity <= 0,
    is_low: p.stock_quantity <= LOW_STOCK,
  })));
});

// Recent stock movements (restocks, sales, adjustments, returns).
router.get('/inventory/logs', requirePharmacy, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 200);
  let query = supabaseAdmin.from('InventoryLog')
    .select('log_id, product_id, quantity, previous_stock, new_stock, type, log_date, Product(name)')
    .order('log_date', { ascending: false }).limit(limit);
  if (req.query.type) query = query.eq('type', String(req.query.type));
  const { data, error } = await query;
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load stock history.' }); }
  return res.json(data.map(({ Product, ...l }) => ({ ...l, product_name: Product?.name ?? null })));
});

router.post('/inventory', requireAdmin, async (req, res) => {
  const { product_id, stock_quantity } = req.body ?? {};
  const stock = Number(stock_quantity);
  if (!isUuid(product_id) || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'product_id and a non-negative integer stock_quantity are required.' });
  }
  const { data, error } = await supabaseAdmin.rpc('adjust_stock', { p_product_id: product_id, p_new_stock: stock });
  if (error) return sendRpcError(res, error);
  const { data: product } = await supabaseAdmin.from('Product').select('name').eq('product_id', product_id).maybeSingle();
  await audit(req, data.new_stock > data.previous_stock ? 'product.restocked' : 'product.stock_adjusted', {
    target_type: 'product', target_id: product_id,
    details: { name: product?.name ?? null, previous_stock: data.previous_stock, new_stock: data.new_stock },
  });
  return res.json(data);
});

/* ── CUSTOMERS for the POS (admin + counter) ─────────────────────── */
router.get('/customers', requirePos, async (req, res) => {
  const q = String(req.query.q || '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
  let query = supabaseAdmin.from('Profiles')
    .select('id, full_name, phone, role, is_active')
    .eq('is_active', true).eq('role', 'customer')
    .order('full_name').limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load customers.' }); }
  return res.json(data.map(({ id, full_name, phone }) => ({ id, full_name, phone })));
});

/* ── SALES (completed orders) ────────────────────────────────────── */
router.get('/sales', requirePharmacy, async (req, res) => {
  const { from, to } = req.query;
  let query = supabaseAdmin.from('Order')
    .select('order_id, total_amount, completed_at, OrderItem(quantity, unit_price, Product(name))')
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
  // Login lockout info (5 wrong passwords). Ignored if the v6 migration has not been run yet.
  const locks = {};
  const { data: attempts, error: lockErr } = await supabaseAdmin.from('LoginAttempt')
    .select('email, failed_count, locked_at').gt('failed_count', 0);
  if (!lockErr) attempts.forEach(a => { locks[a.email] = a; });

  return res.json(profiles.map(p => {
    const email = emails[p.id] || '—';
    const lock = locks[String(email).toLowerCase()];
    return {
      ...p, role: normalizeRole(p.role), email,
      failed_logins: lock?.failed_count || 0,
      locked: Boolean(lock?.locked_at),
      locked_at: lock?.locked_at || null,
    };
  }));
});

/* ── CREATE USER (admin) ─────────────────────────────────────────── */
router.post('/users', requireAdmin, async (req, res) => {
  const { full_name, email, phone, password, role = 'customer' } = req.body ?? {};
  const name = String(full_name ?? '').trim();
  const cleanEmail = String(email ?? '').trim().toLowerCase();
  const cleanPhone = String(phone ?? '').trim();
  if (name.length < 2 || name.length > 150) return res.status(400).json({ error: 'Full name must be 2 to 150 characters.' });
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 30)) return res.status(400).json({ error: 'Phone number must be 7 to 30 characters.' });
  if (typeof password !== 'string' || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!ROLE_LIST.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLE_LIST.join(', ')}` });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true, // admin-created accounts can log in right away
    user_metadata: { full_name: name, phone: cleanPhone },
  });
  if (error) {
    console.error('Create user failed:', error);
    if (error.status === 422 || /already (been )?registered|already exists/i.test(error.message || '')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    return res.status(400).json({ error: error.message || 'Unable to create the user.' });
  }

  const userId = data.user.id;
  // The handle_new_user trigger creates the Profiles row; make sure it exists, then set the role.
  const { data: existing } = await supabaseAdmin.from('Profiles').select('id').eq('id', userId).maybeSingle();
  if (!existing) {
    const { error: insertErr } = await supabaseAdmin.from('Profiles').insert({ id: userId, full_name: name, phone: cleanPhone || null });
    if (insertErr) console.error('Profile insert failed:', insertErr);
  }

  let warning = null;
  if (role !== 'customer') {
    const { error: roleErr } = await supabaseAdmin.from('Profiles').update({ role }).eq('id', userId);
    if (roleErr) {
      console.error('Role assignment failed:', roleErr);
      warning = `Account created as Customer — the role could not be set yet. Run ${V6_MIGRATION} in the Supabase SQL Editor, then change the role on this page.`;
    }
  }

  await audit(req, 'user.created', {
    target_type: 'user', target_id: userId,
    details: { email: cleanEmail, name, role: warning ? 'customer' : role },
  });
  return res.status(201).json({ message: 'User created.', id: userId, warning });
});

/* ── UNLOCK ACCOUNT (admin) — after 5 wrong passwords ────────────── */
router.post('/users/:id/unlock', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
  if (error || !data?.user?.email) return res.status(404).json({ error: 'User not found.' });
  const email = data.user.email.toLowerCase();

  const { error: delErr } = await supabaseAdmin.from('LoginAttempt').delete().eq('email', email);
  if (delErr) {
    console.error(delErr);
    return res.status(isMissingSchema(delErr) ? 503 : 500).json({
      error: isMissingSchema(delErr) ? `Run ${V6_MIGRATION} in the Supabase SQL Editor first.` : 'Unable to unlock this account.',
    });
  }
  await audit(req, 'user.unlocked', { target_type: 'user', target_id: req.params.id, details: { email } });
  return res.json({ message: 'Account unlocked. The user can log in again.' });
});

router.post('/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body ?? {};
  if (!ROLE_LIST.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLE_LIST.join(', ')}` });
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });

  const { data: target } = await supabaseAdmin.from('Profiles').select('role').eq('id', req.params.id).maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const { error } = await supabaseAdmin.from('Profiles').update({ role }).eq('id', req.params.id);
  if (error) {
    console.error(error);
    // 22P02 = old enum without "counter"; 23514 = old check constraint.
    if (error.code === '22P02' || error.code === '23514') {
      return res.status(503).json({ error: `The database does not accept the "${role}" role yet. Run ${V6_MIGRATION} in the Supabase SQL Editor (once), then try again.` });
    }
    return res.status(400).json({ error: error.message });
  }
  await audit(req, 'user.role_changed', {
    target_type: 'user', target_id: req.params.id,
    details: { from: normalizeRole(target.role), to: role },
  });
  return res.json({ message: `User role updated to "${role}".` });
});

/* ── AUDIT LOG (admin) ───────────────────────────────────────────── */
const AUDIT_CATEGORIES = ['auth', 'user', 'product', 'prescription', 'order', 'settings'];
router.get('/audit', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const category = String(req.query.category || '');
  const q = String(req.query.q || '').trim().replace(/[%,()]/g, ' ').slice(0, 80);

  let query = supabaseAdmin.from('AuditLog').select('*').order('created_at', { ascending: false }).limit(limit);
  if (AUDIT_CATEGORIES.includes(category)) query = query.like('action', `${category}.%`);
  if (q) query = query.or(`actor_email.ilike.%${q}%,actor_name.ilike.%${q}%,target_id.ilike.%${q}%,action.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error('Audit log error:', error);
    if (isMissingSchema(error)) {
      return res.status(503).json({ error: `The audit log is not set up yet. Run ${V6_MIGRATION} in the Supabase SQL Editor.`, setup: true });
    }
    return res.status(500).json({ error: 'Unable to load the audit log.' });
  }
  return res.json(data);
});

export default router;
