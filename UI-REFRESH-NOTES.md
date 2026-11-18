# UI refresh v2 — same layout, more life

This round keeps every page's original structure (the wireframe layout):
top nav → full-width brand banner → the same sections in the same order.
Only the look changes.

## What changed
- New file `public/css/theme.css`, loaded last on every page. It restyles
  colors, fonts, cards, buttons, badges, tables and adds decoration/motion
  (capsule illustrations, plus-sign patterns, hover lifts, button shine,
  animated highlight on the landing headline, scrolling trust ribbon).
- New file `public/js/ui.js` — presentation only: header shadow on scroll and
  a gentle fade-in for content cards on inner pages. No data, auth or API code.
- Each HTML page got 3 lines in `<head>` (Google Fonts + theme.css) and one
  `<script src="js/ui.js">` before `</body>`. Nothing else in the public pages
  was edited.
- All original CSS files are untouched and still loaded.

## Small markup fixes (admin.html only)
- Sidebar "Sign Out" called `auth.logOut()` (undefined). Now `Auth.logOut()`.
- Products table header listed 10 columns while rows render 7. Header now
  matches the rows: Name, Price, OTC/RX, Same-day, Category, Status, Actions.
- Sidebar links got small icons.

## Not changed (flagged)
- admin.js POS product buttons throw "Unexpected end of input" when clicked
  (JSON.stringify inside a double-quoted onclick). Pre-existing, left alone.
- homepage.js "Request Verification" expects a branch radio that is commented
  out in homepage.html. Pre-existing, left alone.

Backend, API routes, database, auth flow, form fields and IDs: untouched.

## v3 (Nov 17)
- Banner strip removed from every page. The banner artwork now sits as a soft
  background inside the red page headers and behind the landing hero
  (`--banner-veil-*` in theme.css controls how visible it is).
- About → Our Mission: value cards are 4 across on desktop, 2 across on phones
  (no more empty space). The three About stats stay on one row on phones.
- admin.js POS product buttons fixed (names now passed via data attributes).
- homepage.js "Request Verification" no longer needs the commented-out branch
  picker, and uses Auth.fetch so an expired login refreshes automatically.
- Backend: `/api/health` now checks the database and explains the fix; env values
  are cleaned of stray quotes/spaces/`/rest/v1`; the catalog falls back to a manual
  category join; new repair migration grants permissions and adds starter
  medicines when the catalog is empty.

## v4 — tester fixes

- **Branches removed everywhere** — no more "Punturin / Malinta" on public pages, cart, POS, contact form, or the admin panel (Branches tab deleted). The site now says "Valenzuela City".
- **Pharmacist Chat removed** (homepage card + landing feature). Replaced on the landing page by "Live Order Tracking".
- **Sign-up pop-up fits phones** — scrolls inside the screen, smaller spacing, 16px inputs (no iPhone zoom).
- **Roles renamed: admin, pharmacist, counter** (+ customer).
  - admin — everything.
  - pharmacist — prescriptions, view products, orders. Clicking *+ Add Product*, *Edit* or *Remove* shows an "Admin only" pop-up right away (the form never opens). The server also refuses.
  - counter — Dashboard + Orders only; can only update order status.
  - Old `owner` / `administrator` accounts are treated as admin automatically.
  - **Run `supabase/migrations/20261118000000_roles_counter_pharmacist_admin.sql` in the Supabase SQL Editor** so the database accepts the new names (needed before you can assign "Counter").
  - Users tab now has a role picker (Customer / Counter / Pharmacist / Admin).
- **Prescription upload can't be repeated** — one click = one upload; picking the same file again shows "Already submitted". (Before, two scripts both uploaded on every click.)
- **OCR works** — "View OCR" reads text from a prescription photo (Tesseract.js, loaded on demand) and highlights matching catalog medicines. PDFs are read by the pharmacist.
- Fixed: hidden admin menu items still showed for staff (theme `!important` beat the hide).
- Tests: `npm test` checks who can do what per role.

## v5 — phone fixes, login fix, working Settings

- **Phone layout fixed on every page.** The top bar was wider than a phone screen,
  which made the whole site zoom out and cut off buttons. New `public/css/mobile.css`
  (loaded last on every page): top bar is now logo | one button | ☰, "Log In" moves into
  the ☰ menu on phones, pop-ups fit the screen, the "Login Required" buttons stack,
  and nothing can push the page sideways anymore.
- **Admin panel on phones:** tables (Orders, Products, Prescriptions, Users) turn into
  cards so every column and button is visible. The side menu has a close (×) button.
