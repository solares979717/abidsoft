# Shafiq Medical & Diagnostic Center

Clinic management system. Next.js 15 (App Router) + TypeScript + Tailwind v4 + Supabase.

Main Road, Kala Kelay, Swat — 0341 4118069 · 0342 5851301

---

## Setup, start to finish

You need three free accounts: Supabase, GitHub, Vercel. Total time about 20 minutes.

### 1. Supabase

1. Create a new project at supabase.com. Pick a region close to Pakistan (Singapore or Frankfurt). Save the database password.
2. Open **SQL Editor → New query**. Paste the whole of `supabase/migrations/0001_init.sql` and run it.
3. New query again. Paste `supabase/seed.sql` and run it. This creates the clinic, both doctors and the starter catalogs.
4. Go to **Authentication → Users → Add user**. Create an account with your email and a password. Confirm the email.
5. Copy that user's UUID. Open SQL Editor and run:

```sql
insert into profiles (id, clinic_id, full_name, email, role)
values ('PASTE-USER-UUID', (select id from clinics limit 1),
        'Dr. Abid Ali Khan', 'your@email.com', 'admin');

update doctors set profile_id = 'PASTE-USER-UUID'
where full_name = 'Dr. Abid Ali Khan';
```

This step matters: without a `profiles` row the user has no clinic, and Row Level Security will correctly show them nothing.

6. **Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.

Storage buckets (`reports`, `documents`) are created by the migration. Nothing to do there.

### 2. GitHub

```bash
git init
git add .
git commit -m "feat: clinic management system"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/shafiq-clinic.git
git push -u origin main
```

`.gitignore` already excludes `.env`, `.env.local`, `node_modules` and `.next`. No secret is committed.

### 3. Vercel

1. vercel.com → **Add New → Project** → import the repository. Framework is detected as Next.js.
2. Add environment variables before deploying:

| Name | Value | Exposed to browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes, safe |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | yes, safe |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **no — server only** |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL | yes |

3. Deploy. Open the URL and sign in with the account from step 1.4.
4. Come back to `NEXT_PUBLIC_SITE_URL` and set it to the real deployed URL, then redeploy. Portal links use it.

### 4. Local development

```bash
cp .env.example .env.local     # fill in the same values
npm install
npm run dev                    # http://localhost:3000
```

---

## What is in here

```
supabase/
  migrations/0001_init.sql   30 tables, RLS on every one, indexes,
                             the save_visit transaction, global_search,
                             invoice recalculation trigger, storage buckets
  seed.sql                   clinic, 2 doctors, complaints, diagnoses,
                             medicines, lab and radiology catalogs
src/
  app/(app)/                 the 8 modules behind auth
  app/print/                 A5 prescription, A5 receipt, A4 visit summary
  app/portal/[token]/        public patient portal
  app/api/                   portal tokens, WhatsApp dispatch, assistant, CSV
  components/ui/             Button, Input, ChipGrid, StatusPill, Modal,
                             Toast, Accordion, SearchSelect, states
  components/consultation/   the 13-section consultation workspace
docs/design-system.md        tokens, type scale, component rules, QA checklist
```

## How the core workflow works

**New patient.** Dashboard → New patient. One screen: registration, history, allergies, lifestyle, complaint, vitals, examination, diagnosis, investigations, prescription, follow-up, billing. Press **Save visit** once. A single Postgres function writes the patient, the visit, every clinical child record, the prescription, the follow-up appointment, the invoice and the first payment in one transaction. If any part fails, nothing is written.

**Existing patient.** Search (⌘K) → open profile → **New visit**. Previous prescription appears with **Copy previous prescription**, which creates a new draft. The old prescription is never touched.

**Follow-up.** Pick 20 days, the exact date appears under the chip, and an appointment linked back to this visit is created on save.

**Billing.** Payments are an append-only ledger. A trigger recomputes paid, due and status. Nothing overwrites an earlier payment.

**Portal.** Generate a link with the specific items you want shared. Tokens are random, hashed in the database, expiring, and revocable. Private visit notes are not selected by the portal query at all, so they cannot leak.

## Security

