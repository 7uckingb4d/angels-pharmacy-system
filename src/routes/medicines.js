// GET /api/medicines (public)  GET /api/medicines/categories (public)  GET /api/medicines/:id (public)
// POST / PUT /:id / DELETE /:id  — admin only
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAdmin } from '../middleware/auth-middleware.js';
import { productImageUpload, IMAGE_TYPES } from '../middleware/upload.js';
import { isUuid, parseBoolean, serializeProduct, sendRpcError, diagnoseDbError } from '../lib/helpers.js';
import { audit } from '../lib/audit.js';

const router = Router();
const BUCKET = 'product-images';
const SELECT = '*, Category(category_name)';

async function uploadImage(file) {
  const path = `${randomUUID()}.${IMAGE_TYPES[file.mimetype]}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype, upsert: false, cacheControl: '31536000',
  });
  if (error) throw error;
  return { path, url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

const removeImage = (path) => supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
const storagePathFromUrl = (url) => url?.split(`/${BUCKET}/`)[1] || null;

/* ── LIST (public, active only) ──────────────────────────────────── */
function buildListQuery(select, { search, category, requires_rx, same_day }, byName) {
  let query = supabaseAdmin.from('Product').select(select).eq('is_active', true).order('name');
  if (search) query = query.ilike('name', `%${String(search).replace(/[%,]/g, ' ')}%`);
  if (category && !byName) query = query.eq('category_id', category);
  if (category && byName && select.includes('!inner')) query = query.eq('Category.category_name', category);
  if (requires_rx !== undefined) query = query.eq('requires_rx', requires_rx === 'true');
  if (same_day !== undefined) query = query.eq('same_day', same_day === 'true');
  return query;
}

router.get('/', async (req, res) => {
  const { category } = req.query;
  const byName = Boolean(category && !isUuid(category));

  let { data, error } = await buildListQuery(byName ? '*, Category!inner(category_name)' : SELECT, req.query, byName);

  // If the Product→Category link is unavailable, still show medicines: load both tables and join here.
  if (error && (error.code === 'PGRST200' || /relationship/i.test(error.message || ''))) {
    console.warn('Category join unavailable, falling back to manual join:', error.message);
    const [products, cats] = await Promise.all([
      buildListQuery('*', req.query, false),
      supabaseAdmin.from('Category').select('category_id, category_name'),
    ]);
    error = products.error || cats.error;
    if (!error) {
      const names = new Map((cats.data || []).map(c => [c.category_id, c.category_name]));
      data = products.data
        .map(p => ({ ...p, Category: { category_name: names.get(p.category_id) ?? null } }))
        .filter(p => !byName || p.Category.category_name === category);
    }
  }

  if (error) {
    console.error('Medicines list error:', error, '→', diagnoseDbError(error));
    return res.status(500).json({ error: 'Unable to load medicines.' });
  }
  return res.json(data.map(serializeProduct));
});

/* ── CATEGORIES (public) ─────────────────────────────────────────── */
router.get('/categories', async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('Category').select('category_id, category_name').eq('is_active', true).order('category_name');
  if (error) {
    console.error('Categories error:', error, '→', diagnoseDbError(error));
    return res.status(500).json({ error: 'Unable to load categories.' });
  }
  return res.json(data);
});

/* ── SINGLE (public) ─────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Medicine not found.' });
  const { data, error } = await supabaseAdmin
    .from('Product').select(SELECT).eq('product_id', req.params.id).eq('is_active', true).maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Medicine not found.' });
  return res.json(serializeProduct(data));
});

/* ── CREATE (admin) ──────────────────────────────────────────────── */
router.post('/', requireAdmin, productImageUpload.single('image'), async (req, res) => {
  const { name, brand, category_id, price, requires_rx, dosage_form, same_day, stock_qty, description } = req.body;
  const numericPrice = Number(price);
  const stock = stock_qty === undefined || stock_qty === '' ? 0 : Number(stock_qty);

  if (!req.file) return res.status(400).json({ error: 'A product image is required.' });
  if (!name?.trim() || !isUuid(category_id) || !dosage_form?.trim() ||
      price === undefined || price === '' || !Number.isFinite(numericPrice) || numericPrice < 0 ||
      !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({
      error: 'name, category, dosage form, a non-negative price, and a non-negative stock quantity are required.',
    });
  }

  let image;
  try { image = await uploadImage(req.file); }
  catch (e) { console.error('Image upload failed:', e); return res.status(500).json({ error: 'Image upload failed.' }); }

  const { data, error } = await supabaseAdmin.from('Product').insert({
    category_id,
    name: name.trim(),
    description: description?.trim() || null,
    same_day: same_day === undefined ? true : parseBoolean(same_day),
    requires_rx: parseBoolean(requires_rx),
    brand: brand?.trim() || 'Generic',
    dosage_form: dosage_form.trim(),
    price: numericPrice,
    stock_quantity: stock,
    is_active: true,
    img_path: image.url,
  }).select(SELECT).single();

  if (error) {
    await removeImage(image.path);
    return res.status(400).json({ error: error.message });
  }
  await audit(req, 'product.created', {
    target_type: 'product', target_id: data.product_id,
    details: { name: data.name, price: data.price, stock: data.stock_quantity },
  });
  return res.status(201).json(serializeProduct(data));
});

/* ── UPDATE (admin) ──────────────────────────────────────────────── */
router.put('/:id', requireAdmin, productImageUpload.single('image'), async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return res.status(404).json({ error: 'Medicine not found.' });

  const { name, brand, category_id, price, requires_rx, dosage_form, same_day, stock_qty, description, is_active } = req.body;
  const updates = {};

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty.' });
    updates.name = name.trim();
  }
  if (brand !== undefined) updates.brand = brand.trim() || 'Generic';
  if (category_id !== undefined && category_id !== '') {
    if (!isUuid(category_id)) return res.status(400).json({ error: 'Invalid category.' });
    updates.category_id = category_id;
  }
  if (price !== undefined) {
    const n = Number(price);
    if (price === '' || !Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'price must be a non-negative number.' });
    updates.price = n;
  }
  if (requires_rx !== undefined) updates.requires_rx = parseBoolean(requires_rx);
  if (dosage_form !== undefined && dosage_form.trim()) updates.dosage_form = dosage_form.trim();
  if (same_day !== undefined) updates.same_day = parseBoolean(same_day);
  if (description !== undefined) updates.description = description.trim() || null;
  if (is_active !== undefined) updates.is_active = parseBoolean(is_active);

  let newStock;
  if (stock_qty !== undefined && stock_qty !== '') {
    newStock = Number(stock_qty);
    if (!Number.isInteger(newStock) || newStock < 0) return res.status(400).json({ error: 'stock_qty must be a non-negative integer.' });
  }
  if (!Object.keys(updates).length && !req.file && newStock === undefined) {
    return res.status(400).json({ error: 'No medicine fields were provided.' });
  }

  const { data: existing } = await supabaseAdmin.from('Product').select('img_path').eq('product_id', id).maybeSingle();
  if (!existing) return res.status(404).json({ error: 'Medicine not found.' });

  let image;
  if (req.file) {
    try { image = await uploadImage(req.file); updates.img_path = image.url; }
    catch (e) { console.error('Image upload failed:', e); return res.status(500).json({ error: 'Image upload failed.' }); }
  }

  if (Object.keys(updates).length) {
    const { error } = await supabaseAdmin.from('Product').update(updates).eq('product_id', id);
    if (error) {
      if (image) await removeImage(image.path);
      return res.status(400).json({ error: error.message });
    }
    if (image) { const old = storagePathFromUrl(existing.img_path); if (old) await removeImage(old); }
  }
  if (newStock !== undefined) {
    const { error } = await supabaseAdmin.rpc('adjust_stock', { p_product_id: id, p_new_stock: newStock });
    if (error) return sendRpcError(res, error);
  }

  const { data } = await supabaseAdmin.from('Product').select(SELECT).eq('product_id', id).single();
  await audit(req, 'product.updated', {
    target_type: 'product', target_id: id,
    details: { name: data?.name ?? null, fields: [...Object.keys(updates), ...(newStock !== undefined ? ['stock_quantity'] : [])] },
  });
  return res.json(serializeProduct(data));
});

/* ── DEACTIVATE (admin) ──────────────────────────────────────────── */
router.delete('/:id', requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Medicine not found.' });
  const { data, error } = await supabaseAdmin.from('Product').update({ is_active: false })
    .eq('product_id', req.params.id).select('name').maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  await audit(req, 'product.removed', { target_type: 'product', target_id: req.params.id, details: { name: data?.name ?? null } });
  return res.json({ message: 'Medicine deactivated.' });
});

export default router;
