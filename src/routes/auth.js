// POST /api/auth/signup | login | refresh | logout   GET/PATCH /api/auth/me
import { Router } from 'express';
import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth-middleware.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res) => {
  const { full_name, email, phone, password } = req.body ?? {};
  if (!full_name?.trim() || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password are required.' });
  }
  if (!EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const cleanPhone = phone?.trim() || '';
  if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 30)) {
    return res.status(400).json({ error: 'Phone number must be 7 to 30 characters.' });
  }

  const { data, error } = await createAnonClient().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: full_name.trim(), phone: cleanPhone } },
  });
  if (error) return res.status(400).json({ error: error.message });

  // Profiles row is created by the handle_new_user trigger.
  return res.status(201).json({
    message: data.session
      ? 'Account created.'
      : 'Account created. Please check your email to confirm your address.',
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const { data, error } = await createAnonClient().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return res.status(401).json({ error: error.message });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('Profiles').select('full_name, phone, role, is_active').eq('id', data.user.id).single();
  if (profileError || !profile) {
    console.error('Login profile lookup failed:', profileError);
    return res.status(500).json({ error: 'Unable to load your profile.' });
  }
  if (!profile.is_active) return res.status(403).json({ error: 'This account has been deactivated.' });

  const { is_active, ...details } = profile;
  return res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email, ...details },
  });
});

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body ?? {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required.' });

  const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token });
  if (error || !data.session) return res.status(401).json({ error: error?.message || 'Session expired.' });

  return res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  await supabaseAdmin.auth.admin.signOut(req.accessToken).catch(() => {});
  return res.json({ message: 'Logged out successfully.' });
});

router.get('/me', requireAuth, (req, res) => {
  const { full_name, phone, role } = req.profile;
  return res.json({ id: req.user.id, uuid: req.user.id, email: req.user.email, full_name, phone, role });
});

router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, phone } = req.body ?? {};
  const updates = {};
  if (full_name?.trim()) updates.full_name = full_name.trim().slice(0, 150);
  if (phone?.trim()) {
    if (phone.trim().length < 7 || phone.trim().length > 30) {
      return res.status(400).json({ error: 'Phone number must be 7 to 30 characters.' });
    }
    updates.phone = phone.trim();
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update.' });

  const { error } = await supabaseAdmin.from('Profiles').update(updates).eq('id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  return res.json({ message: 'Profile updated.' });
});

export default router;