- Row Level Security on every table, scoped by `clinic_id` via `is_clinic_member()`.
- `service_role` key never reaches the browser — it is used only in `/api/portal` and `/api/whatsapp`.
- Audit log records patient, visit, prescription, payment and portal actions.
- Soft deletes on patients, visits, prescriptions and invoices.

## Not finished

Honest list of what is architecture rather than a completed feature:

- **WhatsApp** — the queue table, dispatcher, status and retry are built; it needs provider credentials in `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` to actually send. Without them, messages are marked Failed with a retry, and nothing else is affected. There is no scheduled reminder cron yet — add a Vercel Cron hitting `/api/whatsapp` when you have a provider.
- **AI assistant** — intent routing over a fixed, read-only tool layer. It handles the four example commands (open profile, due, last prescription, last visits) without an LLM. To use a model, add `ANTHROPIC_API_KEY` and swap the matcher in `/api/assistant` for a tool-calling loop. The tool boundary is already there; the model never gets SQL.
- **Offline** — cloud-first PWA as specified. The shell is cached and offline is shown clearly. There is no offline write queue, and the app does not pretend otherwise.
- **Amend workflow** — historical records are protected and the schema has `status: 'Amended'` plus audit support, but the amend UI is not built. Editing history is currently not possible from the interface, which is the safe default.
- **Reports** — figures and tables are live; CSV export works; PDF export of reports is not built.

## Checks

```bash
npm run typecheck   # passes
npm run build       # passes
```

---

## Fixed after first real use (this build)

A working session with real patient data on Vercel surfaced 8 places where
the app queried a column name that didn't match the schema — each one made
that screen silently show nothing, with no visible error. A systematic
scan of every database query against the schema found all of them:

