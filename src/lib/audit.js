// Audit trail: who did what and when. Shown to admins in Admin → Settings → Audit Log.
// Writing a log line must never break the action itself, so errors are only logged to the console.
import { supabaseAdmin } from '../config/supabase.js';

export const V6_MIGRATION = 'supabase/migrations/20261118180000_v6_audit_lockout_payments.sql';

export async function audit(req, action, { target_type = null, target_id = null, details = null, actor = null } = {}) {
  try {
    const who = actor || {
      id: req?.user?.id ?? null,
      email: req?.user?.email ?? null,
      role: req?.profile?.role ?? null,
      name: req?.profile?.full_name ?? null,
    };
    const { error } = await supabaseAdmin.from('AuditLog').insert({
      actor_id: who.id || null,
      actor_email: who.email ? String(who.email).slice(0, 254) : null,
      actor_name: who.name ? String(who.name).slice(0, 150) : null,
      actor_role: who.role || null,
      action,
      target_type,
      target_id: target_id == null ? null : String(target_id).slice(0, 100),
      details,
      ip: req?.ip ? String(req.ip).slice(0, 64) : null,
    });
    if (error) console.warn(`Audit log skipped (${action}):`, error.message, `— run ${V6_MIGRATION}`);
  } catch (e) {
    console.warn(`Audit log skipped (${action}):`, e?.message || e);
  }
}

// True when Supabase says a table/column/function from the v6 migration does not exist yet.
export function isMissingSchema(error) {
  const code = error?.code || '';
  return ['42P01', '42703', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code) ||
    /does not exist|could not find/i.test(error?.message || '');
}
