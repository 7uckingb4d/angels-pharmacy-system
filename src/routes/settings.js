// GET /api/settings (public: pharmacy details, hours, contact)   PUT /api/settings (admin)
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAdmin } from '../middleware/auth-middleware.js';
import { cleanSettings } from '../lib/settings.js';
import { getSettings } from '../lib/settings-store.js';

const router = Router();

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(await getSettings());
});

router.put('/', requireAdmin, async (req, res) => {
  const { updates, error } = cleanSettings(req.body);
  if (error) return res.status(400).json({ error });

  const { error: dbError } = await supabaseAdmin.from('Settings').upsert({
    id: 1, ...updates, updated_at: new Date().toISOString(), updated_by: req.user.id,
  });
  if (dbError) {
    console.error('Settings save failed:', dbError);
    const missing = dbError.code === '42P01' || dbError.code === 'PGRST205' || /Settings/.test(dbError.message || '');
    return res.status(missing ? 503 : 500).json({
      error: missing
        ? 'Settings table is missing. Run supabase/migrations/20261118120000_settings.sql in the Supabase SQL Editor, then try again.'
        : 'Unable to save settings. Please try again.',
    });
  }
  return res.json({ message: 'Settings saved.', settings: await getSettings() });
});

export default router;
