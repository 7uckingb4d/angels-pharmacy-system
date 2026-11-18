// POST /api/auth/signup | login | refresh | logout   GET/PATCH /api/auth/me
import { Router } from 'express';
import { createAnonClient, supabaseAdmin } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import { normalizeRole } from '../lib/roles.js';
import { MAX_LOGIN_ATTEMPTS, LOCKED_MESSAGE, isWrongPassword, wrongPasswordMessage } from '../lib/lockout.js';
import { audit } from '../lib/audit.js';

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
  await audit(req, 'auth.signup', {
    actor: { id: data.user?.id, email: data.user?.email, role: 'customer', name: full_name.trim() },
    target_type: 'account', target_id: data.user?.id,
  });
  return res.status(201).json({
    message: data.session
      ? 'Account created.'
      : 'Account created. Please check your email to confirm your address.',
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
  });
});

/* ── Login lockout helpers (table: LoginAttempt — see the v6 migration) ── */
async function getLoginLock(email) {
  const { data, error } = await supabaseAdmin.from('LoginAttempt')
    .select('failed_count, locked_at').eq('email', email).maybeSingle();
  if (error) { console.warn('Login lockout check skipped:', error.message); return null; }
  return data;
}
async function recordLoginFailure(email) {
  const { data, error } = await supabaseAdmin.rpc('record_login_failure', { p_email: email, p_max: MAX_LOGIN_ATTEMPTS });
  if (error) { console.warn('Login lockout not recorded:', error.message); return null; }
  return data; // { failed_count, locked }
}
async function clearLoginFailures(email) {
  const { error } = await supabaseAdmin.from('LoginAttempt').delete().eq('email', email);
  if (error) console.warn('Login lockout reset skipped:', error.message);
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const who = { email: cleanEmail };

  // Locked accounts stay locked until an admin unlocks them (Admin → Users → Unlock).
  const lock = await getLoginLock(cleanEmail);
  if (lock?.locked_at) {
    await audit(req, 'auth.login_blocked', { actor: who, target_type: 'account', target_id: cleanEmail });
    return res.status(423).json({ error: LOCKED_MESSAGE, locked: true });
  }

  const { data, error } = await createAnonClient().auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) {
    if (!isWrongPassword(error)) return res.status(401).json({ error: error.message });
    const result = await recordLoginFailure(cleanEmail);
    if (result?.locked) {
      await audit(req, 'auth.account_locked', {
        actor: who, target_type: 'account', target_id: cleanEmail, details: { failed_attempts: result.failed_count },
      });
      return res.status(423).json({ error: LOCKED_MESSAGE, locked: true });
    }
    await audit(req, 'auth.login_failed', {
      actor: who, target_type: 'account', target_id: cleanEmail, details: { failed_attempts: result?.failed_count ?? null },
    });
    return res.status(401).json({
      error: wrongPasswordMessage(result ? result.failed_count : null),
      attempts_left: result ? Math.max(0, MAX_LOGIN_ATTEMPTS - result.failed_count) : null,
    });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('Profiles').select('full_name, phone, role, is_active').eq('id', data.user.id).single();
  if (profileError || !profile) {
    console.error('Login profile lookup failed:', profileError);
    return res.status(500).json({ error: 'Unable to load your profile.' });
  }
  if (!profile.is_active) return res.status(403).json({ error: 'This account has been deactivated.' });

  if (lock?.failed_count) await clearLoginFailures(cleanEmail);
  const role = normalizeRole(profile.role);
  await audit(req, 'auth.login', {
    actor: { id: data.user.id, email: data.user.email, role, name: profile.full_name },
    target_type: 'account', target_id: data.user.id,
  });

  const { is_active, ...details } = profile;
  return res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: { id: data.user.id, email: data.user.email, ...details, role },
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
  await audit(req, 'auth.logout', { target_type: 'account', target_id: req.user.id });
  return res.json({ message: 'Logged out successfully.' });
});

router.post('/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body ?? {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Enter your current password and a new password.' });
  }
  if (String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  if (new_password === current_password) return res.status(400).json({ error: 'New password must be different.' });

  const { error: checkError } = await createAnonClient().auth.signInWithPassword({
    email: req.user.email, password: current_password,
  });
  if (checkError) return res.status(400).json({ error: 'Current password is incorrect.' });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: new_password });
  if (error) return res.status(400).json({ error: error.message });
  await audit(req, 'auth.password_changed', { target_type: 'account', target_id: req.user.id });
  return res.json({ message: 'Password changed.' });
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
