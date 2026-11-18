-- v6 — tester fixes. Safe to run more than once.
-- Paste into Supabase → SQL Editor and press Run (or `npx supabase db push`).
--   1. Roles are saved as text, so "Counter" (and every role) can be assigned from the Users page.
--   2. Login lockout: 5 wrong passwords lock the account until an admin unlocks it.
--   3. Audit log (Admin → Settings → Audit Log).
--   4. Order numbers (ORD-10492), pick-up only orders, counter payments with change (FT-10 to FT-12).

/* ── 1. ROLES AS TEXT ─────────────────────────────────────────────── */
-- The old enum could not store 'counter' unless an earlier migration ran first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Profiles'
               AND column_name = 'role' AND data_type = 'USER-DEFINED') THEN
    ALTER TABLE public."Profiles" ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public."Profiles" ALTER COLUMN role TYPE text USING (
      CASE role::text WHEN 'owner' THEN 'admin' WHEN 'administrator' THEN 'admin' ELSE role::text END);
  END IF;
END $$;

UPDATE public."Profiles" SET role = 'admin' WHERE role IN ('owner', 'administrator');
UPDATE public."Profiles" SET role = 'customer' WHERE role IS NULL OR role NOT IN ('admin', 'pharmacist', 'counter', 'customer');
ALTER TABLE public."Profiles" ALTER COLUMN role SET DEFAULT 'customer';
ALTER TABLE public."Profiles" ALTER COLUMN role SET NOT NULL;
ALTER TABLE public."Profiles" DROP CONSTRAINT IF EXISTS "Profiles_role_check";
ALTER TABLE public."Profiles" ADD CONSTRAINT "Profiles_role_check"
  CHECK (role IN ('admin', 'pharmacist', 'counter', 'customer'));

