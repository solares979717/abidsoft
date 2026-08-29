# START HERE — Fresh Deployment

Shafiq Medical & Diagnostic Center — clinic management software.
Follow these five steps in order. Nothing else is needed.

---

## 1. Create the database (Supabase)

1. Go to **supabase.com** → sign in → **New project**
2. Give it any name, pick a strong database password, choose the region
   closest to Pakistan (Singapore or Frankfurt)
3. Wait ~2 minutes for it to finish setting up
4. Open **SQL Editor** (left sidebar) → **New query**
5. Open the file `supabase/SETUP.sql` from this folder, copy **everything**,
   paste it in, and press **Run**

The last lines of the output must say:

```
ALL TESTS PASSED — database is clean and ready
Patients: 0   Doctors: 2   Medicines: 20
```

If any line says FAIL, stop here and report it. Don't continue.

---

## 2. Create your login

1. In Supabase, go to **Authentication** → **Users** → **Add user**
   → **Create new user**
2. Enter your email and a password. Turn ON "Auto Confirm User"
3. Click the user you just created and **copy their UID** (a long
   id like `a1b2c3d4-...`)
4. Go back to **SQL Editor** → **New query**, paste the query below,
   replace `PASTE-YOUR-UID-HERE` and the email with your own, then **Run**:

```sql
insert into profiles (id, clinic_id, full_name, email, role, doctor_id)
select 'PASTE-YOUR-UID-HERE',
       c.id,
       'Dr. Abid Ali Khan',
       'your-email@example.com',
       'admin',
       d.id
from clinics c
left join doctors d on d.clinic_id = c.id and d.full_name = 'Dr. Abid Ali Khan'
limit 1;
```

**This step is not optional.** Without it you can log in, but every screen
will be empty — the doctor dropdown, the patient list, everything. That is
the security system working correctly, not a bug.

---

## 3. Get your keys

In Supabase: **Settings** → **API keys**. You need three values:

| What to copy | Where it is |
|---|---|
| Project URL | Settings → API (looks like `https://xxxx.supabase.co`) |
| Publishable key | starts with `sb_publishable_...` |
| Secret key | starts with `sb_secret_...` (click the eye icon to reveal) |

Keep this tab open for the next step.

---

## 4. Put the code on GitHub

1. Go to **github.com** → **New repository** → give it a name → **Create**
2. On the new empty repository page, click **"uploading an existing file"**
3. Open this folder on your computer, select **everything inside it**
   (Ctrl+A), and drag it into the browser window
4. Wait for all files to finish uploading
5. Scroll down, type anything in the message box, click **Commit changes**

---

## 5. Deploy (Vercel)

1. Go to **vercel.com** → sign in with GitHub → **Add New** → **Project**
2. Find the repository you just made → **Import**
3. Before clicking Deploy, open **Environment Variables** and add these five:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_...` key |
| `SUPABASE_SERVICE_ROLE_KEY` | your `sb_secret_...` key |
| `NEXT_PUBLIC_SITE_URL` | leave blank for now, fill in after step 4 below |
| `CRON_SECRET` | any long random text you make up |

⚠️ The secret key must go in `SUPABASE_SERVICE_ROLE_KEY` only. Never put it
in a name starting with `NEXT_PUBLIC_` — anything with that prefix is
visible to the whole internet.

4. Click **Deploy** and wait ~2 minutes
5. Copy the URL it gives you (like `https://your-app.vercel.app`), go back to
   **Settings → Environment Variables**, put it in `NEXT_PUBLIC_SITE_URL`,
   then **Deployments** → ⋯ → **Redeploy**

---

## Check it worked

Open your Vercel URL and log in with the email/password from step 2.

At the **bottom of the left sidebar** you should see a small grey line:

```
build 2026-08-29.6
```

If that line is there, the latest code is live. Whenever you report a
problem later, check this line first — if it shows an older number, the
deployment simply hasn't updated yet, and the problem isn't in the code.

Then try one full patient: register them, add a diagnosis, a prescription,
set a follow-up, complete the billing, and save. Then open their profile and
check every tab.

---

## Optional extras

- **AI Assistant**: add `ANTHROPIC_API_KEY` in Vercel. Without it, the
  assistant still works using keyword matching.
- **WhatsApp reminders**: turn WhatsApp on in Settings → WhatsApp, and add
  `WHATSAPP_API_URL` and `WHATSAPP_API_TOKEN` from your WhatsApp Business
  API provider. Reminders queue automatically either way; they only actually
  send once these are set.

Full technical detail is in `README.md`.
