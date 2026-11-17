-- Backend fixes: missing columns, contact messages, atomic order/stock functions,
-- storage buckets, and relaxed role guards so staff can verify Rx and run POS sales.

/* ── 1. COLUMNS ─────────────────────────────────────────────────── */
ALTER TABLE public."Order"
  ADD COLUMN IF NOT EXISTS pickup_branch   text,
  ADD COLUMN IF NOT EXISTS notes           text,
  ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES public."Prescription"(prescription_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ready_at        timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at    timestamptz;

ALTER TABLE public."Prescription"
  ADD COLUMN IF NOT EXISTS file_name        text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at      timestamptz;

CREATE INDEX IF NOT EXISTS order_customer_idx      ON public."Order" (customer_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS order_status_idx        ON public."Order" (status, placed_at DESC);
CREATE INDEX IF NOT EXISTS prescription_status_idx ON public."Prescription" (status, uploaded_at);
CREATE INDEX IF NOT EXISTS product_active_name_idx ON public."Product" (is_active, name);

/* ── 2. CONTACT MESSAGES ────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public."ContactMessage" (
  message_id   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    varchar(150) NOT NULL CHECK (btrim(full_name) <> ''),
  email        varchar(254) NOT NULL,
  phone        varchar(30),
  branch       varchar(100),
  message      text         NOT NULL CHECK (btrim(message) <> '' AND length(message) <= 5000),
  is_read      boolean      NOT NULL DEFAULT false,
  submitted_at timestamptz  NOT NULL DEFAULT now()
);
ALTER TABLE public."ContactMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ContactMessage" FROM anon, authenticated;
GRANT ALL ON TABLE public."ContactMessage" TO service_role;

/* ── 3. RELAXED GUARDS ──────────────────────────────────────────── */
-- Orders: any existing profile may own an order (staff ring up POS sales).
CREATE OR REPLACE FUNCTION public.enforce_order_security()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
    IF NEW.customer_id IS NULL THEN
        RAISE EXCEPTION 'Orders require a customer profile';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."Profiles" p WHERE p.id = NEW.customer_id AND p.is_active) THEN
        RAISE EXCEPTION 'Order owner must be an active profile';
    END IF;
    IF NEW.valid_until IS NOT NULL AND NEW.valid_until <= NEW.placed_at THEN
        RAISE EXCEPTION 'valid_until must be later than order_date';
    END IF;
    RETURN NEW;
END;
$function$;

-- Prescriptions: pharmacists, administrators and owners may review.
CREATE OR REPLACE FUNCTION public.enforce_prescription_security()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
    IF NEW.status = 'verified' AND NEW.pharmacist_id IS NULL THEN
        RAISE EXCEPTION 'Verified prescriptions must include a reviewer';
    END IF;
    IF NEW.pharmacist_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public."Profiles" p
                       WHERE p.id = NEW.pharmacist_id AND p.role IN ('pharmacist', 'administrator', 'owner')) THEN
            RAISE EXCEPTION 'Reviewer must be a pharmacist or administrator';
        END IF;
    END IF;
    IF NEW.customer_id = NEW.pharmacist_id THEN
        RAISE EXCEPTION 'A prescription cannot be reviewed by the same user who uploaded it';
    END IF;
    RETURN NEW;
END;
$function$;

