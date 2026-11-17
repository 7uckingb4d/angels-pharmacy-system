SET local check_function_bodies = off;

CREATE TABLE "public"."Category" (
  "category_id"   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "category_name" character varying(100)   NOT NULL,
  "description"   text,
  "is_active"     boolean                  NOT NULL DEFAULT true,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Category_category_name_check" CHECK ((btrim((category_name)::text) <> ''::text)),
  CONSTRAINT "Category_category_name_key" UNIQUE (category_name),
  CONSTRAINT "Category_pkey" PRIMARY KEY (category_id)
);

ALTER TABLE "public"."Category"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."InventoryLog" (
  "log_id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "product_id"     uuid                     NOT NULL,
  "quantity"       integer                  NOT NULL,
  "previous_stock" integer                  NOT NULL,
  "new_stock"      integer                  NOT NULL,
  "log_date"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "InventoryLog_new_stock_check" CHECK ((new_stock >= 0)),
  CONSTRAINT "InventoryLog_pkey" PRIMARY KEY (log_id),
  CONSTRAINT "InventoryLog_previous_stock_check" CHECK ((previous_stock >= 0)),
  CONSTRAINT "InventoryLog_quantity_check" CHECK ((quantity <> 0))
);

ALTER TABLE "public"."InventoryLog"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."InventoryLog" FROM "anon", "authenticated";

CREATE TABLE "public"."NotificationType" (
  "notification_type_id"   uuid                  NOT NULL DEFAULT gen_random_uuid(),
  "notification_type_name" character varying(50) NOT NULL,
  CONSTRAINT "NotificationType_notification_type_name_check" CHECK ((btrim((notification_type_name)::text) <> ''::text)),
  CONSTRAINT "NotificationType_notification_type_name_key" UNIQUE (notification_type_name),
  CONSTRAINT "NotificationType_pkey" PRIMARY KEY (notification_type_id)
);

ALTER TABLE "public"."NotificationType"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."NotificationType" FROM "anon";

CREATE TABLE "public"."Notification" (
  "notification_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              uuid                     NOT NULL,
  "order_id"             uuid,
  "notification_type_id" uuid                     NOT NULL,
  "message"              text                     NOT NULL,
  "sent_via"             character varying(20)    NOT NULL,
  "sent_date"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Notification_message_check" CHECK ((btrim(message) <> ''::text)),
  CONSTRAINT "Notification_pkey" PRIMARY KEY (notification_id),
  CONSTRAINT "Notification_sent_via_check"
    CHECK (((sent_via)::text = ANY ((ARRAY['email'::character varying, 'sms'::character varying, 'push'::character varying, 'in_app'::character varying])::text[])))
);

ALTER TABLE "public"."Notification"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Notification" FROM "anon";

CREATE TABLE "public"."OrderItem" (
  "order_item_id" uuid          NOT NULL DEFAULT gen_random_uuid(),
  "order_id"      uuid          NOT NULL,
  "product_id"    uuid          NOT NULL,
  "quantity"      integer       NOT NULL,
  "unit_price"    numeric(10,2) NOT NULL,
  CONSTRAINT "OrderItem_order_id_product_id_key" UNIQUE (order_id, product_id),
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY (order_item_id),
  CONSTRAINT "OrderItem_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "OrderItem_unit_price_check" CHECK ((unit_price >= (0)::numeric))
);

ALTER TABLE "public"."OrderItem"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."OrderItem" FROM "anon";

CREATE TABLE "public"."Order" (
  "order_id"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"  uuid                     NOT NULL,
  "placed_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "valid_until"  timestamp with time zone,
  "total_amount" numeric(10,2)            NOT NULL DEFAULT 0,
  CONSTRAINT "Order_check" CHECK (((valid_until IS NULL) OR (valid_until > placed_at))),
  CONSTRAINT "Order_pkey" PRIMARY KEY (order_id),
  CONSTRAINT "Order_total_amount_check" CHECK ((total_amount >= (0)::numeric))
);

ALTER TABLE "public"."Order"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Order" FROM "anon";

CREATE TABLE "public"."Payment" (
  "payment_id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"         uuid                     NOT NULL,
  "amount"           numeric(10,2)            NOT NULL,
  "claim_date"       timestamp with time zone,
  "reference_number" character varying(100),
  CONSTRAINT "Payment_amount_check" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "Payment_pkey" PRIMARY KEY (payment_id),
  CONSTRAINT "Payment_reference_number_check" CHECK (((reference_number IS NULL) OR (btrim((reference_number)::text) <> ''::text))),
  CONSTRAINT "Payment_reference_number_key" UNIQUE (reference_number)
);

