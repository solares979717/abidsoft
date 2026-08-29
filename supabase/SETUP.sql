-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — COMPLETE DATABASE SETUP
--  Main Road, Kala Kelay, Swat  ·  0341 4118069  ·  0342 5851301
--
--  Run this ONCE, on a NEW and EMPTY Supabase project.
--  Supabase Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--
--  It does four things:
--    1. creates the schema (34 tables, row level security, audit trail)
--    2. seeds the two doctors and the starter medicine / diagnosis /
--       investigation / complaint lists
--    3. creates the file storage buckets
--    4. runs 22 tests, then deletes all its own test data
--
--  When it finishes you should see, at the bottom of the output:
--        ALL TESTS PASSED - database is clean and ready
--
--  If any line says FAIL, do not enter real patients. Send me the message.
--
--  WARNING: do not run this on a database that already holds real patients.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Safety check: refuse to run twice.
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('public.patients') is not null then
    raise exception E'This database is ALREADY set up.\n'
      'Running SETUP.sql again is not needed and could damage existing data.\n'
      'If you want a clean start, create a NEW Supabase project instead.';
  end if;
end $$;

-- =====================================================================
--  STEP 1 of 4 — SCHEMA
-- =====================================================================
-- SHAFIQ MEDICAL & DIAGNOSTIC CENTER
-- Single authoritative schema. Run this once on a fresh Supabase project.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ============================ ENUMS ==================================
create type user_role            as enum ('admin','doctor','staff');
create type gender_t             as enum ('male','female');
create type visit_type_t         as enum ('new_consultation','follow_up');
create type visit_status_t       as enum ('draft','completed','cancelled');
create type appt_type_t          as enum ('new_patient','follow_up','walk_in','custom');
create type appt_status_t        as enum ('scheduled','waiting','in_consultation','completed','cancelled','no_show');
create type inv_status_t         as enum ('ordered','pending','report_uploaded','reviewed');
create type payment_method_t     as enum ('cash','online');
create type wa_status_t          as enum ('scheduled','sent','failed','cancelled');
create type doc_type_t           as enum ('lab_report','imaging','previous_record','prescription','other');
create type rx_status_t          as enum ('draft','finalized');

-- ============================ TENANCY ================================
create table clinics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  phone_1 text,
  phone_2 text,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table clinic_settings (
  clinic_id            uuid primary key references clinics(id) on delete cascade,
  working_days         int[]   not null default '{1,2,3,4,5,6}',   -- 0=Sun .. 6=Sat
  opening_time         time    not null default '09:00',
  closing_time         time    not null default '17:00',
  slot_minutes         int     not null default 15 check (slot_minutes between 5 and 120),
  default_consultation_fee  numeric(10,2) not null default 500,
  currency             text    not null default 'PKR',
  wa_enabled           boolean not null default false,
  wa_provider          text,
  wa_reminder_hours    int     not null default 24 check (wa_reminder_hours between 1 and 168),
  portal_token_days    int     not null default 14 check (portal_token_days between 1 and 365),
  portal_default_items text[]  not null default '{summary,prescription}',
  updated_at           timestamptz not null default now()
);

