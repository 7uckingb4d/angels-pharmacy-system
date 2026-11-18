-- Role names: admin, pharmacist, counter (+ customer for shoppers).
--   admin      — full access
--   pharmacist — review prescriptions, view products, update order status
--   counter    — update order status only
-- Safe to run more than once. Paste into Supabase → SQL Editor and press Run.
-- The website already treats the old 'owner' / 'administrator' values as admin,
-- but run this so new roles (counter) can be assigned from the Users tab.

/* ── 1. administrator → admin, add counter ───────────────────────── */
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'role_name' AND e.enumlabel = 'administrator')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'role_name' AND e.enumlabel = 'admin') THEN
    ALTER TYPE public.role_name RENAME VALUE 'administrator' TO 'admin';
  END IF;
END $$;

ALTER TYPE public.role_name ADD VALUE IF NOT EXISTS 'counter';

/* ── 2. Merge old owner accounts into admin ──────────────────────── */
UPDATE public."Profiles" SET role = 'admin' WHERE role::text = 'owner';

/* ── 3. Helper functions use the new names ───────────────────────── */
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
    SELECT EXISTS (SELECT 1 FROM public."Profiles" p
                   WHERE p.id = auth.uid() AND p.role::text IN ('admin', 'owner'));
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
    SELECT EXISTS (SELECT 1 FROM public."Profiles" p
                   WHERE p.id = auth.uid() AND p.role::text IN ('admin', 'owner', 'pharmacist', 'counter'));
$function$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_staff() TO service_role;

-- Prescriptions may only be reviewed by a pharmacist or an admin (not counter).
CREATE OR REPLACE FUNCTION public.enforce_prescription_security()
  RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
    IF NEW.status = 'verified' AND NEW.pharmacist_id IS NULL THEN
        RAISE EXCEPTION 'Verified prescriptions must include a reviewer';
    END IF;
    IF NEW.pharmacist_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public."Profiles" p
                       WHERE p.id = NEW.pharmacist_id
                         AND p.role::text IN ('pharmacist', 'admin', 'owner')) THEN
            RAISE EXCEPTION 'Reviewer must be a pharmacist or admin';
        END IF;
    END IF;
    IF NEW.customer_id = NEW.pharmacist_id THEN
        RAISE EXCEPTION 'A prescription cannot be reviewed by the same user who uploaded it';
    END IF;
    RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
