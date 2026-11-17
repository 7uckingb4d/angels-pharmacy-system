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
};
export function sendRpcError(res, error) {
  const code = /^([A-Z_]+):/.exec(error?.message || '')?.[1];
  if (code && RPC_STATUS[code]) {
    return res.status(RPC_STATUS[code]).json({ error: error.message.replace(/^[A-Z_]+:\s*/, '') });
  }
  console.error('RPC error:', error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
