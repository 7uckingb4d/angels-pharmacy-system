# Angel's Pharmacy Online System
This is the official repository of the Angel's Pharmacy Online System.

## Local development setup
The following are the instructions for setting up a local development environment.

1. Install **Express.js** version 5.2.1 in the root folder of the repository.
```
npm install express@5.2.1
```

2. Install the **Supabase JS** (version 2.117.2) client dependency for connecting the backend to the database.
```
npm install @supabase/supabase-js@2.117.2
```

3. Install the **Supabase** (version 2.120.0) development dependency to allow local development with a local database.
```
npm install supabase@2.120.0
```

You will need to install the **Supabase CLI** to your machine to allow concrete development of the system's database.
Refer to their [official documentation](https://supabase.com/docs/guides/local-development) for installation. You will
also need to install a container engine such as Docker or Podman, however **Docker** is strongly recommended.

## Deploy: Supabase + Vercel

**1. Supabase**
1. Create a project, then push the schema: `npx supabase link --project-ref <ref> && npx supabase db push`
   (or paste both files in `supabase/migrations/` into the SQL editor, oldest first).
   This also creates the `product-images` (public) and `prescriptions` (private) storage buckets.
2. Auth → Providers → Email: turn off "Confirm email" if you want instant login after sign-up.
3. Sign up once through the site, then make yourself the owner (SQL editor):
   ```sql
   update public."Profiles" set role = 'owner'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

**2. Vercel** — import the repo (no build command, no output directory) and set these env vars:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | publishable / anon key |
| `SUPABASE_SECRET_KEY` | secret / service_role key (server only) |

Local run: copy `.env.example` to `.env`, then `npm install && npm run dev`.

Notes: uploads are capped at 4 MB (Vercel's request limit). `/api/*` is served by `api/index.js`; `public/` is served statically.