DROP FUNCTION IF EXISTS public.user_has_role(public.role_name);
CREATE OR REPLACE FUNCTION public.user_has_role(required_role text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
    SELECT EXISTS (SELECT 1 FROM public."Profiles" p WHERE p.id = auth.uid() AND p.role = required_role);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
    SELECT EXISTS (SELECT 1 FROM public."Profiles" p WHERE p.id = auth.uid() AND p.role = 'admin');
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
    SELECT EXISTS (SELECT 1 FROM public."Profiles" p
                   WHERE p.id = auth.uid() AND p.role IN ('admin', 'pharmacist', 'counter'));
$function$;

CREATE OR REPLACE FUNCTION public.enforce_prescription_security()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
    IF NEW.status = 'verified' AND NEW.pharmacist_id IS NULL THEN
        RAISE EXCEPTION 'Verified prescriptions must include a reviewer';
    END IF;
    IF NEW.pharmacist_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public."Profiles" p
                       WHERE p.id = NEW.pharmacist_id AND p.role IN ('pharmacist', 'admin')) THEN
            RAISE EXCEPTION 'Reviewer must be a pharmacist or admin';
        END IF;
    END IF;
    IF NEW.customer_id = NEW.pharmacist_id THEN
        RAISE EXCEPTION 'A prescription cannot be reviewed by the same user who uploaded it';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.user_has_role(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO service_role;

/* ── 2. LOGIN LOCKOUT ─────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public."LoginAttempt" (
  email          text        PRIMARY KEY,
  failed_count   integer     NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_at      timestamptz,
  last_failed_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public."LoginAttempt" TO service_role;
ALTER TABLE public."LoginAttempt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."LoginAttempt" FROM anon, authenticated;

-- Adds one failed try; locks the account when it reaches p_max. Atomic (safe with parallel logins).
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email text, p_max integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_row public."LoginAttempt"%ROWTYPE;
BEGIN
  INSERT INTO public."LoginAttempt" AS la (email, failed_count, last_failed_at, updated_at)
  VALUES (lower(btrim(p_email)), 1, now(), now())
  ON CONFLICT (email) DO UPDATE
    SET failed_count = la.failed_count + 1, last_failed_at = now(), updated_at = now()
  RETURNING * INTO v_row;

  IF v_row.failed_count >= p_max AND v_row.locked_at IS NULL THEN
    UPDATE public."LoginAttempt" SET locked_at = now() WHERE email = v_row.email RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('failed_count', v_row.failed_count, 'locked', v_row.locked_at IS NOT NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_login_failure(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text, integer) TO service_role;

/* ── 3. AUDIT LOG ─────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public."AuditLog" (
  log_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_email text,
  actor_name  text,
  actor_role  text,
  action      text        NOT NULL CHECK (btrim(action) <> ''),
  target_type text,
  target_id   text,
  details     jsonb,
  ip          text
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON public."AuditLog" (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx  ON public."AuditLog" (action, created_at DESC);
GRANT ALL ON public."AuditLog" TO service_role;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."AuditLog" FROM anon, authenticated;

/* ── 4. ORDERS: ORDER NUMBER + PICK-UP ONLY ───────────────────────── */
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 10001;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

ALTER TABLE public."Order" ADD COLUMN IF NOT EXISTS order_number bigint;
ALTER TABLE public."Order" ALTER COLUMN order_number SET DEFAULT nextval('public.order_number_seq');
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT order_id FROM public."Order" WHERE order_number IS NULL ORDER BY placed_at LOOP
    UPDATE public."Order" SET order_number = nextval('public.order_number_seq') WHERE order_id = r.order_id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS order_number_key ON public."Order" (order_number);

-- No delivery: every order is collected in-store.
ALTER TABLE public."Order" ADD COLUMN IF NOT EXISTS fulfillment text NOT NULL DEFAULT 'pickup';
ALTER TABLE public."Order" DROP CONSTRAINT IF EXISTS "Order_fulfillment_check";
ALTER TABLE public."Order" ADD CONSTRAINT "Order_fulfillment_check" CHECK (fulfillment = 'pickup');

/* ── 5. COUNTER PAYMENTS (cash with change, GCash) ────────────────── */
ALTER TABLE public."Payment"
  ADD COLUMN IF NOT EXISTS method          text,
  ADD COLUMN IF NOT EXISTS amount_tendered numeric(10,2),
  ADD COLUMN IF NOT EXISTS change_due      numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_at         timestamptz,
  ADD COLUMN IF NOT EXISTS recorded_by     uuid REFERENCES public."Profiles"(id) ON DELETE SET NULL;
ALTER TABLE public."Payment" DROP CONSTRAINT IF EXISTS "Payment_method_check";
ALTER TABLE public."Payment" ADD CONSTRAINT "Payment_method_check"
  CHECK (method IS NULL OR method IN ('cash', 'gcash'));
CREATE UNIQUE INDEX IF NOT EXISTS payment_one_paid_per_order ON public."Payment" (order_id) WHERE status = 'paid';

CREATE OR REPLACE FUNCTION public.record_payment(
  p_order_id  uuid,
  p_method    text,
  p_tendered  numeric,
  p_reference text DEFAULT NULL,
  p_staff_id  uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_order  public."Order"%ROWTYPE;
  v_paid   numeric(10,2);
  v_change numeric(10,2);
  v_row    public."Payment"%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public."Order" WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: order % does not exist', p_order_id;
  END IF;
  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'ORDER_FINAL: order is cancelled';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Payment" WHERE order_id = p_order_id AND status = 'paid') THEN
    RAISE EXCEPTION 'ALREADY_PAID: this order is already paid';
  END IF;
  IF p_method NOT IN ('cash', 'gcash') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT: choose cash or gcash';
  END IF;

  IF p_method = 'cash' THEN
    IF p_tendered IS NULL OR p_tendered < v_order.total_amount THEN
      RAISE EXCEPTION 'TENDER_SHORT: Tendered amount is less than the total due.';
    END IF;
    v_paid := p_tendered;
    v_change := p_tendered - v_order.total_amount;
  ELSE
    IF p_reference IS NULL OR length(btrim(p_reference)) < 4 THEN
      RAISE EXCEPTION 'INVALID_PAYMENT: enter the GCash reference number';
    END IF;
    v_paid := v_order.total_amount;
    v_change := 0;
  END IF;

  INSERT INTO public."Payment" (order_id, amount, status, method, amount_tendered, change_due,
                                paid_at, claim_date, reference_number, recorded_by)
  VALUES (p_order_id, v_order.total_amount, 'paid', p_method, v_paid, v_change,
          now(), now(), nullif(btrim(coalesce(p_reference, '')), ''), p_staff_id)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'payment_id', v_row.payment_id, 'order_id', p_order_id, 'order_number', v_order.order_number,
    'method', v_row.method, 'total', v_order.total_amount, 'amount_tendered', v_row.amount_tendered,
    'change_due', v_row.change_due, 'paid_at', v_row.paid_at, 'reference_number', v_row.reference_number);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_payment(uuid, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, text, numeric, text, uuid) TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

NOTIFY pgrst, 'reload schema';
