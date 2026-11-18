-- Pharmacy settings (one row). Edited by admins in Admin → Settings.
-- Safe to run more than once. Paste into Supabase → SQL Editor and press Run.
CREATE TABLE IF NOT EXISTS public."Settings" (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pharmacy_name       text    NOT NULL DEFAULT 'Angel''s Pharmacy',
  license_no          text    NOT NULL DEFAULT 'PH-123456',
  location            text    NOT NULL DEFAULT 'Valenzuela City',
  regulatory_body     text    NOT NULL DEFAULT 'Department of Health (DOH), Philippines',
  contact_email       text    NOT NULL DEFAULT 'caronanmj4@gmail.com',
  contact_phone       text    NOT NULL DEFAULT '09563868022',
  hours_weekday       text    NOT NULL DEFAULT '8:00 AM – 6:00 PM',
  hours_saturday      text    NOT NULL DEFAULT '8:00 AM – 12:00 PM',
  hours_sunday        text    NOT NULL DEFAULT 'Closed',
  low_stock_threshold integer NOT NULL DEFAULT 10 CHECK (low_stock_threshold BETWEEN 0 AND 1000),
  accepting_orders    boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Only the server (secret key) reads/writes this table; the browser goes through /api/settings.
GRANT ALL ON public."Settings" TO service_role;
ALTER TABLE public."Settings" ENABLE ROW LEVEL SECURITY;

INSERT INTO public."Settings" (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
