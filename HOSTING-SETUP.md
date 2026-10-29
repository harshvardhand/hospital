# Hosting setup — Supabase (database) + Render (server)

This replaces the local `data/appointments.json` and `data/patients.json`
files with a real free database (Supabase), so data survives restarts and
redeploys. The app's behavior is otherwise unchanged.

## 1. Create a free Supabase project (no credit card)

1. Go to https://supabase.com → Sign up (GitHub login is easiest)
2. Click **New Project**
3. Pick any name/region, set a database password (save it somewhere), click
   **Create new project** — takes ~2 minutes to spin up

## 2. Create the tables

1. In the Supabase dashboard, open **SQL Editor** (left sidebar)
2. Click **New query**
3. Paste in the entire contents of `supabase-schema.sql` (included in this
   repo) and click **Run**
4. You should see "Success. No rows returned" — the `appointments` and
   `patients` tables now exist

## 3. Get your API keys

1. In Supabase, go to **Project Settings** (gear icon) → **API**
2. Copy two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **service_role key** (under "Project API keys" — NOT the "anon public"
     key; the service_role key is the one the server uses and must be kept
     secret, never put in frontend code)

## 4. Deploy to Render

1. Go to https://render.com → Sign up with GitHub
2. **New +** → **Web Service** → select the `Kalpana-Hospital` repo
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. Under **Environment Variables**, add:
   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from step 3 |
   | `SUPABASE_SERVICE_KEY` | the service_role key from step 3 |
   | `STAFF_PASSWORD` | a strong password for staff login |
5. Click **Create Web Service** and wait for the deploy to finish
6. You'll get a public URL like `https://kalpana-hospital.onrender.com`

## 5. Test it

Repeat the manual test checklist from the main README, but on the live
Render URL. Data you create now is stored in Supabase and will still be
there after Render restarts, sleeps, or redeploys.

## What changed in the code

- `backend/appointment-store.js` and `backend/patient-store.js` now read
  and write to Supabase instead of local JSON files. The functions they
  export (`list`, `add`, `updateStatus`, `searchByName`, `verifyPin`,
  `addVisit`) work exactly the same way, so `server.js` and `index.html`
  did not need any changes.
- `backend/supabase-client.js` is a new small helper that creates the
  Supabase connection from the environment variables.
- `server.js` now binds to `0.0.0.0` instead of `127.0.0.1` — required for
  any hosting platform to route traffic to it. Running it locally still
  works the same way.
- `data/appointments.json` and `data/patients.json` are no longer used —
  you can leave them in the repo for reference or delete them later.

## Known limits of this free setup

- **Render free tier sleeps** after 15 minutes of inactivity — the first
  request after sleeping takes ~30-50 seconds to wake up. Fine for a small
  clinic's traffic, just mention it to the hospital so it's not surprising.
- **Supabase free tier** pauses a project after 1 week of zero activity
  (easy to avoid — just visiting the site keeps it active) and has
  storage/bandwidth limits far beyond what a small clinic needs.
- Real-time staff queue updates (Server-Sent Events in `server.js`) run
  fine on Render's free tier as long as the service is awake.

## Before this handles real patient data long-term

This setup is solid for a genuine small clinic's usage, but worth knowing:
- Free tiers can have occasional downtime/cold-starts — not ideal for a
  system people depend on daily without any paid safety net
  (Render Starter ~$7/mo removes the sleep issue, when it's affordable)
- Back up the Supabase data periodically (Supabase dashboard → Database →
  Backups, or export tables manually) in case anything goes wrong
- Review the PIN/password handling with someone who has security
  experience before this becomes the hospital's real system of record
