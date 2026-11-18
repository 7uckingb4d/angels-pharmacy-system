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
