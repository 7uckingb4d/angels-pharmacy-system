// Verifies the Supabase JWT from the Authorization header and loads the user's profile.
import { supabaseAdmin } from '../config/supabase.js';
import { ADMIN_ROLES, PHARMACY_ROLES, STAFF_ROLES, POS_ROLES, normalizeRole } from '../lib/roles.js';

export { ADMIN_ROLES, PHARMACY_ROLES, STAFF_ROLES, POS_ROLES };

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }
  const token = header.slice(7);

  const { data: { user } = {}, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('Profiles').select('*').eq('id', user.id).single();
  if (profileError || !profile) {
    console.error('Profile lookup failed:', profileError);
    return res.status(500).json({ error: 'Unable to load your profile.' });
  }
  if (profile.is_active === false) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  req.user = user;
  req.profile = { ...profile, role: normalizeRole(profile.role) };
  req.accessToken = token;
  next();
}

const requireRole = (roles, message) => [
  requireAuth,
  (req, res, next) => roles.includes(req.profile.role)
    ? next()
    : res.status(403).json({ error: message }),
];

// admin + pharmacist + counter
export const requireStaff = requireRole(STAFF_ROLES, 'Staff access required.');
// admin + pharmacist
export const requirePharmacy = requireRole(PHARMACY_ROLES, 'Pharmacist or admin access required.');
// admin only
export const requireAdmin = requireRole(ADMIN_ROLES, 'Admin only. Ask an admin to do this.');

// admin + counter (POS checkout)
export const requirePos = requireRole(POS_ROLES, 'Admin or counter access required.');
