// routes/medicines.js
// GET  /api/medicines          — list all active medicines (public)
// GET  /api/medicines/:id      — single medicine detail (public)
// POST /api/medicines          — create medicine (admin only)
// PUT  /api/medicines/:id      — update medicine (admin only)
// DEL  /api/medicines/:id      — deactivate medicine (admin only)

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAdmin } from '../middleware/auth-middleware.js';
import { uploadProductImage } from '../middleware/product-upload.js';

const router = Router();

async function removeUploadedImage(file) {
    if (!file) return;
    try {
        await unlink(file.path);
    } catch (error) {
        console.error('Unable to remove unreferenced product image:', error);
    }
}

function parseBoolean(value) {
    return value === true || value === 'true';
}

function assignProductId(req, _res, next) {
    req.product_id = randomUUID();
    next();
}

/* ── LIST ────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
    const { search, category, requires_rx, same_day } = req.query;

    let query = supabaseAdmin
        .from('Product')
        .select('*, Category ( category_name ) ')
        .eq('is_active', true)
        .order('name');

    if (search) query = query.ilike('name', `%${search}%`);
    if (category) query = query.eq('category', category);
    if (requires_rx !== undefined) query = query.eq('requires_rx', requires_rx === 'true');
    if (same_day !== undefined) query = query.eq('same_day', same_day === 'true');

    const { data, error } = await query;
    if (error) {
        console.error('Medicines error:', error);
        return res.status(500).json({ error: error.message });
    }
    return res.json(data);
});

/* ── SINGLE ──────────────────────────────────────────────────────── */
router.get('/:id', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('Product')
        .select('*')
        .eq('product_id', req.params.id)
        .eq('is_active', true)
        .single();

    if (error) return res.status(404).json({ error: 'Medicine not found.' });
    return res.json(data);
});

/* ── CREATE (admin) ──────────────────────────────────────────────── */
router.post('/', requireAdmin, assignProductId, uploadProductImage, async (req, res) => {
    const { product_id } = req;
    const { name, brand, category_id, price, requires_rx, dosage_form,
        same_day, stock_qty, description } = req.body;
    const numericPrice = Number(price);
    const stockQuantity = stock_qty === undefined || stock_qty === '' ? 0 : Number(stock_qty);

    if (!req.file) {
        return res.status(400).json({ error: 'A product image is required.' });
    }
    if (!name || !category_id || !dosage_form || price === undefined || price === '' ||
        !Number.isFinite(numericPrice) || numericPrice < 0 ||
        !Number.isInteger(stockQuantity) || stockQuantity < 0) {
        await removeUploadedImage(req.file);
        return res.status(400).json({
            error: 'name, category_id, dosage_form, a non-negative price, and a non-negative stock quantity are required.',
        });
    }

    const { data, error } = await supabaseAdmin
        .from('Product')
        .insert({
            product_id: product_id,
            category_id: category_id,
            name: name,
            description: description || null,
            same_day: parseBoolean(same_day),
            requires_rx: parseBoolean(requires_rx),
            brand: brand || 'Generic',
            dosage_form,
            price: numericPrice,
            stock_quantity: stockQuantity,
            is_active: true,
            img_path: `/uploads/previews/${req.file.filename}`,
        })
        .select()
        .single();

    if (error) {
        await removeUploadedImage(req.file);
        return res.status(400).json({ error: error.message });
    }
    return res.status(201).json(data);
});

/* ── UPDATE (admin) ──────────────────────────────────────────────── */
router.put('/:id', requireAdmin, uploadProductImage, async (req, res) => {
    const { name, brand, category_id, price, requires_rx, dosage_form,
        same_day, stock_qty, description, is_active } = req.body;
    const updates = {};

    if (name !== undefined) updates.name = name;
    if (brand !== undefined) updates.brand = brand;
    if (category_id !== undefined) updates.category_id = category_id;
    if (price !== undefined) {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice < 0) {
            await removeUploadedImage(req.file);
            return res.status(400).json({ error: 'price must be a non-negative number.' });
        }
        updates.price = numericPrice;
    }
    if (requires_rx !== undefined) updates.requires_rx = parseBoolean(requires_rx);
    if (dosage_form !== undefined) updates.dosage_form = dosage_form;
    if (same_day !== undefined) updates.same_day = parseBoolean(same_day);
    if (stock_qty !== undefined && stock_qty !== '') {
        const stockQuantity = Number(stock_qty);
        if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
            await removeUploadedImage(req.file);
            return res.status(400).json({ error: 'stock_qty must be a non-negative integer.' });
        }
        updates.stock_quantity = stockQuantity;
    }
    if (description !== undefined) updates.description = description || null;
    if (is_active !== undefined) updates.is_active = parseBoolean(is_active);
    if (req.file) updates.img_path = `/uploads/previews/${req.file.filename}`;
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No medicine fields were provided.' });
    }

    const { data, error } = await supabaseAdmin
        .from('Product')
        .update(updates)
        .eq('product_id', req.params.id)
        .select()
        .single();

    if (error) {
        await removeUploadedImage(req.file);
        return res.status(400).json({ error: error.message });
    }
    return res.json(data);
});

/* ── DEACTIVATE (admin) ──────────────────────────────────────────── */
router.delete('/:id', requireAdmin, async (req, res) => {
    const { error } = await supabaseAdmin
        .from('Product')
        .update({ is_active: false })
        .eq('product_id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ message: 'Medicine deactivated.' });
});

export default router;
