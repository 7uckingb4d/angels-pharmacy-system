const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
export const parseBoolean = (v) => v === true || v === 'true';

// Product row (+ joined Category) -> API shape. Legacy aliases keep the existing frontend working.
export function serializeProduct(p) {
  const { Category, ...rest } = p;
  return {
    ...rest,
    medicine_id: p.product_id,
    unit_price: p.price,
    same_day_available: p.same_day,
    category: Category?.category_name ?? null,
    image_url: p.img_path,
    stock_qty: p.stock_quantity,
  };
}

// Postgres function errors look like "CODE: message"; map them to HTTP responses.
const RPC_STATUS = {
  ORDER_EMPTY: 400, INVALID_QUANTITY: 400, PRODUCT_UNAVAILABLE: 400, INSUFFICIENT_STOCK: 409,
  RX_REQUIRED: 403, ORDER_NOT_FOUND: 404, PRODUCT_NOT_FOUND: 404, ORDER_FINAL: 409,
  TENDER_SHORT: 400, INVALID_PAYMENT: 400, ALREADY_PAID: 409,
};
export function sendRpcError(res, error) {
  const code = /^([A-Z_]+):/.exec(error?.message || '')?.[1];
  if (code && RPC_STATUS[code]) {
    return res.status(RPC_STATUS[code]).json({ error: error.message.replace(/^[A-Z_]+:\s*/, ''), code });
  }
  if (error?.code === 'PGRST202' || /could not find the function/i.test(error?.message || '')) {
    return res.status(503).json({
      error: 'This feature needs the latest database update. Run supabase/migrations/20261118180000_v6_audit_lockout_payments.sql in the Supabase SQL Editor.',
    });
  }
  console.error('RPC error:', error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

// Turns a Supabase/Postgres error into a plain-English fix (no secrets included).
export function diagnoseDbError(error) {
  const code = error?.code || '';
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (/legacy api keys are disabled/i.test(msg)) {
    return 'Legacy API keys are disabled in Supabase. Put the new sb_secret_… and sb_publishable_… keys in Vercel, then redeploy.';
  }
  if (/invalid api key|no api key|jwt|unauthorized/i.test(msg) || code === 'PGRST301' || code === '401') {
    return 'SUPABASE_SECRET_KEY is wrong. Copy the secret (or service_role) key from Supabase → Project Settings → API Keys into Vercel, then redeploy.';
  }
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) {
    return 'Database tables are missing. Run every file in supabase/migrations (oldest first) in the Supabase SQL editor, or `npx supabase db push`.';
  }
  if (code === '42501' || /permission denied/i.test(msg)) {
    return 'Permission denied. Run supabase/migrations/20261117120000_permissions_repair.sql in the Supabase SQL editor.';
  }
  if (code === 'PGRST200' || /relationship/i.test(msg)) {
    return 'Product → Category link is missing. Run supabase/migrations/20261117120000_permissions_repair.sql.';
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|network/i.test(msg)) {
    return 'Cannot reach SUPABASE_URL. It should look like https://<project-ref>.supabase.co (no /rest/v1). Also check the project is not paused.';
  }
  return 'Unexpected database error — check the Vercel function logs.';
}