ALTER TABLE "public"."Payment"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Payment" FROM "anon";

CREATE TABLE "public"."Prescription" (
  "prescription_id"   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"       uuid                     NOT NULL,
  "pharmacist_id"     uuid,
  "prescription_file" text                     NOT NULL,
  "uploaded_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Prescription_pkey" PRIMARY KEY (prescription_id),
  CONSTRAINT "Prescription_prescription_file_check" CHECK ((btrim(prescription_file) <> ''::text))
);

ALTER TABLE "public"."Prescription"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Prescription" FROM "anon";

CREATE TABLE "public"."Product" (
  "product_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "category_id"     uuid                     NOT NULL,
  "name"            character varying(200)   NOT NULL,
  "description"     text,
  "same_day"        boolean                  NOT NULL DEFAULT true,
  "requires_rx"     boolean                  NOT NULL DEFAULT false,
  "brand"           character varying(100)   NOT NULL DEFAULT 'Generic'::character varying,
  "dosage_form"     character varying(50)    NOT NULL,
  "price"           numeric(10,2)            NOT NULL,
  "stock_quantity"  integer                  NOT NULL DEFAULT 0,
  "is_active"       boolean                  NOT NULL DEFAULT true,
  "img_path"        text                     NOT NULL,
  "date_registered" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Product_brand_check" CHECK ((btrim((brand)::text) <> ''::text)),
  CONSTRAINT "Product_dosage_form_check" CHECK ((btrim((dosage_form)::text) <> ''::text)),
  CONSTRAINT "Product_img_path_check" CHECK ((btrim(img_path) <> ''::text)),
  CONSTRAINT "Product_name_check" CHECK ((btrim((name)::text) <> ''::text)),
  CONSTRAINT "Product_pkey" PRIMARY KEY (product_id),
  CONSTRAINT "Product_price_check" CHECK ((price >= (0)::numeric)),
  CONSTRAINT "Product_stock_quantity_check" CHECK ((stock_quantity >= 0))
);

