-- =====================================================================
-- SEED DATA: Category, Product, Users (auth.users -> Profiles)
-- Run in the Supabase SQL Editor (runs as postgres, which the security
-- triggers allow). Order matters: Category -> Product -> Users.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CATEGORY (8 rows; the last one is inactive to test the RLS filter)
-- ---------------------------------------------------------------------
INSERT INTO "public"."Category" (category_name, description, is_active) VALUES
  ('Pain Relief & Fever',        'Analgesics, antipyretics and topical pain relievers',     true),
  ('Cold, Cough & Allergy',      'Decongestants, antihistamines and cough remedies',        true),
  ('Vitamins & Supplements',     'Daily vitamins, minerals and nutritional supplements',    true),
  ('Antibiotics',                'Prescription antibiotics (requires valid prescription)',  true),
  ('Maintenance Medications',    'Prescription meds for chronic conditions',                true),
  ('Digestive Health',           'Antacids, anti-diarrheals and rehydration products',      true),
  ('First Aid & Wound Care',     'Antiseptics, dressings and basic first aid supplies',     true),
  ('Seasonal (Inactive)',        'Hidden category used to test is_active filtering',        false)
ON CONFLICT (category_name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) PRODUCT (30 rows; category looked up by name)
--    NOTE: Product has no UNIQUE constraint on name, so re-running this
--    block will insert duplicates. Run it once.
-- ---------------------------------------------------------------------
INSERT INTO "public"."Product"
  (category_id, name, description, same_day, requires_rx, brand, dosage_form, price, stock_quantity, img_path)
