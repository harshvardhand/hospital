# Deploying Kalpana Hospital (Render + Supabase)

The app picks its storage automatically:
- `SUPABASE_URL` set  -> data lives in Supabase (use this when hosted)
- `SUPABASE_URL` empty -> local JSON files in `data/` (use this on your PC)

## 1. Supabase (database)
1. supabase.com -> New project (free).
2. SQL Editor -> New query -> paste all of `supabase-schema.sql` -> Run.
3. Project Settings -> API -> copy the **Project URL** and the **service_role** key
   (NOT the anon key; the anon key is blocked and makes every login fail).

## 2. Copy your existing data (optional, one time)
On your PC, put the two values in `.env` (see `.env.example`), then:

    npm install
    npm run migrate

This copies `data/patients.json` and `data/appointments.json` into Supabase so existing
patient PINs keep working. Without it the hosted patient table starts empty and every
patient login fails.

## 3. Render (server)
New + -> Web Service -> pick the GitHub repo.
Build Command `npm install`, Start Command `npm start`.
Environment variables:

| Key | Value |
|---|---|
| `STAFF_PASSWORD` | strong staff password |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_KEY` | service_role key |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, for push notifications (all three or none) |

Do NOT upload `.env` to GitHub; it is in `.gitignore`.

## 4. If login fails, read the message
| Message | Meaning |
|---|---|
| Staff sign-in is not configured | `STAFF_PASSWORD` missing on the host |
| Invalid staff ID or password | wrong password, or ID not `drnikhil` / `drshubhangi` / `staff_admin` |
| The request could not be completed | Supabase problem: wrong key, schema not run, or wrong URL. Check the Render logs |
| Patient name or PIN is incorrect (for everyone) | patients table empty: run step 2 |

The Render log prints `Storage: Supabase database.` on start. If it says
`local JSON files`, the Supabase variables did not reach the server.

## Known limits
- Push-notification subscriptions are still kept in a local file, so staff must
  re-enable notifications after Render restarts the service.
- Render's free tier sleeps after 15 minutes idle; the first request takes ~30-50 s.
