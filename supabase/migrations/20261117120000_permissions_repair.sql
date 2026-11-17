-- Permissions repair + starter medicines.
-- Safe to run more than once. Fixes "Unable to load medicines" when the server key
-- cannot read the tables (missing grants) or the Product → Category link is missing.
-- Paste into Supabase → SQL Editor and press Run, or `npx supabase db push`.

/* ── 1. SERVER (service_role) CAN READ/WRITE EVERYTHING IN public ── */
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Public catalog tables stay readable (RLS still limits rows to active ones).
GRANT SELECT ON public."Category", public."Product" TO anon, authenticated;

/* ── 2. PRODUCT → CATEGORY LINK (needed for the catalog join) ───── */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_category_id_fkey') THEN
    ALTER TABLE public."Product"
      ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY (category_id)
      REFERENCES public."Category"(category_id) ON DELETE RESTRICT;
  END IF;
END $$;

/* ── 3. STARTER CATEGORIES + MEDICINES (only when the catalog is empty) ── */
INSERT INTO public."Category" (category_name) VALUES
  ('Pain Relief'), ('Antibiotics'), ('Vitamins & Supplements'), ('Cardiovascular'),
  ('Cough & Cold'), ('Gastrointestinal'), ('Diabetes'), ('Personal Care')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO public."Product"
  (category_id, name, description, same_day, requires_rx, brand, dosage_form, price, stock_quantity, img_path)
SELECT c.category_id, v.name, v.description, v.same_day, v.requires_rx, v.brand, v.dosage_form, v.price, v.stock, v.img
FROM (VALUES
  ('Biogesic (Paracetamol) 500mg', 'For fever and mild to moderate pain.',            true,  false, 'Biogesic',  'Tablet',  8.00,  200, 'assets/biogesic.jpg',           'Pain Relief'),
  ('Ibuprofen 200mg',              'For pain, inflammation and fever.',                true,  false, 'Generic',   'Tablet',  12.00, 150, 'assets/ibuprofen.jpg',          'Pain Relief'),
  ('Amoxicillin 500mg',            'Antibiotic for bacterial infections.',             false, true,  'Generic',   'Capsule', 18.00, 120, 'assets/amoxicillin.jpg',        'Antibiotics'),
  ('Amlodipine + Losartan',        'For high blood pressure.',                         true,  true,  'Generic',   'Tablet',  28.50, 100, 'assets/amlodipinelosartan.jpg', 'Cardiovascular'),
  ('Caltrate Advance',             'Calcium + Vitamin D for stronger bones.',          true,  false, 'Caltrate',  'Tablet',  52.00, 80,  'assets/caltrateadvance.jpg',    'Vitamins & Supplements'),
  ('Myra E 400 IU',                'Vitamin E for healthy skin.',                      true,  false, 'Myra',      'Capsule', 9.50,  120, 'assets/myra.jpg',               'Vitamins & Supplements'),
  ('Impodex (Loperamide) 2mg',     'For relief of acute diarrhea.',                    true,  false, 'Impodex',   'Capsule', 35.00, 90,  'assets/impodex.jpg',            'Gastrointestinal'),
  ('Kremil-S',                     'Antacid for hyperacidity and heartburn.',          true,  false, 'Kremil-S',  'Tablet',  10.00, 150, 'assets/kremils.jpg',            'Gastrointestinal')
) AS v(name, description, same_day, requires_rx, brand, dosage_form, price, stock, img, category)
JOIN public."Category" c ON c.category_name = v.category
WHERE NOT EXISTS (SELECT 1 FROM public."Product");

/* ── 4. TELL THE API TO PICK UP THE CHANGES NOW ─────────────────── */
NOTIFY pgrst, 'reload schema';