SELECT c.category_id, v.name, v.description, v.same_day, v.requires_rx, v.brand, v.dosage_form, v.price, v.stock_quantity, v.img_path
FROM (VALUES
  -- Pain Relief & Fever
  ('Pain Relief & Fever', 'Paracetamol 500mg (Strip of 10)',        'Relief of mild to moderate pain and fever',                 true,  false, 'Biogesic',      'Tablet',   38.00, 250, 'uploads/previews/paracetamol-500mg.jpg'),
  ('Pain Relief & Fever', 'Ibuprofen 200mg (Strip of 10)',          'Anti-inflammatory for headache, toothache and body pain',   true,  false, 'Medicol',       'Capsule',  95.00, 180, 'uploads/previews/ibuprofen-200mg.jpg'),
  ('Pain Relief & Fever', 'Mefenamic Acid 500mg (Strip of 10)',     'For menstrual cramps and moderate pain',                    false, true,  'Generic',       'Capsule',  60.00, 120, 'uploads/previews/mefenamic-acid-500mg.jpg'),
  ('Pain Relief & Fever', 'Paracetamol Syrup 120mg/5mL (60mL)',     'Pediatric fever and pain reliever',                         true,  false, 'Tempra',        'Syrup',   110.00,  90, 'uploads/previews/paracetamol-syrup-60ml.jpg'),
  ('Pain Relief & Fever', 'Diclofenac Gel 1% (20g)',                'Topical gel for muscle and joint pain',                     true,  false, 'Voltaren',      'Gel',     215.00,  60, 'uploads/previews/diclofenac-gel-20g.jpg'),

  -- Cold, Cough & Allergy
  ('Cold, Cough & Allergy', 'Phenylephrine + Chlorphenamine + Paracetamol (Strip of 10)', 'Relief of colds, nasal congestion and fever', true,  false, 'Neozep Forte', 'Tablet',   70.00, 200, 'uploads/previews/neozep-forte.jpg'),
  ('Cold, Cough & Allergy', 'Cetirizine 10mg (Strip of 10)',        'Non-drowsy antihistamine for allergic rhinitis and hives',  true,  false, 'Generic',       'Tablet',   55.00, 220, 'uploads/previews/cetirizine-10mg.jpg'),
  ('Cold, Cough & Allergy', 'Loratadine 10mg (Strip of 10)',        'Once-daily antihistamine for allergy symptoms',             true,  false, 'Claritin',      'Tablet',  120.00, 140, 'uploads/previews/loratadine-10mg.jpg'),
  ('Cold, Cough & Allergy', 'Ambroxol 30mg/5mL Syrup (60mL)',       'Mucolytic that loosens phlegm',                             true,  false, 'Mucosolvan',    'Syrup',   165.00,  75, 'uploads/previews/ambroxol-syrup-60ml.jpg'),
  ('Cold, Cough & Allergy', 'Lagundi 600mg (Strip of 10)',          'Herbal cough and asthma relief',                            true,  false, 'Ascof',         'Tablet',   85.00, 130, 'uploads/previews/lagundi-600mg.jpg'),

  -- Vitamins & Supplements
  ('Vitamins & Supplements', 'Ascorbic Acid 500mg (Bottle of 30)',  'Vitamin C to support immune health',                        true,  false, 'Poten-Cee',     'Capsule', 250.00, 160, 'uploads/previews/vitamin-c-500mg.jpg'),
  ('Vitamins & Supplements', 'Multivitamins + Minerals (Bottle of 30)', 'Complete daily multivitamin',                           true,  false, 'Centrum',       'Tablet',  620.00,  85, 'uploads/previews/multivitamin-30.jpg'),
  ('Vitamins & Supplements', 'Vitamin D3 1000 IU (Bottle of 30)',   'Supports bone health and calcium absorption',               true,  false, 'Generic',       'Softgel', 380.00, 100, 'uploads/previews/vitamin-d3-1000iu.jpg'),
  ('Vitamins & Supplements', 'Ferrous Sulfate + Folic Acid (Bottle of 30)', 'Iron supplement for anemia prevention',             true,  false, 'Iberet',        'Tablet',  395.00,  70, 'uploads/previews/iron-folic-acid.jpg'),
  ('Vitamins & Supplements', 'Omega-3 Fish Oil 1000mg (Bottle of 60)', 'Supports heart and brain health (out of stock sample)', false, false, 'Generic',       'Softgel', 780.00,   0, 'uploads/previews/omega-3-1000mg.jpg'),

  -- Antibiotics (Rx)
  ('Antibiotics', 'Amoxicillin 500mg (Strip of 10)',                'Broad-spectrum penicillin antibiotic',                      false, true,  'Generic',       'Capsule', 120.00,  80, 'uploads/previews/amoxicillin-500mg.jpg'),
  ('Antibiotics', 'Azithromycin 500mg (Strip of 3)',                'Macrolide antibiotic for respiratory infections',           false, true,  'Generic',       'Tablet',  290.00,  50, 'uploads/previews/azithromycin-500mg.jpg'),
  ('Antibiotics', 'Amoxicillin + Clavulanic Acid 625mg (Strip of 14)', 'Combination antibiotic for resistant infections',       false, true,  'Augmentin',     'Tablet',  980.00,  40, 'uploads/previews/co-amoxiclav-625mg.jpg'),
  ('Antibiotics', 'Cefalexin 500mg (Strip of 10)',                  'Cephalosporin antibiotic for skin and urinary infections',  false, true,  'Generic',       'Capsule', 150.00,  65, 'uploads/previews/cefalexin-500mg.jpg'),

  -- Maintenance Medications (Rx)
  ('Maintenance Medications', 'Amlodipine 5mg (Box of 30)',         'Calcium channel blocker for hypertension',                  false, true,  'Generic',       'Tablet',  280.00, 110, 'uploads/previews/amlodipine-5mg.jpg'),
  ('Maintenance Medications', 'Losartan 50mg (Box of 30)',          'Angiotensin receptor blocker for hypertension',             false, true,  'Generic',       'Tablet',  360.00,  95, 'uploads/previews/losartan-50mg.jpg'),
  ('Maintenance Medications', 'Metformin 500mg (Box of 30)',        'First-line oral medication for type 2 diabetes',            false, true,  'Generic',       'Tablet',  190.00, 125, 'uploads/previews/metformin-500mg.jpg'),
  ('Maintenance Medications', 'Atorvastatin 20mg (Box of 30)',      'Statin for lowering cholesterol',                           false, true,  'Generic',       'Tablet',  450.00,  80, 'uploads/previews/atorvastatin-20mg.jpg'),

  -- Digestive Health
  ('Digestive Health', 'Loperamide 2mg (Strip of 10)',              'Short-term relief of diarrhea',                             true,  false, 'Imodium',       'Capsule', 130.00, 100, 'uploads/previews/loperamide-2mg.jpg'),
  ('Digestive Health', 'Oral Rehydration Salts (Sachet)',           'Replaces fluids and electrolytes lost to diarrhea',         true,  false, 'Hydrite',       'Powder',   28.00, 300, 'uploads/previews/oral-rehydration-salts.jpg'),
  ('Digestive Health', 'Aluminum + Magnesium Hydroxide (Strip of 10)', 'Antacid chewable tablet for heartburn and hyperacidity', true,  false, 'Kremil-S',      'Tablet',   80.00, 190, 'uploads/previews/kremil-s.jpg'),
  ('Digestive Health', 'Omeprazole 20mg (Strip of 10)',             'Proton pump inhibitor for GERD and ulcers',                 false, true,  'Generic',       'Capsule', 140.00,  90, 'uploads/previews/omeprazole-20mg.jpg'),

  -- First Aid & Wound Care
  ('First Aid & Wound Care', 'Povidone-Iodine 10% Solution (60mL)', 'Antiseptic for cuts, scrapes and minor wounds',             true,  false, 'Betadine',      'Solution', 95.00, 150, 'uploads/previews/povidone-iodine-60ml.jpg'),
  ('First Aid & Wound Care', 'Adhesive Bandage (Box of 100)',       'Assorted-size sterile adhesive strips',                     true,  false, 'Band-Aid',      'Adhesive Strip', 140.00, 120, 'uploads/previews/adhesive-bandage-100.jpg'),
  ('First Aid & Wound Care', 'Isopropyl Alcohol 70% (500mL)',       'Disinfectant for skin and surfaces',                        true,  false, 'Generic',       'Solution', 110.00, 210, 'uploads/previews/isopropyl-alcohol-500ml.jpg')
) AS v(category_name, name, description, same_day, requires_rx, brand, dosage_form, price, stock_quantity, img_path)
JOIN "public"."Category" c ON c.category_name = v.category_name;