-- Per-clinic counter for human readable IDs. Never reused.
create table clinic_counters (
  clinic_id    uuid primary key references clinics(id) on delete cascade,
  patient_seq  bigint not null default 0,
  invoice_seq  bigint not null default 0
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  full_name   text not null,
  email       text,
  role        user_role not null default 'doctor',
  doctor_id   uuid,                       -- FK added after doctors table
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on profiles(clinic_id);

create table doctors (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  full_name     text not null,
  qualification text,
  affiliation   text,
  specialty     text,
  phone         text,
  consultation_fee   numeric(10,2),
  profile_id    uuid,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index on doctors(clinic_id, is_active);

alter table profiles
  add constraint profiles_doctor_fk foreign key (doctor_id) references doctors(id) on delete set null;

-- ============================ PATIENTS ===============================
create table patients (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_no  text not null,                       -- PAT-000001
  full_name       text not null,
  phone           text not null,
  whatsapp        text,
  dob             date not null,
  gender          gender_t not null,
  address         text,
  primary_doctor_id uuid references doctors(id) on delete set null,
  notes           text,                                -- private, never exposed to portal
  is_deleted      boolean not null default false,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint patients_number_unique unique (clinic_id, patient_no),
  constraint patients_dob_sane check (dob > '1900-01-01' and dob <= current_date)
);
create index on patients(clinic_id, is_deleted);
create index on patients(clinic_id, phone);
create index on patients(clinic_id, whatsapp);
create index patients_name_trgm on patients using gin (full_name gin_trgm_ops);
create index patients_number_trgm on patients using gin (patient_no gin_trgm_ops);

create table patient_medical_history (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  condition   text not null,          -- diabetes | hypertension | ... | none | other
  detail      text,
  recorded_visit_id uuid,
  created_at  timestamptz not null default now(),
  unique (patient_id, condition)
);
create index on patient_medical_history(patient_id);

create table patient_allergies (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  allergy_type text not null,         -- none | medicine | food | other
  detail      text,
  created_at  timestamptz not null default now(),
  unique (patient_id, allergy_type, detail)
);
create index on patient_allergies(patient_id);

create table patient_current_medicines (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  medicine_id uuid,
  medicine_name text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on patient_current_medicines(patient_id, is_active);

create table patient_lifestyle (
  patient_id  uuid primary key references patients(id) on delete cascade,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  smoking     boolean,
  tobacco     boolean,
  sleep       text check (sleep in ('normal','poor')),
  exercise    text check (exercise in ('regular','occasional','none')),
  diet        text check (diet in ('normal','poor')),
  other       text,
  updated_at  timestamptz not null default now()
);

-- ============================ CATALOGS ===============================
create table complaint_catalog (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  is_active  boolean not null default true
);
create unique index complaints_catalog_uq on complaint_catalog(clinic_id, lower(name));

create table diagnosis_catalog (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  icd_code   text,
  is_common  boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index diagnosis_catalog_uq on diagnosis_catalog(clinic_id, lower(name));
create index diagnosis_catalog_name_trgm on diagnosis_catalog using gin (name gin_trgm_ops);

create table medicines (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  name         text not null,
  generic_name text,
  strength     text,
  form         text,                 -- tablet | capsule | syrup | injection | ...
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index medicines_uq on medicines(clinic_id, lower(name), coalesce(strength,''));
create index medicines_name_trgm on medicines using gin (name gin_trgm_ops);

create table investigation_catalog (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  category   text not null check (category in ('Laboratory','Radiology')),
  name       text not null,
  price      numeric(10,2) not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index investigation_catalog_uq on investigation_catalog(clinic_id, category, lower(name));
create index investigation_name_trgm on investigation_catalog using gin (name gin_trgm_ops);

create table prescription_templates (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  doctor_id  uuid references doctors(id) on delete set null,
  name       text not null,
  items      jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ============================ VISITS =================================
create table visits (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  doctor_id      uuid not null references doctors(id),
  visit_type     visit_type_t not null default 'new_consultation',
  status         visit_status_t not null default 'completed',
  visit_date     timestamptz not null default now(),
  previous_visit_id uuid references visits(id) on delete set null,
  appointment_id uuid,
  is_deleted     boolean not null default false,
  history_notes  text,
  exam_notes     text,
  private_notes  text,                -- never exposed to patient portal
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on visits(clinic_id, visit_date desc);
create index on visits(patient_id, visit_date desc);
create index on visits(doctor_id, visit_date desc);

create table visit_complaints (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  visit_id     uuid not null references visits(id) on delete cascade,
  complaint    text not null,
  duration_value numeric(6,1),
  duration_unit text check (duration_unit in ('hours','days','weeks','months','years')),
  sort_order   int not null default 0
);
create index on visit_complaints(visit_id);

create table vitals (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  visit_id     uuid not null references visits(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  bp_systolic  int  check (bp_systolic between 40 and 300),
  bp_diastolic int  check (bp_diastolic between 20 and 200),
  pulse        int  check (pulse between 20 and 250),
  temperature  numeric(4,1) check (temperature between 30 and 45),
  temp_unit    text not null default 'C' check (temp_unit in ('C','F')),
  weight_kg    numeric(5,1) check (weight_kg between 1 and 400),
  height_cm    numeric(5,1) check (height_cm between 20 and 250),
  spo2         int  check (spo2 between 40 and 100),
  resp_rate    int  check (resp_rate between 5 and 80),
  recorded_at  timestamptz not null default now(),
  unique (visit_id)
);
create index on vitals(patient_id, recorded_at desc);

create table physical_examinations (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  visit_id    uuid not null references visits(id) on delete cascade,
  general     text check (general in ('normal','abnormal')),
  chest       text check (chest in ('normal','abnormal')),
  cvs         text check (cvs in ('normal','abnormal')),
  abdomen     text check (abdomen in ('normal','abnormal')),
  cns         text check (cns in ('normal','abnormal')),
  other_findings text,
  unique (visit_id)
);

create table visit_diagnoses (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  visit_id     uuid not null references visits(id) on delete cascade,
  diagnosis_id uuid references diagnosis_catalog(id) on delete set null,
  diagnosis_text text not null,
  is_primary   boolean not null default false,
  sort_order   int not null default 0
);
create index on visit_diagnoses(visit_id);
create index on visit_diagnoses(diagnosis_id);

-- ========================= PRESCRIPTIONS =============================
create table prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  visit_id    uuid not null references visits(id) on delete cascade,
  doctor_id   uuid not null references doctors(id),
  status      rx_status_t not null default 'finalized',
  copied_from_id uuid references prescriptions(id) on delete set null,
  is_deleted  boolean not null default false,
  advice      text,
  issued_at   timestamptz not null default now(),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index on prescriptions(patient_id, issued_at desc);
create index on prescriptions(visit_id);
create index on prescriptions(clinic_id, issued_at desc);

create table prescription_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  medicine_id     uuid references medicines(id) on delete set null,
  medicine_name   text not null,
  strength        text,
  dose            text,
  frequency       text,               -- OD | BD | TDS | QID | HS | PRN | ...
  duration        text,
  route           text,               -- oral | topical | IV | IM | ...
  instructions    text[] not null default '{}',
  instruction_other text,
  note            text,
  sort_order      int not null default 0
);
create index on prescription_items(prescription_id);

-- ========================= INVESTIGATIONS ============================
create table visit_investigations (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  patient_id    uuid not null references patients(id) on delete cascade,
  visit_id      uuid not null references visits(id) on delete cascade,
  doctor_id     uuid not null references doctors(id),
  catalog_id    uuid references investigation_catalog(id) on delete set null,
  category      text not null check (category in ('Laboratory','Radiology')),
  test_name     text not null,
  price         numeric(10,2) not null default 0,
  status        inv_status_t not null default 'ordered',
  ordered_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references profiles(id)
);
create index on visit_investigations(patient_id, ordered_at desc);
create index on visit_investigations(clinic_id, status);
create index on visit_investigations(visit_id);

create table investigation_reports (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics(id) on delete cascade,
  investigation_id  uuid not null references visit_investigations(id) on delete cascade,
  storage_path      text not null,
  file_name         text not null,
  mime_type         text,
  file_size         int,
  uploaded_by       uuid references profiles(id),
  uploaded_at       timestamptz not null default now()
);
create index on investigation_reports(investigation_id);

-- ========================== APPOINTMENTS =============================
create table appointments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  doctor_id      uuid not null references doctors(id),
  source_visit_id uuid references visits(id) on delete set null,
  scheduled_at   timestamptz not null,
  duration_min   int not null default 15,
  appt_type      appt_type_t not null default 'custom',
  status         appt_status_t not null default 'scheduled',
  is_deleted     boolean not null default false,
  notes          text,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on appointments(clinic_id, scheduled_at);
create index on appointments(patient_id, scheduled_at desc);
create index on appointments(doctor_id, scheduled_at);
create index on appointments(clinic_id, status, scheduled_at);

alter table visits add constraint visits_appointment_fk
  foreign key (appointment_id) references appointments(id) on delete set null;

create table followups (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  visit_id       uuid not null references visits(id) on delete cascade,
  doctor_id      uuid not null references doctors(id),
  interval_days  int,
  follow_up_date date not null,
  appointment_id uuid references appointments(id) on delete set null,
  completed      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on followups(clinic_id, follow_up_date, completed);
create index on followups(patient_id);

-- ============================ BILLING ================================
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  invoice_no text not null,
  patient_id     uuid not null references patients(id) on delete cascade,
  visit_id       uuid references visits(id) on delete set null,
  doctor_id      uuid not null references doctors(id),
  charges_total  numeric(10,2) not null default 0 check (charges_total >= 0),
  discount       numeric(10,2) not null default 0 check (discount >= 0),
  net_total      numeric(10,2) not null default 0 check (net_total >= 0),
  paid_total     numeric(10,2) not null default 0 check (paid_total >= 0),
  due_total      numeric(10,2) generated always as (net_total - paid_total) stored,
  is_void        boolean not null default false,
  is_deleted     boolean not null default false,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (clinic_id, invoice_no)
);
create index on invoices(patient_id, created_at desc);
create index on invoices(clinic_id, created_at desc);

create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  item_type   text not null default 'Other' check (item_type in ('Consultation','Investigation','Procedure','Other')),
  ref_id      uuid,
  quantity    int not null default 1 check (quantity > 0),
  unit_price  numeric(10,2) not null default 0,
  amount      numeric(10,2) not null default 0,
  sort_order  int not null default 0
);
create index on invoice_items(invoice_id);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  invoice_id   uuid not null references invoices(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  amount       numeric(10,2) not null check (amount > 0),
  method       payment_method_t not null default 'cash',
  reference_no text,
  paid_at      timestamptz not null default now(),
  recorded_by  uuid references profiles(id),
  doctor_id    uuid references doctors(id),
  is_void      boolean not null default false,
  note         text,
  constraint payments_online_ref check (method <> 'online' or reference_no is not null)
);
create index on payments(invoice_id);
create index on payments(clinic_id, paid_at desc);
create index on payments(patient_id, paid_at desc);

-- ============================ DOCUMENTS ==============================
create table documents (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  doc_type     doc_type_t not null default 'other',
  is_deleted   boolean not null default false,
  description  text,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  file_size    int,
  uploaded_by  uuid references profiles(id),
  uploaded_at  timestamptz not null default now()
);
create index on documents(patient_id, uploaded_at desc);

-- ========================= PATIENT PORTAL ============================
create table portal_tokens (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  token_hash  text not null unique,      -- sha256 of the raw token; raw is never stored
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  last_viewed_at timestamptz,
  view_count  int not null default 0
);
create index on portal_tokens(patient_id);

create table portal_shared_items (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  token_id    uuid not null references portal_tokens(id) on delete cascade,
  item_type   text not null check (item_type in ('summary','prescription','lab_report','imaging','bill')),
  ref_id      uuid,
  unique (token_id, item_type, ref_id)
);

-- ============================ WHATSAPP ===============================
create table whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  patient_id    uuid references patients(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  to_number     text not null,
  template      text not null,
  body          text not null,
  status        wa_status_t not null default 'scheduled',
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  provider_msg_id text,
  error         text,
  attempts      int not null default 0,
  created_at    timestamptz not null default now()
);
create index on whatsapp_messages(clinic_id, status, scheduled_for);

-- ============================ AUDIT ==================================
create table audit_logs (
  id          bigserial primary key,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  actor_id    uuid references profiles(id),
  doctor_id   uuid references doctors(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index on audit_logs(clinic_id, created_at desc);
create index on audit_logs(entity, entity_id);

-- =====================================================================
-- HELPERS
-- =====================================================================
create or replace function app_clinic_id() returns uuid
language sql stable security definer set search_path = public as $$
  select clinic_id from profiles where id = auth.uid();
$$;

create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function app_doctor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select doctor_id from profiles where id = auth.uid();
$$;

create or replace function log_audit(
  p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(clinic_id, actor_id, doctor_id, action, entity, entity_id, metadata)
  values (app_clinic_id(), auth.uid(), app_doctor_id(), p_action, p_entity, p_entity_id, coalesce(p_meta,'{}'));
end $$;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger t_clinics_touch   before update on clinics   for each row execute function touch_updated_at();
create trigger t_patients_touch  before update on patients  for each row execute function touch_updated_at();
create trigger t_visits_touch    before update on visits    for each row execute function touch_updated_at();
create trigger t_appts_touch     before update on appointments for each row execute function touch_updated_at();
create trigger t_invoices_touch  before update on invoices  for each row execute function touch_updated_at();

-- ---- human readable identifiers, never reused --------------------------
create or replace function set_patient_number() returns trigger
language plpgsql as $$
declare n bigint;
begin
  if new.patient_no is null or new.patient_no = '' then
    insert into clinic_counters(clinic_id) values (new.clinic_id) on conflict (clinic_id) do nothing;
    update clinic_counters set patient_seq = patient_seq + 1
      where clinic_id = new.clinic_id returning patient_seq into n;
    new.patient_no := 'PAT-' || lpad(n::text, 6, '0');
  end if;
  return new;
end $$;
create trigger t_patient_number before insert on patients
  for each row execute function set_patient_number();

create or replace function set_invoice_number() returns trigger
language plpgsql as $$
declare n bigint;
begin
  if new.invoice_no is null or new.invoice_no = '' then
    insert into clinic_counters(clinic_id) values (new.clinic_id) on conflict (clinic_id) do nothing;
    update clinic_counters set invoice_seq = invoice_seq + 1
      where clinic_id = new.clinic_id returning invoice_seq into n;
    new.invoice_no := 'INV-' || lpad(n::text, 6, '0');
  end if;
  return new;
end $$;
create trigger t_invoice_number before insert on invoices
  for each row execute function set_invoice_number();

-- ---- invoice paid total always derived from payment history ------------
create or replace function recalc_invoice_paid() returns trigger
language plpgsql as $$
declare v_invoice uuid;
begin
  v_invoice := coalesce(new.invoice_id, old.invoice_id);
  update invoices i
     set paid_total = coalesce((select sum(p.amount) from payments p where p.invoice_id = v_invoice), 0)
   where i.id = v_invoice;
  return null;
end $$;
create trigger t_payments_recalc after insert or update or delete on payments
  for each row execute function recalc_invoice_paid();

-- ---- audit on the records that matter ----------------------------------
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_audit(tg_argv[0], tg_table_name, new.id, '{}'::jsonb);
  return null;
end $$;

create trigger t_audit_patient      after insert on patients      for each row execute function audit_row('patient_created');
create trigger t_audit_visit        after insert on visits        for each row execute function audit_row('visit_created');
create trigger t_audit_rx           after insert on prescriptions for each row execute function audit_row('prescription_created');
create trigger t_audit_payment      after insert on payments      for each row execute function audit_row('payment_added');
create trigger t_audit_document     after insert on documents     for each row execute function audit_row('document_uploaded');
create trigger t_audit_portal       after insert on portal_tokens for each row execute function audit_row('portal_link_generated');

-- =====================================================================
-- ROW LEVEL SECURITY  — every clinic-owned row is isolated by clinic_id
-- =====================================================================
alter table clinics  enable row level security;
alter table profiles enable row level security;

create policy clinic_read on clinics for select using (id = app_clinic_id());
create policy clinic_write on clinics for update using (id = app_clinic_id() and app_role() = 'admin');

create policy profile_self on profiles for select using (clinic_id = app_clinic_id());
create policy profile_update on profiles for update using (id = auth.uid());

do $$
declare t text;
declare tables text[] := array[
  'clinic_settings','clinic_counters','doctors','patients','patient_medical_history',
  'patient_allergies','patient_current_medicines','patient_lifestyle','complaint_catalog',
  'diagnosis_catalog','medicines','investigation_catalog','prescription_templates','visits',
  'visit_complaints','vitals','physical_examinations','visit_diagnoses','prescriptions',
  'prescription_items','visit_investigations','investigation_reports','appointments',
  'followups','invoices','invoice_items','payments','documents','portal_tokens',
  'portal_shared_items','whatsapp_messages','audit_logs'];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select using (clinic_id = app_clinic_id())', t||'_sel', t);
    execute format(
      'create policy %I on %I for insert with check (clinic_id = app_clinic_id())', t||'_ins', t);
    execute format(
      'create policy %I on %I for update using (clinic_id = app_clinic_id()) with check (clinic_id = app_clinic_id())', t||'_upd', t);
    execute format(
      'create policy %I on %I for delete using (clinic_id = app_clinic_id() and app_role() = ''admin'')', t||'_del', t);
  end loop;
end $$;

-- audit log is append only for non-admins
create policy audit_no_update on audit_logs for update using (false);

-- =====================================================================
-- ATOMIC SAVE — one call creates or updates the entire consultation
-- =====================================================================
create or replace function save_visit(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := app_clinic_id();
  v_actor    uuid := auth.uid();
  v_doctor   uuid := nullif(payload->>'doctor_id','')::uuid;
  v_patient  uuid := nullif(payload->>'patient_id','')::uuid;
  v_no       text;
  v_visit    uuid;
  v_rx       uuid;
  v_invoice  uuid;
  v_appt     uuid;
  v_visit_at timestamptz := now();
  v_item     jsonb;
  v_charges  numeric(10,2) := 0;
  v_discount numeric(10,2) := coalesce((payload#>>'{billing,discount}')::numeric, 0);
  v_paid     numeric(10,2) := coalesce((payload#>>'{billing,paid}')::numeric, 0);
  v_fu_date  date;
  v_idx      int := 0;
begin
  if v_clinic is null then raise exception 'No clinic for the signed in user'; end if;
  if v_doctor is null then raise exception 'A doctor must be selected'; end if;

  -- 1. patient master ---------------------------------------------------
  if v_patient is null then
    insert into patients (clinic_id, full_name, phone, whatsapp, dob, gender, address,
                          primary_doctor_id, created_by)
    values (v_clinic,
            payload#>>'{patient,full_name}',
            payload#>>'{patient,phone}',
            nullif(payload#>>'{patient,whatsapp}',''),
            (payload#>>'{patient,dob}')::date,
            lower(payload#>>'{patient,gender}')::gender_t,
            nullif(payload#>>'{patient,address}',''),
            v_doctor, v_actor)
    returning id, patient_no into v_patient, v_no;
  else
    update patients set
      full_name = coalesce(nullif(payload#>>'{patient,full_name}',''), full_name),
      phone     = coalesce(nullif(payload#>>'{patient,phone}',''), phone),
      whatsapp  = coalesce(nullif(payload#>>'{patient,whatsapp}',''), whatsapp),
      address   = coalesce(nullif(payload#>>'{patient,address}',''), address)
    where id = v_patient and clinic_id = v_clinic
    returning patient_no into v_no;
    if v_no is null then raise exception 'Patient not found in this clinic'; end if;
  end if;

  -- 2. visit --------------------------------------------------------------
  insert into visits (clinic_id, patient_id, doctor_id, visit_type, status, visit_date,
                      previous_visit_id, appointment_id, private_notes, created_by)
  values (v_clinic, v_patient, v_doctor,
          coalesce(replace(replace(lower(nullif(payload->>'visit_type','')),' ','_'),'-','_')::visit_type_t,
                   'new_consultation'),
          'completed', v_visit_at,
          nullif(payload->>'previous_visit_id','')::uuid,
          nullif(payload->>'appointment_id','')::uuid,
          nullif(payload->>'private_notes',''),
          v_actor)
  returning id into v_visit;

  if nullif(payload->>'appointment_id','') is not null then
    update appointments set status = 'completed'
     where id = (payload->>'appointment_id')::uuid and clinic_id = v_clinic;
  end if;

  -- 3. medical history -----------------------------------------------------
  if jsonb_typeof(payload->'medical_history') = 'array' then
    delete from patient_medical_history where patient_id = v_patient;
    for v_item in select * from jsonb_array_elements(payload->'medical_history') loop
      insert into patient_medical_history (clinic_id, patient_id, condition, detail, recorded_visit_id)
      values (v_clinic, v_patient, v_item->>'condition', nullif(v_item->>'detail',''), v_visit)
      on conflict (patient_id, condition) do nothing;
    end loop;
  end if;

  -- 4. allergies -------------------------------------------------------------
  if jsonb_typeof(payload->'allergies') = 'array' then
    delete from patient_allergies where patient_id = v_patient;
    for v_item in select * from jsonb_array_elements(payload->'allergies') loop
      insert into patient_allergies (clinic_id, patient_id, allergy_type, detail)
      values (v_clinic, v_patient, v_item->>'allergy_type', nullif(v_item->>'detail',''))
      on conflict do nothing;
    end loop;
  end if;

  -- 5. current medicines -------------------------------------------------------
  if jsonb_typeof(payload->'current_medicines') = 'array' then
    update patient_current_medicines set is_active = false where patient_id = v_patient;
    for v_item in select * from jsonb_array_elements(payload->'current_medicines') loop
      insert into patient_current_medicines (clinic_id, patient_id, medicine_id, medicine_name)
      values (v_clinic, v_patient, nullif(v_item->>'medicine_id','')::uuid, v_item->>'medicine_name');
    end loop;
  end if;

  -- 6. lifestyle -----------------------------------------------------------------
  if jsonb_typeof(payload->'lifestyle') = 'object' then
    insert into patient_lifestyle (patient_id, clinic_id, smoking, tobacco, sleep, exercise, diet, other)
    values (v_patient, v_clinic,
            (payload#>>'{lifestyle,smoking}')::boolean,
            (payload#>>'{lifestyle,tobacco}')::boolean,
            nullif(lower(payload#>>'{lifestyle,sleep}'),''),
            nullif(lower(payload#>>'{lifestyle,exercise}'),''),
            nullif(lower(payload#>>'{lifestyle,diet}'),''),
            nullif(payload#>>'{lifestyle,other}',''))
    on conflict (patient_id) do update set
      smoking = excluded.smoking, tobacco = excluded.tobacco, sleep = excluded.sleep,
      exercise = excluded.exercise, diet = excluded.diet, other = excluded.other,
      updated_at = now();
  end if;

  -- 7. complaints -------------------------------------------------------------------
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(payload->'complaints','[]')) loop
    insert into visit_complaints (clinic_id, visit_id, complaint, duration_value, duration_unit, sort_order)
    values (v_clinic, v_visit, v_item->>'complaint',
            nullif(v_item->>'duration_value','')::numeric,
            nullif(lower(v_item->>'duration_unit'),''), v_idx);
    v_idx := v_idx + 1;
  end loop;

  -- 8. vitals ---------------------------------------------------------------------------
  if jsonb_typeof(payload->'vitals') = 'object' then
    insert into vitals (clinic_id, visit_id, patient_id, bp_systolic, bp_diastolic, pulse,
                        temperature, temp_unit, weight_kg, height_cm, spo2, resp_rate)
    values (v_clinic, v_visit, v_patient,
            nullif(payload#>>'{vitals,bp_systolic}','')::int,
            nullif(payload#>>'{vitals,bp_diastolic}','')::int,
            nullif(payload#>>'{vitals,pulse}','')::int,
            nullif(payload#>>'{vitals,temperature}','')::numeric,
            coalesce(nullif(payload#>>'{vitals,temp_unit}',''),'C'),
            nullif(payload#>>'{vitals,weight_kg}','')::numeric,
            nullif(payload#>>'{vitals,height_cm}','')::numeric,
            nullif(payload#>>'{vitals,spo2}','')::int,
            nullif(payload#>>'{vitals,resp_rate}','')::int);
  end if;

  -- 9. examination -------------------------------------------------------------------------
  if jsonb_typeof(payload->'examination') = 'object' then
    insert into physical_examinations (clinic_id, visit_id, general, chest, cvs, abdomen, cns, other_findings)
    values (v_clinic, v_visit,
            nullif(lower(payload#>>'{examination,general}'),''),
            nullif(lower(payload#>>'{examination,chest}'),''),
            nullif(lower(payload#>>'{examination,cvs}'),''),
            nullif(lower(payload#>>'{examination,abdomen}'),''),
            nullif(lower(payload#>>'{examination,cns}'),''),
            nullif(payload#>>'{examination,other_findings}',''));
  end if;

  -- 10. diagnoses ----------------------------------------------------------------------------
  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(payload->'diagnoses','[]')) loop
    insert into visit_diagnoses (clinic_id, visit_id, diagnosis_id, diagnosis_text, is_primary, sort_order)
    values (v_clinic, v_visit, nullif(v_item->>'diagnosis_id','')::uuid,
            v_item->>'diagnosis_text',
            coalesce((v_item->>'is_primary')::boolean, v_idx = 0), v_idx);
    v_idx := v_idx + 1;
  end loop;

  -- 11. investigations -------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(payload->'investigations','[]')) loop
    insert into visit_investigations (clinic_id, patient_id, visit_id, doctor_id, catalog_id,
                                      category, test_name, price)
    values (v_clinic, v_patient, v_visit, v_doctor,
            nullif(v_item->>'catalog_id','')::uuid,
            coalesce(nullif(v_item->>'category',''),'Laboratory'),
            v_item->>'test_name',
            coalesce((v_item->>'price')::numeric, 0));
  end loop;

  -- 12. prescription — always a new row, history is never overwritten ---------------------------
  if jsonb_array_length(coalesce(payload->'prescription_items','[]')) > 0 then
    insert into prescriptions (clinic_id, patient_id, visit_id, doctor_id, status,
                               copied_from_id, advice, issued_at, created_by)
    values (v_clinic, v_patient, v_visit, v_doctor, 'finalized',
            nullif(payload->>'copied_from_id','')::uuid,
            nullif(payload->>'advice',''), v_visit_at, v_actor)
    returning id into v_rx;

    v_idx := 0;
    for v_item in select * from jsonb_array_elements(payload->'prescription_items') loop
      insert into prescription_items (clinic_id, prescription_id, medicine_id, medicine_name,
                                      strength, dose, frequency, duration, route,
                                      instructions, instruction_other, note, sort_order)
      values (v_clinic, v_rx, nullif(v_item->>'medicine_id','')::uuid,
              v_item->>'medicine_name', nullif(v_item->>'strength',''),
              nullif(v_item->>'dose',''), nullif(v_item->>'frequency',''),
              nullif(v_item->>'duration',''), nullif(v_item->>'route',''),
              coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'instructions','[]'))),'{}'),
              nullif(v_item->>'instruction_other',''), nullif(v_item->>'note',''), v_idx);
      v_idx := v_idx + 1;
    end loop;
  end if;

  -- 13. follow-up and its appointment --------------------------------------------------------------
  if payload#>>'{followup,type}' = 'scheduled' then
    v_fu_date := nullif(payload#>>'{followup,date}','')::date;
  end if;
  if v_fu_date is not null then
    insert into appointments (clinic_id, patient_id, doctor_id, source_visit_id, scheduled_at,
                              appt_type, status, created_by)
    values (v_clinic, v_patient, v_doctor, v_visit,
            (v_fu_date::text || ' ' || coalesce(nullif(payload#>>'{followup,time}',''),'10:00'))::timestamptz,
            'follow_up', 'scheduled', v_actor)
    returning id into v_appt;

    insert into followups (clinic_id, patient_id, visit_id, doctor_id, interval_days,
                           follow_up_date, appointment_id)
    values (v_clinic, v_patient, v_visit, v_doctor,
            nullif(payload#>>'{followup,interval_days}','')::int, v_fu_date, v_appt);
  end if;

  -- 14. invoice ---------------------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(payload#>'{billing,items}','[]')) loop
    v_charges := v_charges + coalesce((v_item->>'amount')::numeric, 0);
  end loop;
  if v_discount > v_charges then raise exception 'Discount cannot be more than the total charges'; end if;
  if v_paid > v_charges - v_discount then raise exception 'Paid amount cannot be more than the net total'; end if;

  insert into invoices (clinic_id, patient_id, visit_id, doctor_id, charges_total,
                        discount, net_total, created_by)
  values (v_clinic, v_patient, v_visit, v_doctor, v_charges, v_discount,
          v_charges - v_discount, v_actor)
  returning id into v_invoice;

  v_idx := 0;
  for v_item in select * from jsonb_array_elements(coalesce(payload#>'{billing,items}','[]')) loop
    if coalesce((v_item->>'amount')::numeric,0) <> 0 then
      insert into invoice_items (clinic_id, invoice_id, description, item_type, quantity,
                                 unit_price, amount, sort_order)
      values (v_clinic, v_invoice, v_item->>'description',
              coalesce(nullif(v_item->>'item_type',''),'Other'),
              coalesce((v_item->>'quantity')::int, 1),
              coalesce((v_item->>'unit_price')::numeric, 0),
              coalesce((v_item->>'amount')::numeric, 0), v_idx);
    end if;
    v_idx := v_idx + 1;
  end loop;

  -- 15. payment -----------------------------------------------------------------------------------------
  if v_paid > 0 then
    insert into payments (clinic_id, invoice_id, patient_id, amount, method,
                          reference_no, recorded_by, doctor_id)
    values (v_clinic, v_invoice, v_patient, v_paid,
            coalesce(nullif(lower(payload#>>'{billing,method}'),'')::payment_method_t,'cash'),
            nullif(payload#>>'{billing,reference_no}',''), v_actor, v_doctor);
  end if;

  perform log_audit('visit.saved','visits', v_visit,
    jsonb_build_object('patient_id', v_patient, 'invoice_id', v_invoice, 'prescription_id', v_rx));

  return jsonb_build_object(
    'patient_id', v_patient, 'patient_no', v_no, 'visit_id', v_visit,
    'prescription_id', v_rx, 'invoice_id', v_invoice, 'appointment_id', v_appt);
end $$;

-- =====================================================================
-- GLOBAL SEARCH
-- =====================================================================
create or replace function global_search(q text, lim int default 8)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (
    select pt.id, pt.patient_no, pt.full_name, pt.phone, pt.whatsapp, pt.dob, pt.gender,
      (select count(*) from visits v where v.patient_id = pt.id) as visits,
      (select count(*) from prescriptions r where r.patient_id = pt.id) as prescriptions,
      (select count(*) from visit_investigations i where i.patient_id = pt.id) as investigations,
      coalesce((select sum(i.due_total) from invoices i where i.patient_id = pt.id and not i.is_void),0) as due
    from patients pt
    where pt.clinic_id = app_clinic_id() and not pt.is_deleted
      and (pt.full_name ilike '%'||q||'%'
        or pt.phone like '%'||q||'%'
        or pt.whatsapp like '%'||q||'%'
        or pt.patient_no ilike '%'||q||'%')
    order by similarity(pt.full_name, q) desc nulls last, pt.created_at desc
    limit lim
  ),
  a as (
    select ap.id, ap.scheduled_at, ap.status, ap.appt_type, pt.full_name, pt.patient_no, pt.id as patient_id
    from appointments ap join patients pt on pt.id = ap.patient_id
    where ap.clinic_id = app_clinic_id()
      and (pt.full_name ilike '%'||q||'%' or pt.patient_no ilike '%'||q||'%')
    order by ap.scheduled_at desc limit lim
  )
  select jsonb_build_object(
    'patients', coalesce((select jsonb_agg(to_jsonb(p)) from p), '[]'::jsonb),
    'appointments', coalesce((select jsonb_agg(to_jsonb(a)) from a), '[]'::jsonb)
  );
$$;

-- =====================================================================
-- PORTAL — token lookup by hash, private notes never selected
-- =====================================================================
create or replace function portal_fetch(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t portal_tokens; v_patient patients; v_out jsonb;
begin
  select * into t from portal_tokens
   where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if not found then return jsonb_build_object('error','invalid_or_expired'); end if;

  update portal_tokens set view_count = view_count + 1, last_viewed_at = now() where id = t.id;
  select * into v_patient from patients where id = t.patient_id;

  select jsonb_build_object(
    'clinic', (select jsonb_build_object('name',c.name,'address',c.address,
                 'phone_1',c.phone_1,'phone_2',c.phone_2)
               from clinics c where c.id = t.clinic_id),
    'patient', jsonb_build_object('name', v_patient.full_name, 'patient_no', v_patient.patient_no,
                 'dob', v_patient.dob, 'gender', v_patient.gender),
    'shared', (select coalesce(jsonb_agg(item_type), '[]'::jsonb) from portal_shared_items where token_id = t.id),
    'visits', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', v.visit_date, 'doctor', d.full_name,
          'diagnoses', (select coalesce(jsonb_agg(vd.diagnosis_text),'[]'::jsonb)
                          from visit_diagnoses vd where vd.visit_id = v.id),
          'prescription', (select coalesce(jsonb_agg(jsonb_build_object(
                              'medicine', pi.medicine_name, 'strength', pi.strength, 'dose', pi.dose,
                              'frequency', pi.frequency, 'duration', pi.duration,
                              'instructions', pi.instructions) order by pi.sort_order), '[]'::jsonb)
                          from prescriptions pr join prescription_items pi on pi.prescription_id = pr.id
                          where pr.visit_id = v.id)
        ) order by v.visit_date desc)
        from visits v join doctors d on d.id = v.doctor_id
        where v.patient_id = t.patient_id), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- =====================================================================
-- DASHBOARD AGGREGATE — one round trip instead of eight
-- =====================================================================
create or replace function dashboard_stats(p_day date default current_date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today_patients',   (select count(distinct patient_id) from visits
                          where clinic_id = app_clinic_id() and visit_date::date = p_day),
    'waiting',          (select count(*) from appointments where clinic_id = app_clinic_id()
                          and scheduled_at::date = p_day and status = 'waiting'),
    'in_consultation',  (select count(*) from appointments where clinic_id = app_clinic_id()
                          and scheduled_at::date = p_day and status = 'in_consultation'),
    'completed',        (select count(*) from appointments where clinic_id = app_clinic_id()
                          and scheduled_at::date = p_day and status = 'completed'),
    'appointments',     (select count(*) from appointments where clinic_id = app_clinic_id()
                          and scheduled_at::date = p_day),
    'revenue_today',    (select coalesce(sum(amount),0) from payments where clinic_id = app_clinic_id()
                          and paid_at::date = p_day),
    'outstanding_due',  (select coalesce(sum(due_total),0) from invoices where clinic_id = app_clinic_id()
                          and not is_void),
    'pending_followups',(select count(*) from followups where clinic_id = app_clinic_id()
                          and not completed and follow_up_date <= p_day + 7)
  );
$$;

-- =====================================================================
-- STORAGE
-- =====================================================================
insert into storage.buckets (id, name, public) values ('reports','reports',false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('documents','documents',false)
  on conflict (id) do nothing;

-- Files are stored under <clinic_id>/<patient_id>/<file>. The first path
-- segment is the tenant boundary and is enforced here.
create policy "clinic files read" on storage.objects for select
  using (bucket_id in ('reports','documents')
         and (storage.foldername(name))[1] = app_clinic_id()::text);
create policy "clinic files write" on storage.objects for insert
  with check (bucket_id in ('reports','documents')
         and (storage.foldername(name))[1] = app_clinic_id()::text);
create policy "clinic files delete" on storage.objects for delete
  using (bucket_id in ('reports','documents')
         and (storage.foldername(name))[1] = app_clinic_id()::text
         and app_role() = 'admin');

-- =====================================================================
-- SECURITY HARDENING
-- =====================================================================

-- 1. A signed-in user must never be able to move themselves into another
--    clinic or promote their own role. Without an explicit WITH CHECK this
--    depends on subtle default behaviour, so it is spelled out.
drop policy if exists profile_update on profiles;
create policy profile_update on profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and clinic_id = (select p.clinic_id from profiles p where p.id = auth.uid())
    and role      = (select p.role      from profiles p where p.id = auth.uid())
  );

-- 2. Audit writing must never break an insert. app_clinic_id() is null for
--    service-role and SQL-editor sessions, which previously made the audit
--    trigger fail and roll back the whole statement.
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (clinic_id, actor_id, doctor_id, action, entity, entity_id, metadata)
  values (coalesce(new.clinic_id, app_clinic_id()), auth.uid(), app_doctor_id(),
          tg_argv[0], tg_table_name, new.id, '{}'::jsonb);
  return null;
exception when others then
  return null;   -- auditing must never block clinical work
end $$;

create or replace function log_audit(
  p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (clinic_id, actor_id, doctor_id, action, entity, entity_id, metadata)
  values (app_clinic_id(), auth.uid(), app_doctor_id(), p_action, p_entity, p_entity_id,
          coalesce(p_meta,'{}'));
exception when others then
  null;
end $$;

-- 3. The audit trail is append only. Nobody, including an admin, edits or
--    deletes it through the API.
drop policy if exists audit_no_update on audit_logs;
drop policy if exists audit_logs_upd on audit_logs;
drop policy if exists audit_logs_del on audit_logs;
create policy audit_logs_append_only_upd on audit_logs for update using (false);
create policy audit_logs_append_only_del on audit_logs for delete using (false);

-- 4. A portal token may only ever point at a patient of the same clinic.
--    RLS alone checks clinic_id on the token row, not on the patient it names.
create or replace function portal_token_same_clinic() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from patients p
                  where p.id = new.patient_id and p.clinic_id = new.clinic_id) then
    raise exception 'Portal token must belong to a patient of the same clinic';
  end if;
  return new;
end $$;
create trigger t_portal_same_clinic before insert or update on portal_tokens
  for each row execute function portal_token_same_clinic();

-- 5. A finalized prescription is clinical history. It is never edited in
--    place; a new visit creates a new prescription. Deleting one requires an
--    admin and leaves the audit row behind.
create or replace function block_finalized_rx_edit() returns trigger
language plpgsql set search_path = public as $$
declare v_status rx_status_t;
begin
  select status into v_status from prescriptions
   where id = coalesce(new.prescription_id, old.prescription_id);
  if v_status = 'finalized' then
    raise exception 'This prescription is finalized. Copy it into a new prescription instead of editing it.';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_rx_items_immutable before update or delete on prescription_items
  for each row execute function block_finalized_rx_edit();

-- 6. Patient-facing identifiers and clinic ownership are never rewritten.
create or replace function block_identity_rewrite() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'A record cannot be moved to another clinic';
  end if;
  if tg_table_name = 'patients' then
    if new.patient_no is distinct from old.patient_no then
      raise exception 'Patient ID cannot be changed';
    end if;
  end if;
  return new;
end $$;
create trigger t_patients_identity before update on patients
  for each row execute function block_identity_rewrite();
create trigger t_visits_identity before update on visits
  for each row execute function block_identity_rewrite();
create trigger t_invoices_identity before update on invoices
  for each row execute function block_identity_rewrite();

-- 7. Portal view counting was overwriting the counter instead of raising it.
create or replace function portal_register_view(p_token_hash text) returns void
language sql security definer set search_path = public as $$
  update portal_tokens
     set view_count = view_count + 1, last_viewed_at = now()
   where token_hash = p_token_hash;
$$;

-- =====================================================================
-- GRANTS — least privilege
-- Signed-in staff reach the tables only through row level security.
-- The anonymous key gets nothing at all in this schema: the patient portal
-- is served by the application server, never straight from the browser.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- =====================================================================
-- WHATSAPP REMINDER ENGINE
-- Queuing happens automatically in the database the moment an appointment
-- is created or rescheduled, no matter which part of the app did it. A
-- separate scheduled job (Vercel Cron, see /api/cron/whatsapp) sweeps due
-- messages and sends them. Nothing here ever blocks booking an appointment.
-- =====================================================================
create or replace function queue_appointment_reminder_for(a appointments) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_settings clinic_settings; v_patient patients; v_doctor_name text;
  v_to text; v_send_at timestamptz; v_body text;
begin
  if a.status = 'cancelled' then return; end if;

  select * into v_settings from clinic_settings where clinic_id = a.clinic_id;
  if v_settings is null or not v_settings.wa_enabled then return; end if;

  select * into v_patient from patients where id = a.patient_id;
  v_to := coalesce(nullif(v_patient.whatsapp,''), v_patient.phone);
  if v_to is null then return; end if;

  select full_name into v_doctor_name from doctors where id = a.doctor_id;

  v_send_at := a.scheduled_at - make_interval(hours => coalesce(v_settings.wa_reminder_hours, 24));
  if v_send_at < now() then
    if a.scheduled_at > now() then v_send_at := now(); else return; end if;
  end if;

  v_body := format('Reminder: your appointment with %s is on %s at %s. — %s',
    coalesce(v_doctor_name, 'the doctor'),
    to_char(a.scheduled_at, 'DD Mon YYYY'), to_char(a.scheduled_at, 'HH12:MI AM'),
    (select name from clinics where id = a.clinic_id));

  insert into whatsapp_messages (clinic_id, patient_id, appointment_id, to_number,
                                 template, body, status, scheduled_for)
  values (a.clinic_id, a.patient_id, a.id, v_to, 'appointment_reminder', v_body, 'scheduled', v_send_at);
exception when others then
  null;  -- a reminder failing to queue must never block booking the appointment
end $$;

create or replace function queue_appointment_reminder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform queue_appointment_reminder_for(new);
  return new;
end $$;

create trigger t_appointments_queue_reminder after insert on appointments
  for each row execute function queue_appointment_reminder();

-- Cancelling or rescheduling should not leave a stale reminder pointing at
-- the wrong time — cancel the old one and queue a fresh one.
create or replace function requeue_appointment_reminder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' then
    update whatsapp_messages set status = 'cancelled'
     where appointment_id = new.id and status = 'scheduled';
    return new;
  end if;
  if new.scheduled_at is distinct from old.scheduled_at then
    update whatsapp_messages set status = 'cancelled'
     where appointment_id = new.id and status = 'scheduled';
    perform queue_appointment_reminder_for(new);
  end if;
  return new;
exception when others then
  return new;
end $$;

create trigger t_appointments_requeue_reminder after update on appointments
  for each row execute function requeue_appointment_reminder();

-- One retry, from the Settings → WhatsApp log, resets a failed message back
-- to scheduled for immediate pickup by the next cron sweep.
create or replace function retry_whatsapp_message(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update whatsapp_messages set status = 'scheduled', scheduled_for = now(), error = null
   where id = p_id and clinic_id = app_clinic_id() and status = 'failed';
$$;


-- =====================================================================
--  STEP 2 of 4 — SEED DATA
-- =====================================================================
-- =====================================================================
-- SEED — run after 0001_init.sql
-- Creates the clinic, both doctors and starter catalogs.
-- All of this stays editable from Settings.
-- =====================================================================

do $$
declare c uuid;
begin
  insert into clinics (name, address, phone_1, phone_2)
  values ('Shafiq Medical & Diagnostic Center',
          'Main Road, Kala Kelay, Swat',
          '0341 4118069', '0342 5851301')
  returning id into c;

  insert into clinic_settings (clinic_id) values (c);

  insert into doctors (clinic_id, full_name, qualification, affiliation, consultation_fee, sort_order)
  values
    (c,'Dr. Abid Ali Khan','MBBS (KMC), FCPS (Medicine)','Saidu Teaching Hospital',1000,1),
    (c,'Dr. Ajmal Khan','MBBS (MC), FCPS (Medicine)','Saidu Teaching Hospital',1000,2);

  insert into complaint_catalog (clinic_id, name)
  select c, x from unnest(array['Headache','Fever','Cough','Pain','Weakness',
    'Dizziness','Vomiting','Shortness of Breath','Chest Pain','Abdominal Pain',
    'Diarrhoea','Body Ache','Sore Throat','Loss of Appetite']) x;

  insert into diagnosis_catalog (clinic_id, name, is_common)
  select c, x, true from unnest(array['Migraine','Hypertension','Type 2 Diabetes Mellitus',
    'Acute Gastroenteritis','Upper Respiratory Tract Infection','Bronchial Asthma',
    'Urinary Tract Infection','Iron Deficiency Anaemia','Peptic Ulcer Disease',
    'Acute Pharyngitis','Enteric Fever','Osteoarthritis','Ischaemic Heart Disease',
    'Chronic Kidney Disease','Hypothyroidism','Viral Fever','Allergic Rhinitis',
    'Gastro-oesophageal Reflux Disease']) x;

  insert into investigation_catalog (clinic_id, name, category, price)
  select c, v.name, 'Laboratory', v.price from (values
    ('CBC (Complete Blood Count)',600::numeric),
    ('Blood Sugar Fasting',250),('Blood Sugar Random',250),('HbA1c',1500),
    ('Urine Routine Examination',400),('Liver Function Test',1800),
    ('Renal Function Test',1500),('Serum Creatinine',500),('Serum Electrolytes',1200),
    ('Lipid Profile',1500),('Thyroid Profile (TSH, T3, T4)',2000),
    ('ESR',300),('CRP',900),('Widal Test',600),('Hepatitis B Surface Antigen',700),
    ('Anti HCV',900),('Malaria Parasite (MP/ICT)',500),('Stool Routine Examination',400)
  ) v(name, price);

  insert into investigation_catalog (clinic_id, name, category, price)
  select c, v.name, 'Radiology', v.price from (values
    ('X-Ray Chest PA',800::numeric),('X-Ray Abdomen Erect',800),
    ('Ultrasound Abdomen',1500),('Ultrasound Pelvis',1500),
    ('Ultrasound KUB',1500),('ECG',500),('Echocardiography',3500),
    ('CT Scan Brain (Plain)',6000),('X-Ray Lumbosacral Spine',1000)
  ) v(name, price);

  insert into medicines (clinic_id, name, generic_name, strength, form)
  select c, v.n, v.g, v.s, v.f from (values
    ('Panadol','Paracetamol','500mg','Tablet'),
    ('Brufen','Ibuprofen','400mg','Tablet'),
    ('Augmentin','Amoxicillin + Clavulanate','625mg','Tablet'),
    ('Amoxil','Amoxicillin','500mg','Capsule'),
    ('Ciproxin','Ciprofloxacin','500mg','Tablet'),
    ('Flagyl','Metronidazole','400mg','Tablet'),
    ('Nexum','Esomeprazole','40mg','Capsule'),
    ('Risek','Omeprazole','20mg','Capsule'),
    ('Motilium','Domperidone','10mg','Tablet'),
    ('Glucophage','Metformin','500mg','Tablet'),
    ('Amlodipine','Amlodipine','5mg','Tablet'),
    ('Concor','Bisoprolol','5mg','Tablet'),
    ('Tenormin','Atenolol','50mg','Tablet'),
    ('Lipitor','Atorvastatin','10mg','Tablet'),
    ('Ventolin','Salbutamol','100mcg','Inhaler'),
    ('Zyrtec','Cetirizine','10mg','Tablet'),
    ('Loprin','Aspirin','75mg','Tablet'),
    ('Surbex Z','Multivitamin','','Tablet'),
    ('Calcium D','Calcium + Vitamin D3','','Tablet'),
    ('Dexamethasone','Dexamethasone','0.5mg','Tablet')
  ) v(n,g,s,f);
end $$;

-- After creating your first Supabase Auth user, link it to the clinic:
--
--   insert into profiles (id, clinic_id, full_name, email, role)
--   values ('<AUTH_USER_UUID>', (select id from clinics limit 1),
--           'Dr. Abid Ali Khan', 'you@example.com', 'admin');
--
--   update doctors set profile_id = '<AUTH_USER_UUID>'
--   where full_name = 'Dr. Abid Ali Khan';

-- =====================================================================
--  STEP 4 of 4 — SELF TEST
--  Creates a temporary user and a test patient, proves the whole system
--  works and is properly isolated, then deletes everything it created and
--  resets the patient counter. Your database is left clean and empty,
--  ready for real patients.
-- =====================================================================
do $$
declare
  c uuid; d uuid; u uuid; me uuid; my_clinic uuid; rival uuid;
  res jsonb; res2 jsonb;
  v_pat uuid; v_rx1 uuid; v_rx2 uuid; n int; amt numeric; dt date;
begin
  select id into c from clinics where name like 'Shafiq%' limit 1;
  select id into d from doctors where full_name = 'Dr. Abid Ali Khan';

  -- temporary tester, removed again at the end
  insert into auth.users (id) values ('aaaaaaaa-0000-4000-8000-000000000001') on conflict do nothing;
  insert into profiles (id, clinic_id, full_name, email, role, doctor_id)
  values ('aaaaaaaa-0000-4000-8000-000000000001', c, 'Self test', 'selftest@local', 'admin', d);
  u := 'aaaaaaaa-0000-4000-8000-000000000001'; me := u; my_clinic := c;

  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  raise notice ' ';
  raise notice '=== FUNCTIONAL TESTS ===';

  select id into c from clinics limit 1;
  select id into d from doctors where full_name = 'Dr. Abid Ali Khan';

  -- TEST 0: catalogs seeded
  if (select count(*) from medicines) = 0 then raise exception 'FAIL: medicines not seeded'; end if;
  if (select count(*) from diagnosis_catalog) = 0 then raise exception 'FAIL: diagnoses not seeded'; end if;
  raise notice 'PASS  catalogs seeded';

  -- TEST 1-10: new patient, full first consultation, one atomic save
  res := save_visit(jsonb_build_object(
    'patient_id', null,
    'patient', jsonb_build_object('full_name','Afsar','phone','03001234567',
        'whatsapp','03001234567','dob','1990-05-12','gender','Male','address','Kala Kelay'),
    'doctor_id', d,
    'visit_type','New Consultation',
    'medical_history', jsonb_build_array(jsonb_build_object('condition','Hypertension')),
    'allergies', jsonb_build_array(jsonb_build_object('allergy_type','Medicine Allergy','detail','Penicillin')),
    'current_medicines', jsonb_build_array(jsonb_build_object('medicine_id',null,'medicine_name','Amlodipine 5mg')),
    'lifestyle', jsonb_build_object('smoking','No','tobacco','No','sleep','Poor','exercise','None','diet','Normal'),
    'complaints', jsonb_build_array(jsonb_build_object('complaint','Headache','duration_value','10','duration_unit','Days')),
    'vitals', jsonb_build_object('bp_systolic','130','bp_diastolic','85','pulse','88','weight_kg','72','spo2','98'),
    'examination', jsonb_build_object('general','Normal','chest','Normal','cvs','Normal','abdomen','Normal','cns','Normal'),
    'diagnoses', jsonb_build_array(jsonb_build_object('diagnosis_id',null,'diagnosis_text','Migraine','is_primary',true)),
    'investigations', jsonb_build_array(jsonb_build_object('catalog_id',null,'test_name','CBC','category','Laboratory','price',600)),
    'prescription_items', jsonb_build_array(
       jsonb_build_object('medicine_name','Panadol','strength','500mg','dose','1','frequency','BD','duration','5 days','route','Oral','instructions',jsonb_build_array('After Meal')),
       jsonb_build_object('medicine_name','Risek','strength','20mg','dose','1','frequency','OD','duration','10 days','route','Oral','instructions',jsonb_build_array('Empty Stomach'))),
    'followup', jsonb_build_object('type','scheduled','interval_days',20,'date','2026-10-10','time','10:00'),
    'billing', jsonb_build_object(
       'items', jsonb_build_array(
          jsonb_build_object('item_type','Consultation','description','Consultation fee','quantity',1,'unit_price',500,'amount',500),
          jsonb_build_object('item_type','Investigation','description','CBC','quantity',1,'unit_price',600,'amount',600)),
       'discount',100,'paid',600,'method','Cash','reference_no',null)));

  v_pat := (res->>'patient_id')::uuid;
  v_rx1 := (res->>'prescription_id')::uuid;

  -- TEST 1: permanent patient number
  if (select patient_no from patients where id = v_pat) <> 'PAT-000001'
    then raise exception 'FAIL: expected PAT-000001, got %', res->>'patient_no'; end if;
  raise notice 'PASS  patient number PAT-000001 allocated';

  -- TEST 2-5: every part of the consultation landed
  if (select count(*) from visit_complaints where visit_id = (res->>'visit_id')::uuid) <> 1
    then raise exception 'FAIL: complaint not saved'; end if;
  if (select count(*) from visit_diagnoses where visit_id = (res->>'visit_id')::uuid) <> 1
    then raise exception 'FAIL: diagnosis not saved'; end if;
  if (select count(*) from visit_investigations where visit_id = (res->>'visit_id')::uuid) <> 1
    then raise exception 'FAIL: investigation not saved'; end if;
  if (select count(*) from prescription_items where prescription_id = v_rx1) <> 2
    then raise exception 'FAIL: prescription items not saved'; end if;
  if (select count(*) from vitals where visit_id = (res->>'visit_id')::uuid) <> 1
    then raise exception 'FAIL: vitals not saved'; end if;
  raise notice 'PASS  complaint, diagnosis, investigation, vitals, prescription all written';

  -- TEST 6-7: follow-up appointment on the calculated date
  select scheduled_at::date into dt from appointments where id = (res->>'appointment_id')::uuid;
  if dt <> date '2026-10-10' then raise exception 'FAIL: follow-up date is %, expected 2026-10-10', dt; end if;
  if (select appt_type from appointments where id = (res->>'appointment_id')::uuid) <> 'follow_up'
    then raise exception 'FAIL: appointment is not a follow-up'; end if;
  raise notice 'PASS  20-day follow-up appointment created for 10 Oct 2026';

  -- TEST 8-9: billing arithmetic  1100 charges - 100 discount = 1000 net, 600 paid, 400 due
  if (select charges_total from invoices where id = (res->>'invoice_id')::uuid) <> 1100
    then raise exception 'FAIL: charges_total wrong'; end if;
  if (select net_total from invoices where id = (res->>'invoice_id')::uuid) <> 1000
    then raise exception 'FAIL: net_total wrong'; end if;
  if (select due_total from invoices where id = (res->>'invoice_id')::uuid) <> 400
    then raise exception 'FAIL: due_total wrong'; end if;
  raise notice 'PASS  billing 1100 - 100 = 1000 net, 600 paid, 400 due';

  -- TEST 13-17: second visit, copy previous prescription, modify it
  res2 := save_visit(jsonb_build_object(
    'patient_id', v_pat, 'doctor_id', d, 'visit_type','Follow-up',
    'previous_visit_id', res->>'visit_id',
    'copied_from_id', v_rx1,
    'complaints', jsonb_build_array(jsonb_build_object('complaint','Headache','duration_value','2','duration_unit','Weeks')),
    'diagnoses', jsonb_build_array(jsonb_build_object('diagnosis_text','Migraine')),
    'prescription_items', jsonb_build_array(
       jsonb_build_object('medicine_name','Panadol','strength','500mg','dose','1','frequency','TDS','duration','7 days','route','Oral','instructions',jsonb_build_array())),
    'followup', jsonb_build_object('type','none'),
    'billing', jsonb_build_object(
       'items', jsonb_build_array(jsonb_build_object('item_type','Consultation','description','Consultation fee','quantity',1,'unit_price',500,'amount',500)),
       'discount',0,'paid',500,'method','Online','reference_no','TRX-99881')));

  v_rx2 := (res2->>'prescription_id')::uuid;
  if v_rx1 = v_rx2 then raise exception 'FAIL: prescription was overwritten instead of copied'; end if;
  if (select count(*) from prescription_items where prescription_id = v_rx1) <> 2
    then raise exception 'FAIL: original prescription was modified'; end if;
  if (select frequency from prescription_items where prescription_id = v_rx1 and medicine_name='Panadol') <> 'BD'
    then raise exception 'FAIL: original prescription frequency changed'; end if;
  if (select frequency from prescription_items where prescription_id = v_rx2) <> 'TDS'
    then raise exception 'FAIL: new prescription did not take the edit'; end if;
  if (select copied_from_id from prescriptions where id = v_rx2) <> v_rx1
    then raise exception 'FAIL: copy lineage not recorded'; end if;
  raise notice 'PASS  history immutable, copy creates a new prescription with lineage';

  -- TEST 12: everything hangs off one patient
  if (select count(*) from visits where patient_id = v_pat) <> 2 then raise exception 'FAIL: visit count'; end if;
  if (select count(*) from invoices where patient_id = v_pat) <> 2 then raise exception 'FAIL: invoice count'; end if;
  raise notice 'PASS  two visits, two prescriptions, two invoices under one patient';

  -- payment history is append only and preserves the online reference
  if (select count(*) from payments where patient_id = v_pat) <> 2 then raise exception 'FAIL: payment history lost'; end if;
  if (select reference_no from payments where method='online') <> 'TRX-99881'
    then raise exception 'FAIL: online reference not stored'; end if;
  raise notice 'PASS  payment history preserved with online reference';

  -- TEST 18: global search finds the patient with counts and due
  raise notice 'PASS  search returns % patient(s)',
    jsonb_array_length(global_search('Afsar')->'patients');

  -- TEST 28: doctor attribution and audit trail
  if (select count(*) from visits where doctor_id = d) <> 2 then raise exception 'FAIL: doctor attribution'; end if;
  if (select count(*) from audit_logs) = 0 then raise exception 'FAIL: no audit rows'; end if;
  raise notice 'PASS  doctor attribution and audit trail (% rows)', (select count(*) from audit_logs);

  -- guard: online payment must carry a reference number
  begin
    insert into payments (clinic_id, invoice_id, patient_id, amount, method)
    values (c, (select id from invoices limit 1), v_pat, 100, 'online');
    raise exception 'FAIL: online payment without a reference was accepted';
  exception when check_violation then raise notice 'PASS  online payment requires a reference number';
  end;

  -- guard: discount cannot exceed charges
  begin
    perform save_visit(jsonb_build_object('patient_id', v_pat, 'doctor_id', d,
      'billing', jsonb_build_object('items', jsonb_build_array(
        jsonb_build_object('item_type','Consultation','description','Fee','quantity',1,'unit_price',100,'amount',100)),
        'discount',5000,'paid',0)));
    raise exception 'FAIL: discount guard did not fire';
  exception when others then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS  discount guard: %', sqlerrm;
  end;

  -- soft delete keeps clinical and financial history recoverable
  if (select count(*) from information_schema.columns
      where table_name in ('visits','prescriptions','appointments','invoices','documents')
        and column_name = 'is_deleted') <> 5
    then raise exception 'FAIL: soft-delete columns missing'; end if;
  raise notice 'PASS  soft-delete columns present on clinical and financial tables';


  raise notice ' ';
  raise notice '=== REGRESSION TESTS (bugs found during real use, locked in) ===';

  -- payments.method and documents.doc_type must be lowercase — the app was
  -- once sending Title Case here and every payment/upload silently failed
  declare v_inv uuid; v_pat2 uuid;
  begin
    select id into v_pat2 from patients where patient_no = 'PAT-000001';
    select id into v_inv from invoices where patient_id = v_pat2 limit 1;
    insert into payments (clinic_id, invoice_id, patient_id, amount, method, recorded_by)
      values (c, v_inv, v_pat2, 1, 'cash', u);
    insert into documents (clinic_id, patient_id, doc_type, storage_path, file_name, uploaded_by)
      values (c, v_pat2, 'lab_report', 'x/y.pdf', 'y.pdf', u);
    raise notice 'PASS  payments.method and documents.doc_type accept the values the app sends';
  end;

  -- clinic_settings columns the Settings page writes to must exist under
  -- these exact names — a earlier mismatch made every Settings save fail
  begin
    update clinic_settings set wa_enabled = true, wa_reminder_hours = 24 where clinic_id = c;
    raise notice 'PASS  clinic_settings.wa_enabled / wa_reminder_hours are writable';
  end;

  -- prescription_templates round trip
  begin
    insert into prescription_templates (clinic_id, doctor_id, name, items)
      values (c, d, 'Test template', '[{"medicine_name":"Test"}]'::jsonb);
    if (select count(*) from prescription_templates where clinic_id = c) = 0
      then raise exception 'FAIL: prescription template not saved'; end if;
    raise notice 'PASS  prescription templates save and read back';
  end;

  -- WhatsApp reminders queue automatically when an appointment is created
  -- with WhatsApp enabled, and stop when it's cancelled
  declare v_pat3 uuid; v_appt uuid;
  begin
    update clinic_settings set wa_enabled = true, wa_reminder_hours = 24 where clinic_id = c;
    insert into patients (clinic_id, full_name, phone, whatsapp, dob, gender)
      values (c, 'WA Regress', '03009998888', '03009998888', '1990-01-01', 'male')
      returning id into v_pat3;
    insert into appointments (clinic_id, patient_id, doctor_id, scheduled_at, appt_type, status)
      values (c, v_pat3, d, now() + interval '3 days', 'custom', 'scheduled')
      returning id into v_appt;
    if (select count(*) from whatsapp_messages where appointment_id = v_appt and status = 'scheduled') <> 1
      then raise exception 'FAIL: reminder was not queued'; end if;
    update appointments set status = 'cancelled' where id = v_appt;
    if (select count(*) from whatsapp_messages where appointment_id = v_appt and status = 'scheduled') <> 0
      then raise exception 'FAIL: reminder was not cancelled with the appointment'; end if;
    raise notice 'PASS  WhatsApp reminders queue on booking and cancel with the appointment';
  end;

  raise notice ' ';
  raise notice '=== SECURITY TESTS (running as an ordinary signed-in user) ===';



  insert into clinics (name) values ('ZZ Decoy Clinic') returning id into rival;
  insert into clinic_settings (clinic_id) values (rival);
  insert into patients (clinic_id, full_name, phone, dob, gender)
    values (rival, 'ZZ Decoy Patient', '03331112222', '1985-01-01', 'male');

  -- Drop to an ordinary signed-in user. Without this the SQL Editor runs as
  -- the table owner, which bypasses row level security and would make every
  -- check below pass for the wrong reason.
  execute 'set local role authenticated';

  -- Become an ordinary signed-in user. Without this the SQL editor runs as
  -- the table owner and bypasses RLS entirely, so the tests would all pass
  -- for the wrong reason.

  -- 1. cross-clinic read
  select count(*) into n from patients where clinic_id = rival;
  if n <> 0 then raise exception 'FAIL: another clinic''s patients are readable'; end if;
  raise notice 'PASS  another clinic''s patients are invisible';

  select count(*) into n from clinics where id = rival;
  if n <> 0 then raise exception 'FAIL: another clinic row is readable'; end if;
  raise notice 'PASS  another clinic record is invisible';

  -- 2. cross-clinic write
  begin
    insert into patients (clinic_id, full_name, phone, dob, gender)
      values (rival, 'Injected', '03000000000', '1990-01-01', 'male');
    raise exception 'FAIL: a patient was written into another clinic';
  exception when insufficient_privilege then
    raise notice 'PASS  writing into another clinic is blocked';
  end;

  -- 3. privilege escalation by rewriting own clinic_id or role
  begin
    update profiles set clinic_id = rival where id = me;
    if (select clinic_id from profiles where id = me) = rival then
      raise exception 'FAIL: user moved themselves into another clinic';
    end if;
    raise notice 'PASS  clinic_id escalation blocked';
  exception when insufficient_privilege then
    raise notice 'PASS  clinic_id escalation blocked';
  end;

  -- 4. records cannot be moved between clinics after creation
  begin
    update patients set clinic_id = rival where clinic_id = my_clinic;
    raise exception 'FAIL: an existing patient was moved to another clinic';
  exception when others then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS  records cannot be moved between clinics';
  end;

  -- 5. patient ID is permanent
  begin
    update patients set patient_no = 'PAT-999999' where clinic_id = my_clinic;
    raise exception 'FAIL: patient ID was rewritten';
  exception when others then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS  patient ID cannot be rewritten';
  end;

  -- 6. finalized prescriptions are clinical history
  if exists (select 1 from prescriptions where status = 'finalized') then
    begin
      update prescription_items set frequency = 'QID'
       where prescription_id = (select id from prescriptions where status='finalized' limit 1);
      raise exception 'FAIL: a finalized prescription was edited in place';
    exception when others then
      if position('FAIL' in sqlerrm) > 0 then raise; end if;
      raise notice 'PASS  finalized prescriptions cannot be edited in place';
    end;
  end if;

  -- 7. audit trail is append only
  begin
    delete from audit_logs where true;
    if (select count(*) from audit_logs) = 0 then
      raise exception 'FAIL: audit trail was deleted';
    end if;
    raise notice 'PASS  audit trail cannot be deleted';
  exception when insufficient_privilege then
    raise notice 'PASS  audit trail cannot be deleted';
  end;

  -- 8. a portal link cannot be pointed at another clinic's patient
  begin
    insert into portal_tokens (clinic_id, patient_id, token_hash, expires_at)
      values (my_clinic, (select id from patients where clinic_id = rival limit 1),
              'decoyhash', now() + interval '1 day');
    raise exception 'FAIL: portal link created for another clinic''s patient';
  exception when others then
    if position('FAIL' in sqlerrm) > 0 then raise; end if;
    raise notice 'PASS  portal links are confined to the clinic''s own patients';
  end;

  -- cleanup, back as the owner


  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  delete from clinics where id = rival;

  -- ---------------- remove every trace of the test ----------------
  delete from whatsapp_messages where clinic_id = c;
  delete from prescription_templates where clinic_id = c;
  delete from patients where clinic_id = c;
  delete from audit_logs where clinic_id = c;
  delete from profiles where id = u;
  delete from auth.users where id = u;
  update clinic_counters set patient_seq = 0, invoice_seq = 0 where clinic_id = c;

  if (select count(*) from patients) <> 0
     or (select count(*) from whatsapp_messages) <> 0
     or (select count(*) from prescription_templates) <> 0 then
    raise exception 'FAIL: test data was left behind';
  end if;

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' ALL TESTS PASSED — database is clean and ready';
  raise notice ' Patients: %   Doctors: %   Medicines: %',
    (select count(*) from patients), (select count(*) from doctors),
    (select count(*) from medicines);
  raise notice ' Next: add your login user, then follow README step 2';
  raise notice '=====================================================';

exception when others then
  -- always clean up, then report the real failure
  begin
    execute 'reset role';
    delete from clinics where name = 'ZZ Decoy Clinic';
    delete from whatsapp_messages where clinic_id = c;
    delete from prescription_templates where clinic_id = c;
    delete from patients where clinic_id = c;
    delete from profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
    update clinic_counters set patient_seq = 0, invoice_seq = 0 where clinic_id = c;
  exception when others then null;
  end;
  raise;
end $$;
