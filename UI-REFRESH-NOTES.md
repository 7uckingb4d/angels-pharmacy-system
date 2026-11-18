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