| Screen | What was broken | Fix |
|---|---|---|
| Consultation → Chief complaint | "Add other complaint" had no field to type the complaint name | Editable name input added |
| Consultation → Diagnosis / Investigations / Medicines | "Add new" failed silently if your account wasn't linked to a clinic, or the name already existed | Clear on-screen error; duplicates now select the existing entry instead of failing |
| Consultation → Doctor field | Empty dropdown with no explanation | Shows a direct message telling you what to check |
| Patient profile → Medical History / Allergies tab | Always empty (`recorded_at` vs `created_at`) | Fixed |
| Patient profile → Billing tab | Always empty (`status` column doesn't exist on invoices) | Fixed — status is now computed from paid/due |
| Billing module | Same as above, whole page showed "No invoices" regardless of data | Fixed |
| Dashboard → Pending follow-ups | Always showed 0 | Fixed |
| Printed prescription | Allergy warning never appeared (wrong lookup key) | Fixed — this was safety-relevant |
| Reports → CSV export | Export failed silently | Fixed |

None of these were database or security issues — the schema, RLS, and
`save_visit()` were correct throughout; these were application-code queries
using a column name the schema didn't have. `tsc --noEmit` and `next build`
both pass clean after the fix, and the full 22-test suite in `SETUP.sql`
still passes.

**If your doctor dropdown is empty or catalogs won't load right now**, the
most common cause is that your login user was never linked to the clinic.
Check: Supabase → Table Editor → `profiles` — you should see one row with
your `id` matching your Auth user and a `clinic_id` filled in. If that row
doesn't exist, go back to the "add your login" step above.

## Fixed after second round of real use

| Report | What was wrong | Fix |
|---|---|---|
| Patient portal opened via WhatsApp shows nothing | The "share" checkboxes sent labels like "Clinical Summary" but the database only accepts `summary`, `prescription`, `lab_report`, `imaging`, `bill` — every share failed silently, so no link ever had anything attached to show | Checkbox values now map correctly; a failed share also deletes the token instead of leaving a broken link |
| Page requires horizontal scrolling to see the right side | Result tables (billing, patients, appointments, dashboard, reports, prescriptions/investigations lists) had no horizontal scroll boundary of their own, so a wide table dragged the entire page sideways, sidebar and all | Every table now scrolls independently within its own box; the page itself no longer scrolls sideways |
| Opening a form section jumps back to the top of the page | Collapsing the previous section while a new one opened shifted the whole page, landing the browser's scroll position somewhere confusing | Opening a section now scrolls smoothly to exactly that section |
| Printed prescription / visit summary looked plain and cluttered | Cosmetic only — no data was wrong | Redesigned with clearer section headers, a boxed patient strip, better prescription formatting, and a highlighted follow-up date |
| No way back after opening a print page | `PrintFrame` had only a print button | A Back button was added next to it |
| Not sure why "Investigation charges" is pre-filled | Working as intended — it's the sum of the tests selected in Investigations, priced from Settings | Added a caption explaining this and pointing to Discount for adjusting the total per patient |

None of these needed a schema or security change.

## Fixed after third round of real use

**The big one:** several places in the app wrote status/type values in Title Case
("Waiting", "Report Uploaded") into database columns that only accept lowercase
snake_case ("waiting", "report_uploaded"). Postgres rejects a mismatched enum
value outright, so every one of these silently failed:

| Action | What was happening | Fix |
|---|---|---|
| Creating an appointment manually (Appointments → New appointment) | Insert was rejected every time — the button always failed | Fixed; error message now shows the real reason if it ever fails again |
| Changing an appointment's status (Waiting → In Consultation → Completed) | Update was rejected every time | Fixed |
| Changing an investigation's status or uploading a report | Update was rejected every time | Fixed |
| Patient profile → "Next appointment" | Always showed "—" even when a follow-up existed, because the check was looking for the wrong spelling of "scheduled" | Fixed |
| Dashboard → Waiting / In Consultation / Completed counts | Always showed 0 | Fixed |
| WhatsApp send status | Update was rejected (wrong status spelling, and a wrong column name) | Fixed |

A shared display helper now turns any of these values into a readable label
(`in_consultation` → `In Consultation`) automatically, so this class of bug
can't reappear from a spelling mismatch between two places in the code.

**Other fixes:**

- Investigation prices no longer feed into billing automatically. Settings → Investigations pricing is now a reference only; the doctor enters what to actually charge in the consultation's Billing section (with a one-click "Use ⟨catalog total⟩" button if they want the reference figure).
- Global search results now show an explicit "Open profile →" label instead of relying on the whole row being invisibly clickable.
- The Visits tab's ambiguous "PDF / Print" link is now labelled "Print visit summary" — this is the one document with complaint, diagnosis, investigations, prescription, follow-up and billing together, meant to be the single thing handed to the patient.
- Reverted an overly broad `overflow-x: hidden` added last round — it could clip content at the right edge of the screen instead of just containing wide tables, which likely caused the "layout is cut off" reports. Wide tables still scroll within their own box; the page itself no longer does.
- The patient profile and consultation workspace switch to their two-column layout at a lower screen width (1024px instead of 1280px), so it activates reliably on ordinary laptop screens.

## Module connectivity — what changed

The follow-up-to-appointment link was already correct at the database level
(verified by the acceptance tests), but the Appointments page defaulted to
"Day" view, so a follow-up scheduled weeks out never appeared unless you
navigated forward — it looked disconnected even though it wasn't.

- **New "Follow-ups due" view** on Appointments (`/appointments?view=followups`) — every upcoming follow-up, any date, in one place, oldest first, with overdue ones marked in red. This ignores the day/week/month range entirely.
- **Dashboard tiles are now links**: "Pending follow-ups" → the view above; "Today's appointments" → Appointments; "Outstanding due" → Billing.
- **"From visit" links** added wherever an appointment, prescription, investigation, or invoice was created as part of a visit — Appointments, the patient's own Appointments tab, Investigations, Prescriptions, and Billing all now link back to the visit that produced them, and the visit page links out to all of it. This is the "one connected record" the build brief asked for, made clickable in both directions instead of only implied by shared IDs in the database.
- Patient profile → "Next appointment" is now a link straight into that patient's Appointments tab.

## Tier 1 build — templates, WhatsApp reminders, and more real bugs found

**Prescription templates** — doctors can now save a prescription as a reusable
template from the consultation ("Save as template") and load it for future
patients with one click. Managed from Settings → Prescription templates.

**WhatsApp reminder engine** — this is now real, not just a schema table.
The moment an appointment is created (a follow-up from a visit, or a manual
one from the Appointments page), the database automatically queues a
reminder — but only if WhatsApp is turned on in Settings and the patient has
a phone number. Rescheduling an appointment cancels the old reminder and
queues a correctly-timed new one; cancelling the appointment cancels the
reminder too. A new scheduled job, `/api/cron/whatsapp`, runs every 15
minutes and actually sends what's due. **You must set a `CRON_SECRET`
environment variable** (any long random string, e.g. `openssl rand -hex 32`)
in Vercel for this to run — see `.env.example`.

**Four more real bugs found and fixed** by the same kind of systematic check
used before — this time scanning every `insert()`/`update()` call, not just
`select()`, since that's where these were hiding:

| Bug | Impact |
|---|---|
| Settings page saved the wrong column names | Saving Appointment Settings, WhatsApp settings, or Patient Portal settings has **never worked** — every save silently failed |
| Payment form sent "Cash"/"Online" | Recording a payment against an invoice has **never worked** |
| Document upload sent "Lab Report" instead of `lab_report` | The file uploaded to storage, but the record always failed to save — the Documents tab looked broken |
| Reports counted "Follow-up" instead of `follow_up` | "Returning patients" always showed 0 |

All four are now locked in as permanent regression tests inside `SETUP.sql`,
so they cannot silently reappear.

## Upgrading your existing database

Your database already has real patients in it, so **do not run `SETUP.sql` again** —
it refuses on purpose to protect your data. Instead, `supabase/UPGRADE_2_whatsapp_reminders.sql`
adds just the new WhatsApp reminder trigger system on its own.

Run it once: Supabase Dashboard -> SQL Editor -> New query -> paste the
whole file -> Run. It only adds new functions and triggers, touches zero
existing rows, and is safe to run more than once. It ends with a short
self-test that creates one throwaway patient and appointment, proves the
reminder queues and cancels correctly, then deletes everything it created —
your real data is never touched. Expected output ends with:

```
PASS  reminder queued automatically when the appointment was created
PASS  reminder cancels automatically with the appointment
UPGRADE APPLIED — WhatsApp reminders are now automatic
Test patient removed. Your real data was not touched.
```

## Automated test suite

`npm test` (or `npm run test`) runs 46 unit tests covering the pure logic
that's easy to get subtly wrong and hard to notice by eye: date/currency
formatting, the AI assistant's Roman Urdu/English text classifier, and the
HMAC signing that protects the assistant's confirm-before-mutate flow.

These aren't decorative — while writing them, two of the assistant's tests
immediately caught a real bug: the fallback classifier was picking common
English words like "outstanding" over an actual patient's name in some
phrasings. It's fixed now, and the test that catches it stays in place.
This suite is separate from `SETUP.sql`'s 26 database tests, which check the
schema, security, and business logic directly against Postgres — together
they cover both layers of the app.

## AI Assistant — now does something real

Previously the assistant only matched a handful of fixed keywords and could
never make any change, despite the confirm/cancel dialog already being built
into the interface. Now:

- If `ANTHROPIC_API_KEY` is set, the assistant calls Claude to understand the
  request in English or Roman Urdu. Without a key — or if the call ever
  fails — it falls back to the improved keyword matcher automatically; the
  assistant never stops working because of an AI outage.
- It can now action one real change: "Afsar ka number 03001234567 update
  karo" shows a confirm card with the old and new number side by side.
  Nothing is written until Confirm is pressed. The confirmation is signed
  server-side, re-checks the record hasn't changed in the meantime, and
  goes through Row Level Security like any other write — verified directly
  against the database, including the audit log entry it leaves behind.

## Fixed: rail still cut off on the right

Root cause found: `grid-cols-[1fr_280px]` used a bare `1fr` for the main
content column. CSS Grid's `1fr` track can still grow past its share if
something inside has a wide unbroken minimum width — a long diagnosis list
in the Visits tab was enough to push the whole 280px rail off the right
edge of the screen. This is a well-known CSS Grid gotcha; the fix is
`minmax(0,1fr)` instead of `1fr`, which lets that column actually shrink.
Applied to both places this layout is used (patient profile and the
consultation workspace), plus a scroll-safety net so if anything unusual
ever still doesn't fit, that one section scrolls instead of clipping.

## Deleting your own test patients

`supabase/DELETE_test_patient.sql` removes exactly one patient by their
PAT-ID and everything that belongs only to them (visits, prescriptions,
investigations, appointments, billing, documents) — nothing else is
touched. Edit the PAT-ID at the top of the file, then run it in the SQL
Editor. Verified against a database with a second, unrelated patient
present, confirming their data is completely untouched by the deletion.

## How to tell if a deployment actually picked up new code

The bottom of the sidebar now shows a small `build 2026-08-29.5` marker.
Every time new code is shipped, this string changes. Before reporting that
something "still isn't fixed," check this marker first — most of the
back-and-forth in earlier rounds turned out to be Vercel not having
redeployed yet, not the fix being wrong. If the marker matches what you
were told to expect and the problem is still there, it's a real bug worth
reporting with a screenshot.

## Layout hardened further

Added `min-w-0` on the main content column in both the patient profile and
the consultation workspace, on top of last round's `minmax(0,1fr)` grid
fix — belt-and-suspenders against the same class of CSS Grid sizing bug,
in case any deeply nested element ever asserts its own minimum width again.

## Rounds 1 and 2 — what was added

**Appointments**
- Opens on **Upcoming** — every appointment from now on, soonest first, so a
  follow-up booked weeks ahead is visible without hunting for it.
- Tabs: Upcoming · Today · Week · Month · Follow-ups · **Missed** (booked, the
  time passed, never marked seen — worth a phone call).
- **Phone bookings**: "Someone new" takes just a name and number for a caller
  who isn't registered yet. It shows as *not registered*, and
  "Register & start visit" opens the consultation prefilled; saving registers
  them and attaches the booking to the new patient in one transaction.

**Dashboard**
- **Follow-ups due** — who should be coming back, overdue ones in red.
- **Today's money** — cash, online, collected and billed, for closing the register.
- Missed-appointment count, linked to that view.

**Consultation**
- **Last visit panel** at the top: previous diagnosis, medicines and tests,
  without leaving the form.
- Saving goes straight to the prescription, which has Print and Send on WhatsApp.

**Billing**
- Dues sorted **oldest first**, with age shown (amber past 30 days, red past 60).
- **Remind** button per due — opens WhatsApp with the amount and invoice number.

**Backup and storage**
- Nightly backup of every table as CSV, delivered to `BACKUP_WEBHOOK_URL`.
  Settings → Backup also downloads one on demand.
- Settings → **Storage** shows database and file usage against the free-tier
  limits, warning past 80%.
- **Images are compressed before upload** — a 5 MB phone photo of an X-ray
  becomes roughly 500 KB, so the 1 GB file limit lasts years rather than months.
- **Recycle bin**: soft-deleted records keep a deletion time and can be
  restored for 30 days.

Requires `supabase/UPGRADE_3.sql` to be run once on an existing database.

## Database setup — one file

Run **`supabase/SETUP.sql`** once, on a new and empty Supabase project:
Dashboard -> SQL Editor -> New query -> paste the whole file -> Run.

It creates the schema, seeds the doctors and catalogs, creates the storage
buckets, then runs 22 tests and deletes all of its own test data. The last
line should read `ALL TESTS PASSED - database is clean and ready`. If any
line says FAIL, stop and do not enter real patients.

Running it a second time is refused with a clear message, so it cannot
damage a database that already holds records. The separate files under
`supabase/migrations/`, `supabase/seed.sql` and `supabase/tests/` are the
same content split up, for when you need to run a piece on its own.

## Verification performed on this build

The schema was executed against PostgreSQL 16 and exercised with a scripted
consultation before shipping. Confirmed working:

| Check | Result |
|---|---|
| `0001_init.sql` runs clean on an empty database | pass |
| `seed.sql` runs clean after it (2 doctors, 20 medicines, 18 diagnoses, 27 tests, 14 complaints) | pass |
| New patient gets `PAT-000001`, numbers never reused | pass |
| `save_visit()` writes patient + visit + history + allergies + vitals + exam + diagnoses + investigations + prescription + follow-up + appointment + invoice + payment in one transaction | pass |
| 20-day follow-up from 20 Sep 2026 creates an appointment on 10 Oct 2026 | pass |
| Billing arithmetic: 500 fee + 600 lab − 100 discount = 1000 net, 600 paid, 400 due | pass |
| Second visit leaves the first prescription byte-for-byte unchanged | pass |
| Copy-previous-prescription creates a new row with `copied_from_id` set | pass |
| Payment history append-only; `paid_total` always recomputed from `payments` | pass |
| Online payment without a reference number is rejected by a CHECK constraint | pass |
| Discount larger than charges is rejected by the RPC | pass |
| Audit rows written for patient, visit, prescription, payment, document, portal link | pass |
| `global_search('Afsar')` returns the patient with visit/Rx/lab counts and Rs 400 due | pass |
| `tsc --noEmit` | 0 errors |
| `next build` (production) | 22 routes compiled |

Not yet verified against a live Supabase instance, because that needs your
project credentials: RLS behaviour under a real JWT, Storage uploads, and the
WhatsApp provider call. Run TEST 27 (cross-clinic isolation) after you create
your project — instructions are in `docs/design-system.md` §10 and the test
list in your build brief.

---

## Security model

- **Row Level Security on all 34 tables.** The browser holds only the `anon`
  key; every row it can reach is filtered by the signed-in user's `clinic_id`.
  Signed out, the key returns nothing at all.
- **No privilege escalation.** A user cannot move themselves into another
  clinic or change their own role, and a record cannot be moved between
  clinics after it is created.
- **Patient IDs are permanent** and finalized prescriptions cannot be edited
  in place — copy creates a new prescription with the lineage recorded.
- **The audit trail is append only.** Nobody, including an admin, can delete
  or alter it through the API.
- **Portal links** carry a 256-bit random token, stored only as a SHA-256
  hash, scoped to one patient of one clinic, expiring and revocable. Private
  visit notes are never read by the portal.
- **The service-role key stays on the server.** It is used in exactly one
  file and never imported into a client component.

Both test suites below were run against PostgreSQL 16 as the `authenticated`
role — not as the table owner, which would bypass RLS and make every check
pass for the wrong reason.

## Running the acceptance tests

`supabase/tests/acceptance.sql` exercises a full consultation end to end and
raises an exception on any failure, so a clean run means everything passed.

Run it in the Supabase SQL Editor **after** the migration, the seed, and the
`profiles` row from step 2 above. Use a scratch project or a copy of the
database — it creates a test patient. Expected output:

```
PASS  catalogs seeded
PASS  patient number PAT-000001 allocated
PASS  complaint, diagnosis, investigation, vitals, prescription all written
PASS  20-day follow-up appointment created for 10 Oct 2026
PASS  billing 1100 - 100 = 1000 net, 600 paid, 400 due
PASS  history immutable, copy creates a new prescription with lineage
PASS  two visits, two prescriptions, two invoices under one patient
PASS  payment history preserved with online reference
PASS  search returns 1 patient(s)
PASS  doctor attribution and audit trail (9 rows)
PASS  online payment requires a reference number
PASS  discount guard: Discount cannot be more than the total charges
PASS  soft-delete columns present on clinical and financial tables
ALL ACCEPTANCE TESTS PASSED
```

Then run `supabase/tests/security.sql` the same way. It creates a decoy second
clinic, proves it is completely invisible, and deletes it again:

```
PASS  another clinic's patients are invisible
PASS  another clinic record is invisible
PASS  writing into another clinic is blocked
PASS  clinic_id escalation blocked
PASS  records cannot be moved between clinics
PASS  patient ID cannot be rewritten
PASS  finalized prescriptions cannot be edited in place
PASS  audit trail cannot be deleted
PASS  portal links are confined to the clinic's own patients
ALL SECURITY TESTS PASSED
```

If any line says FAIL, stop and do not enter real patients until it is fixed.
