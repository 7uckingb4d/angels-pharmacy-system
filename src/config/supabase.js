// Supabase clients.
//   supabaseAdmin — secret/service-role key, bypasses RLS. Server-side only.
//   createAnonClient() — fresh publishable-key client per auth call (no shared session state).
import { createClient } from '@supabase/supabase-js';

// Values pasted into Vercel often carry stray quotes, spaces, newlines or a trailing
// "/rest/v1" — any of these makes every database call fail, so clean them up first.
const clean = (v) => (v || '').trim().replace(/^['"]|['"]$/g, '').trim();
const cleanUrl = (v) => clean(v).replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

const SUPABASE_URL = cleanUrl(process.env.SUPABASE_URL);
const PUBLISHABLE = clean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY);
const SECRET = clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

// What kind of key was supplied (never the key itself) — used by /api/health.
export function describeKey(key) {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return `legacy-${payload.role || 'unknown'}`; // legacy-service_role / legacy-anon
    } catch { /* fall through */ }
  }
  return 'unrecognized';
}

export const config = {
  url: SUPABASE_URL,
  urlLooksValid: /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SUPABASE_URL),
  secretKind: describeKey(SECRET),
  publishableKind: describeKey(PUBLISHABLE),
};

if (!SUPABASE_URL || !PUBLISHABLE || !SECRET) {
  throw new Error(
    'Missing Supabase env vars: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY.'
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function createAnonClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