ALTER TABLE "public"."Product"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."Profiles" (
  "id"         uuid                     NOT NULL,
  "full_name"  character varying(150)   NOT NULL,
  "phone"      character varying(30),
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "Profiles_full_name_check" CHECK ((btrim((full_name)::text) <> ''::text)),
  CONSTRAINT "Profiles_phone_check" CHECK (((phone IS NULL) OR ((length(btrim((phone)::text)) >= 7) AND (length(btrim((phone)::text)) <= 30)))),
  CONSTRAINT "Profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."Profiles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."Profiles" FROM "anon";

ALTER TABLE "public"."OrderItem"
  ADD COLUMN "subtotal" numeric(10,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED;

CREATE TYPE "public"."inventory_status" AS ENUM (
  'restock',
  'sale',
  'adjustment',
  'return'
);

ALTER TABLE "public"."InventoryLog"
  ADD COLUMN "type" public.inventory_status NOT NULL;

CREATE TYPE "public"."notification_status" AS ENUM (
  'pending',
  'sent',
  'failed'
);

ALTER TABLE "public"."Notification"
  ADD COLUMN "status" public.notification_status NOT NULL DEFAULT 'pending'::public.notification_status;

CREATE TYPE "public"."order_status" AS ENUM (
  'pending',
  'confirmed',
  'ready',
  'completed',
  'cancelled'
);

ALTER TABLE "public"."Order"
  ADD COLUMN "status" public.order_status NOT NULL DEFAULT 'pending'::public.order_status;

CREATE TYPE "public"."payment_status" AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded'
);

ALTER TABLE "public"."Payment"
  ADD COLUMN "status" public.payment_status NOT NULL DEFAULT 'pending'::public.payment_status;

CREATE TYPE "public"."prescription_status" AS ENUM (
  'pending',
  'verified',
  'declined'
);

ALTER TABLE "public"."Prescription"
  ADD COLUMN "status" public.prescription_status NOT NULL DEFAULT 'pending'::public.prescription_status;

CREATE TYPE "public"."role_name" AS ENUM (
  'owner',
  'administrator',
  'customer',
  'pharmacist'
);

ALTER TABLE "public"."Profiles"
  ADD COLUMN "role" public.role_name NOT NULL DEFAULT 'customer'::public.role_name;

CREATE OR REPLACE FUNCTION public.current_user_is_profile_owner (
  profile_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT auth.uid() = profile_id;
$function$;

REVOKE ALL ON FUNCTION "public"."current_user_is_profile_owner"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enforce_order_security()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    IF NEW.customer_id IS NULL THEN
        RAISE EXCEPTION 'Orders require a customer profile';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public."Profiles" p
        WHERE p.id = NEW.customer_id
          AND p.role = 'customer'
    ) THEN
        RAISE EXCEPTION 'Order owner must be a customer';
    END IF;

    IF NEW.valid_until IS NOT NULL AND NEW.valid_until <= NEW.placed_at THEN
        RAISE EXCEPTION 'valid_until must be later than order_date';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_order_security"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enforce_prescription_security()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    IF NEW.status = 'verified' AND NEW.pharmacist_id IS NULL THEN
        RAISE EXCEPTION 'Verified prescriptions must include a pharmacist';
    END IF;

    IF NEW.pharmacist_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public."Profiles" p
            WHERE p.id = NEW.pharmacist_id
              AND p.role = 'pharmacist'
        ) THEN
            RAISE EXCEPTION 'Assigned pharmacist must have the pharmacist role';
        END IF;
    END IF;

    IF NEW.customer_id = NEW.pharmacist_id THEN
        RAISE EXCEPTION 'A prescription cannot be assigned to the same user as the customer';
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_prescription_security"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enforce_profile_security()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.id IS NULL THEN
            RAISE EXCEPTION 'Profile id cannot be NULL';
        END IF;

        IF current_user NOT IN ('postgres', 'service_role') AND NEW.id <> auth.uid() THEN
            RAISE EXCEPTION 'Users cannot insert profiles for other accounts';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Profile identity is immutable';
        END IF;

        IF NEW.created_at IS DISTINCT FROM OLD.created_at AND current_user NOT IN ('postgres', 'service_role') THEN
            RAISE EXCEPTION 'created_at is immutable for regular users';
        END IF;

        IF NEW.role IS DISTINCT FROM OLD.role AND current_user NOT IN ('postgres', 'service_role') THEN
            RAISE EXCEPTION 'Role changes are restricted to trusted service/admin flows';
        END IF;

        IF NEW.is_active IS DISTINCT FROM OLD.is_active AND current_user NOT IN ('postgres', 'service_role') THEN
            RAISE EXCEPTION 'Account activation state is restricted';
        END IF;

        IF current_user NOT IN ('postgres', 'service_role') AND auth.uid() IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'Users may only update their own profile';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."enforce_profile_security"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    INSERT INTO public."Profiles" (id, full_name, phone)
    VALUES (
        NEW.id,
        left(nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), 150),
        left(nullif(btrim(coalesce(NEW.phone, NEW.raw_user_meta_data ->> 'phone')), ''), 30)
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.handle_user_updated()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
BEGIN
    UPDATE public."Profiles"
    SET full_name = coalesce(
            left(nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''), 150),
            full_name),
        phone = coalesce(
            left(nullif(btrim(coalesce(NEW.phone, NEW.raw_user_meta_data ->> 'phone')), ''), 30),
            phone),
        updated_at = NOW()
    WHERE id = NEW.id;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."handle_user_updated"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."Profiles" p
        WHERE p.id = auth.uid()
          AND p.role IN ('owner', 'administrator')
    );
$function$;

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."Profiles" p
        WHERE p.id = auth.uid()
          AND p.role IN ('owner', 'administrator', 'pharmacist')
    );
$function$;

REVOKE ALL ON FUNCTION "public"."is_staff"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.touch_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.user_has_role (
  required_role public.role_name
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."Profiles" p
        WHERE p.id = auth.uid()
          AND p.role = required_role
    );
$function$;

REVOKE ALL ON FUNCTION "public"."user_has_role"(public.role_name) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."Notification"
  ADD CONSTRAINT "Notification_notification_type_id_fkey" FOREIGN KEY (notification_type_id) REFERENCES public."NotificationType"(notification_type_id) ON DELETE RESTRICT;

ALTER TABLE "public"."Notification"
  ADD CONSTRAINT "Notification_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."Order"(order_id) ON DELETE SET NULL;

ALTER TABLE "public"."OrderItem"
  ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."Order"(order_id) ON DELETE CASCADE;

ALTER TABLE "public"."Payment"
  ADD CONSTRAINT "Payment_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."Order"(order_id) ON DELETE RESTRICT;

ALTER TABLE "public"."Prescription"
  ADD CONSTRAINT "Prescription_check" CHECK (((status <> 'verified'::public.prescription_status) OR (pharmacist_id IS NOT NULL)));