-- ---------------------------------------------------------------------
-- 3) USERS (10): auth.users -> trigger creates Profiles -> set roles
--    Password for ALL seed accounts: Password123!
--    Requires full_name in raw_user_meta_data (Profiles.full_name is NOT NULL).
-- ---------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000001','authenticated','authenticated','maria.santos@seed.test',   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Maria Santos","phone":"+639171110001"}',    now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000002','authenticated','authenticated','jose.reyes@seed.test',     extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Jose Reyes","phone":"+639171110002"}',      now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000003','authenticated','authenticated','angela.cruz@seed.test',    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Angela Cruz","phone":"+639171110003"}',    now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000004','authenticated','authenticated','ramon.bautista@seed.test', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ramon Bautista","phone":"+639171110004"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000005','authenticated','authenticated','juan.delacruz@seed.test',  extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Juan Dela Cruz","phone":"+639171110005"}',  now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000006','authenticated','authenticated','liza.mendoza@seed.test',   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Liza Mendoza","phone":"+639171110006"}',   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000007','authenticated','authenticated','carlo.garcia@seed.test',   extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Carlo Garcia","phone":"+639171110007"}',   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000008','authenticated','authenticated','bea.villanueva@seed.test', extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bea Villanueva","phone":"+639171110008"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000009','authenticated','authenticated','paolo.ramos@seed.test',    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paolo Ramos","phone":"+639171110009"}',    now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000000010','authenticated','authenticated','nina.aquino@seed.test',    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nina Aquino","phone":"+639171110010"}',    now(), now(), '', '', '', '');

-- Identities (needed so email/password login actually works)
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@seed.test';

-- The handle_new_user trigger created Profiles with role = 'customer'.
-- Promote the first four (allowed here because this runs as postgres).
UPDATE "public"."Profiles" p
SET role = v.role::public.role_name
FROM (VALUES
  ('00000000-0000-4000-8000-000000000001'::uuid, 'owner'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'administrator'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'pharmacist'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'pharmacist')
) AS v(id, role)
WHERE p.id = v.id;

-- ---------------------------------------------------------------------
-- Quick verification
-- ---------------------------------------------------------------------
-- SELECT count(*) FROM "public"."Category";   -- 8
-- SELECT count(*) FROM "public"."Product";    -- 30
-- SELECT full_name, role FROM "public"."Profiles" ORDER BY role, full_name;  -- 10 rows