/* ── 4. ATOMIC ORDER / STOCK FUNCTIONS (service_role only) ──────── */
CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_id     uuid,
  p_items           jsonb,
  p_pickup_branch   text    DEFAULT NULL,
  p_notes           text    DEFAULT NULL,
  p_prescription_id uuid    DEFAULT NULL,
  p_skip_rx_check   boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_order_id uuid;
  v_line     record;
  v_product  public."Product"%ROWTYPE;
  v_total    numeric(10,2) := 0;
  v_needs_rx boolean := false;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ORDER_EMPTY: no items were provided';
  END IF;

  INSERT INTO public."Order" (customer_id, pickup_branch, notes, prescription_id)
  VALUES (p_customer_id,
          left(nullif(btrim(p_pickup_branch), ''), 100),
          left(nullif(btrim(p_notes), ''), 500),
          p_prescription_id)
  RETURNING order_id INTO v_order_id;

  FOR v_line IN
    SELECT (e ->> 'product_id')::uuid AS product_id, sum((e ->> 'quantity')::int) AS quantity
    FROM jsonb_array_elements(p_items) AS e
    GROUP BY 1
    ORDER BY 1
  LOOP
    IF v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product FROM public."Product" WHERE product_id = v_line.product_id FOR UPDATE;
    IF NOT FOUND OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: product % is unavailable', v_line.product_id;
    END IF;
    IF v_product.stock_quantity < v_line.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % has only % left', v_product.name, v_product.stock_quantity;
    END IF;
    IF v_product.requires_rx THEN v_needs_rx := true; END IF;

    INSERT INTO public."OrderItem" (order_id, product_id, quantity, unit_price)
    VALUES (v_order_id, v_product.product_id, v_line.quantity, v_product.price);

    UPDATE public."Product" SET stock_quantity = stock_quantity - v_line.quantity
    WHERE product_id = v_product.product_id;

    INSERT INTO public."InventoryLog" (product_id, quantity, previous_stock, new_stock, type)
    VALUES (v_product.product_id, -v_line.quantity, v_product.stock_quantity,
            v_product.stock_quantity - v_line.quantity, 'sale');

    v_total := v_total + v_product.price * v_line.quantity;
  END LOOP;

  IF v_needs_rx AND NOT p_skip_rx_check THEN
    IF p_prescription_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public."Prescription"
      WHERE prescription_id = p_prescription_id AND customer_id = p_customer_id AND status = 'verified'
    ) THEN
      RAISE EXCEPTION 'RX_REQUIRED: a verified prescription is required for Rx medicines';
    END IF;
  END IF;

  UPDATE public."Order" SET total_amount = v_total WHERE order_id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'total_amount', v_total, 'status', 'pending');
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_order_status(p_order_id uuid, p_status public.order_status)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_old  public.order_status;
  v_item record;
  v_prev integer;
  v_row  jsonb;
BEGIN
  SELECT status INTO v_old FROM public."Order" WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: order % does not exist', p_order_id;
  END IF;
  IF v_old IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'ORDER_FINAL: order is already %', v_old;
  END IF;

  IF p_status = 'cancelled' THEN
    FOR v_item IN
      SELECT product_id, quantity FROM public."OrderItem" WHERE order_id = p_order_id ORDER BY product_id
    LOOP
      SELECT stock_quantity INTO v_prev FROM public."Product" WHERE product_id = v_item.product_id FOR UPDATE;
      UPDATE public."Product" SET stock_quantity = stock_quantity + v_item.quantity
      WHERE product_id = v_item.product_id;
      INSERT INTO public."InventoryLog" (product_id, quantity, previous_stock, new_stock, type)
      VALUES (v_item.product_id, v_item.quantity, v_prev, v_prev + v_item.quantity, 'return');
    END LOOP;
  END IF;

  UPDATE public."Order" AS o
  SET status       = p_status,
      ready_at     = CASE WHEN p_status = 'ready'     THEN now() ELSE ready_at END,
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END
  WHERE o.order_id = p_order_id
  RETURNING to_jsonb(o) INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_new_stock integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_prev integer;
BEGIN
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: stock must be zero or more';
  END IF;
  SELECT stock_quantity INTO v_prev FROM public."Product" WHERE product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: product % does not exist', p_product_id;
  END IF;
  IF v_prev <> p_new_stock THEN
    UPDATE public."Product" SET stock_quantity = p_new_stock WHERE product_id = p_product_id;
    INSERT INTO public."InventoryLog" (product_id, quantity, previous_stock, new_stock, type)
    VALUES (p_product_id, p_new_stock - v_prev, v_prev, p_new_stock,
            (CASE WHEN p_new_stock > v_prev THEN 'restock' ELSE 'adjustment' END)::public.inventory_status);
  END IF;
  RETURN jsonb_build_object('product_id', p_product_id, 'previous_stock', v_prev, 'new_stock', p_new_stock);
END;
$function$;

REVOKE ALL ON FUNCTION public.place_order(uuid, jsonb, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_status(uuid, public.order_status)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, integer)                         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, public.order_status)      TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, integer)                         TO service_role;

/* ── 5. STORAGE BUCKETS ─────────────────────────────────────────── */
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('product-images', 'product-images', true,  4194304,
   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']),
  ('prescriptions',  'prescriptions',  false, 4194304,
   ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

/* ── 6. STARTER CATEGORIES (so the admin product form is usable) ── */
INSERT INTO public."Category" (category_name) VALUES
  ('Pain Relief'), ('Antibiotics'), ('Vitamins & Supplements'), ('Cardiovascular'),
  ('Cough & Cold'), ('Gastrointestinal'), ('Diabetes'), ('Personal Care')
ON CONFLICT (category_name) DO NOTHING;