ALTER TABLE "public"."Product"
  ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public."Category"(category_id) ON DELETE RESTRICT;

ALTER TABLE "public"."InventoryLog"
  ADD CONSTRAINT "InventoryLog_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(product_id) ON DELETE RESTRICT;

ALTER TABLE "public"."OrderItem"
  ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(product_id) ON DELETE RESTRICT;

ALTER TABLE "public"."Profiles"
  ADD CONSTRAINT "Profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."Notification"
  ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public."Profiles"(id) ON DELETE CASCADE;

ALTER TABLE "public"."Order"
  ADD CONSTRAINT "Order_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Profiles"(id) ON DELETE RESTRICT;

ALTER TABLE "public"."Prescription"
  ADD CONSTRAINT "Prescription_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public."Profiles"(id) ON DELETE RESTRICT;

ALTER TABLE "public"."Prescription"
  ADD CONSTRAINT "Prescription_pharmacist_id_fkey" FOREIGN KEY (pharmacist_id) REFERENCES public."Profiles"(id) ON DELETE SET NULL;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data, phone ON auth.users
  FOR EACH ROW
  WHEN (((old.raw_user_meta_data IS DISTINCT FROM new.raw_user_meta_data) OR (old.phone IS DISTINCT FROM new.phone)))
  EXECUTE FUNCTION public.handle_user_updated();

CREATE TRIGGER order_security_guard
  BEFORE INSERT OR UPDATE OF customer_id, placed_at, valid_until, status ON public."Order"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_security();

CREATE TRIGGER prescription_security_guard
  BEFORE INSERT OR UPDATE OF status, customer_id, pharmacist_id ON public."Prescription"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_prescription_security();

CREATE TRIGGER profiles_security_guard
  BEFORE INSERT OR UPDATE ON public."Profiles"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_security();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public."Profiles"
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Anyone can read active categories" ON "public"."Category"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((is_active = true));

CREATE POLICY "Users can view their own notifications" ON "public"."Notification"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = user_id));

CREATE POLICY "Authenticated users can read notification types" ON "public"."NotificationType"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "Users can place their own orders" ON "public"."Order"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = customer_id) AND (status = 'pending'::public.order_status)));

CREATE POLICY "Users can view their own orders" ON "public"."Order"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = customer_id));

CREATE POLICY "Users can add items to their own pending orders" ON "public"."OrderItem"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public."Order" o
  WHERE ((o.order_id = "OrderItem".order_id) AND (o.customer_id = auth.uid()) AND (o.status = 'pending'::public.order_status)))));

CREATE POLICY "Users can view items of their own orders" ON "public"."OrderItem"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public."Order" o
  WHERE ((o.order_id = "OrderItem".order_id) AND (o.customer_id = auth.uid())))));

CREATE POLICY "Users can view payments for their own orders" ON "public"."Payment"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public."Order" o
  WHERE ((o.order_id = "Payment".order_id) AND (o.customer_id = auth.uid())))));

CREATE POLICY "Users can upload their own prescriptions" ON "public"."Prescription"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((auth.uid() = customer_id) AND (status = 'pending'::public.prescription_status) AND (pharmacist_id IS NULL)));

CREATE POLICY "Users can view their own prescriptions" ON "public"."Prescription"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = customer_id));

CREATE POLICY "Anyone can browse active products" ON "public"."Product"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((is_active = true));

CREATE POLICY "Users can update their own profile" ON "public"."Profiles"
  FOR UPDATE
  TO "authenticated"
  USING (public.current_user_is_profile_owner(id))
  WITH CHECK (public.current_user_is_profile_owner(id));

CREATE POLICY "Users can view their own profile" ON "public"."Profiles"
  FOR SELECT
  TO "authenticated"
  USING (public.current_user_is_profile_owner(id));

CREATE POLICY "Users cannot delete profiles" ON "public"."Profiles"
  FOR DELETE
  TO "authenticated"
  USING (false);

REVOKE ALL ON FUNCTION "public"."current_user_is_profile_owner"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_profile_owner"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."current_user_is_profile_owner"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_order_security"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_order_security"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_order_security"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_prescription_security"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_prescription_security"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_prescription_security"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_profile_security"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_profile_security"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_profile_security"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_user_updated"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_user_updated"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_user_updated"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_staff"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_staff"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."user_has_role"(public.role_name) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."user_has_role"(public.role_name) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."user_has_role"(public.role_name) TO "service_role";

REVOKE ALL ON TABLE "public"."Category" FROM "anon";

GRANT SELECT ON TABLE "public"."Category" TO "anon";