- **Login error "Unexpected token '<' … is not valid JSON" fixed.** The server was fine;
  the phone sometimes got an error page instead of a reply (VPN / weak signal / hosting
  hiccup). Login, sign-up and session refresh now retry once and show a plain message.
- **Settings now actually save.** Admin → Settings has:
  - Pharmacy details (name, license, location, regulatory body, contact email/phone)
  - Operating hours (Mon–Fri, Sat, Sun)
  - Low-stock alert number (used by the dashboard + inventory)
  - "Accept online orders" switch (off = customers can't order; POS still works)
  - My Account (edit your name/phone) and Change Password — for every staff role.
  Only admins can change pharmacy details; pharmacist/counter see them as view-only.
  Contact, About, landing and customer home pages show the saved details automatically.
- **Run `supabase/migrations/20261118120000_settings.sql` in the Supabase SQL Editor once**
  so settings can be saved. Until then the page shows a yellow note and the old values.
- New API: `GET /api/settings` (public), `PUT /api/settings` (admin),
  `POST /api/auth/password` (signed in). Tests: `npm test` (now also checks settings rules).

## v6 — tester fixes (Nov 18)

**Run `supabase/migrations/20261118180000_v6_audit_lockout_payments.sql` once in the Supabase SQL Editor.**
It is safe to run more than once and also covers the older roles migration. Until it is run, the site still
works, but role changes to Counter, the audit log, account lockout, order numbers and payments are not saved.

1. **Audit log** — Admin → Settings → *Audit Log* (admins only). Logs logins, wrong passwords, locked
   accounts, sign-ups, password changes, new users, role changes, unlocks, product add/edit/remove,
   restocks, prescription upload/approve/reject, orders, order status, payments (and refused payments),
   and settings changes — with who, role, when and details. Filter by type or search.
2. **Prescription upload → Cancel / ✕** — removes the selected file (before or after submitting). Disabled
   only while the upload is in progress.
3. **OCR in the admin panel** — Prescriptions → *Read (OCR)* reads the text on the photo and highlights
   catalog medicines found in it. Purpose: helps the pharmacist read the prescription faster and spot which
   medicines it asks for. It is only a helper; the pharmacist still checks the file and approves/rejects.
   PDFs are opened with *View*.
4. **admin.html is never shown to customers** — the page stays invisible until the login is confirmed as
   staff; customers are sent to their home page before anything appears. (The data was already protected by
   the server.)
5. **In-store pick-up only** — notes in the cart, on add-to-cart, on medicine details, in the POS and in
   the Orders queue. The server refuses any order that is not pick-up, and the database only allows
   `fulfillment = 'pickup'`.
6. **Out of stock** — catalog, medicine details, customer home and POS show *Out of Stock*; clicking the
   button shows "… was not added to your cart — it is out of stock." The cart also can't go above the
   stock left.
7. **FT-10 to FT-12 are in Admin (log in as Admin or Counter):**
   - FT-12 — **POS**: 1. choose a registered customer, 2. add products, 3. *Pick up*, then **Confirm Order**.
     You get an order number (e.g. ORD-10492); it appears in **Orders** as Pending / Unpaid and the stock
     goes down right away.
   - FT-10 / FT-11 — **Orders → Proceed to Payment** (also on the POS order slip): choose **Cash**, enter the
     amount tendered, **Confirm**. ₱200 on ₱100 shows change ₱100.00 and records method, amount and time.
     ₱50 on ₱100 shows "Tendered amount is less than the total due." and the order stays unpaid.
   - Counter now has the POS (admin + counter). Pharmacist does not.
8. **Role → Counter fixed** — roles are now stored as text with a check (admin, pharmacist, counter,
   customer), so the database accepts Counter.
9. **Create users** — Users → *+ Add User* (name, email, phone, temporary password, role). The account can
   log in right away.
10. **Inventory inside Products** — Products → *Inventory & Alerts* (also in the side menu with a badge):
    out-of-stock / low-stock / in-stock counts, **Restock Alerts** list, stock levels, *Restock* (admin
    adds units received) and recent stock movements. The dashboard shows a restock banner. The low-stock
    number is set in Settings.
11. **5 wrong passwords lock the account** — the login message counts down the tries left. After 5 the
    account is locked; only an admin can unlock it (Users → *Locked* → **Unlock**). Logged in the audit log.

New API: `POST /api/admin/users`, `POST /api/admin/users/:id/unlock`, `GET /api/admin/customers`,
`GET /api/admin/inventory/logs`, `GET /api/admin/audit`, `POST /api/orders/:id/payment`.
Tests: `npm test` (adds lockout, payment/change, and POS access tests).