REVOKE ALL ON TABLE "public"."Category" FROM "authenticated";

GRANT SELECT ON TABLE "public"."Category" TO "authenticated";

REVOKE ALL ON TABLE "public"."Category" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Category" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Category" TO "service_role";

REVOKE ALL ON TABLE "public"."InventoryLog" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."InventoryLog" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."InventoryLog" TO "service_role";

REVOKE ALL ON TABLE "public"."Notification" FROM "authenticated";

GRANT SELECT ON TABLE "public"."Notification" TO "authenticated";

REVOKE ALL ON TABLE "public"."Notification" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Notification" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Notification" TO "service_role";

REVOKE ALL ON TABLE "public"."NotificationType" FROM "authenticated";

GRANT SELECT ON TABLE "public"."NotificationType" TO "authenticated";

REVOKE ALL ON TABLE "public"."NotificationType" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."NotificationType" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."NotificationType" TO "service_role";

REVOKE ALL ON TABLE "public"."Order" FROM "authenticated";

REVOKE ALL ("customer_id") ON TABLE "public"."Order" FROM "authenticated";

GRANT INSERT ("customer_id") ON TABLE "public"."Order" TO "authenticated";

REVOKE ALL ("total_amount") ON TABLE "public"."Order" FROM "authenticated";

GRANT INSERT ("total_amount") ON TABLE "public"."Order" TO "authenticated";

REVOKE ALL ("valid_until") ON TABLE "public"."Order" FROM "authenticated";

GRANT INSERT ("valid_until") ON TABLE "public"."Order" TO "authenticated";

GRANT SELECT ON TABLE "public"."Order" TO "authenticated";

REVOKE ALL ON TABLE "public"."Order" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Order" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Order" TO "service_role";

REVOKE ALL ON TABLE "public"."OrderItem" FROM "authenticated";

REVOKE ALL ("order_id") ON TABLE "public"."OrderItem" FROM "authenticated";

GRANT INSERT ("order_id") ON TABLE "public"."OrderItem" TO "authenticated";

REVOKE ALL ("product_id") ON TABLE "public"."OrderItem" FROM "authenticated";

GRANT INSERT ("product_id") ON TABLE "public"."OrderItem" TO "authenticated";

REVOKE ALL ("quantity") ON TABLE "public"."OrderItem" FROM "authenticated";

GRANT INSERT ("quantity") ON TABLE "public"."OrderItem" TO "authenticated";

REVOKE ALL ("unit_price") ON TABLE "public"."OrderItem" FROM "authenticated";

GRANT INSERT ("unit_price") ON TABLE "public"."OrderItem" TO "authenticated";

GRANT SELECT ON TABLE "public"."OrderItem" TO "authenticated";

REVOKE ALL ON TABLE "public"."OrderItem" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."OrderItem" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."OrderItem" TO "service_role";

REVOKE ALL ON TABLE "public"."Payment" FROM "authenticated";

GRANT SELECT ON TABLE "public"."Payment" TO "authenticated";

REVOKE ALL ON TABLE "public"."Payment" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Payment" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Payment" TO "service_role";

REVOKE ALL ON TABLE "public"."Prescription" FROM "authenticated";

REVOKE ALL ("customer_id") ON TABLE "public"."Prescription" FROM "authenticated";

GRANT INSERT ("customer_id") ON TABLE "public"."Prescription" TO "authenticated";

REVOKE ALL ("prescription_file") ON TABLE "public"."Prescription" FROM "authenticated";

GRANT INSERT ("prescription_file") ON TABLE "public"."Prescription" TO "authenticated";

GRANT SELECT ON TABLE "public"."Prescription" TO "authenticated";

REVOKE ALL ON TABLE "public"."Prescription" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Prescription" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Prescription" TO "service_role";

REVOKE ALL ON TABLE "public"."Product" FROM "anon";

GRANT SELECT ON TABLE "public"."Product" TO "anon";

REVOKE ALL ON TABLE "public"."Product" FROM "authenticated";

GRANT SELECT ON TABLE "public"."Product" TO "authenticated";

REVOKE ALL ON TABLE "public"."Product" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Product" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Product" TO "service_role";

REVOKE ALL ON TABLE "public"."Profiles" FROM "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."Profiles" FROM "authenticated";

GRANT UPDATE ("full_name") ON TABLE "public"."Profiles" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."Profiles" FROM "authenticated";

GRANT UPDATE ("phone") ON TABLE "public"."Profiles" TO "authenticated";

GRANT SELECT ON TABLE "public"."Profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."Profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."Profiles" TO "service_role";
