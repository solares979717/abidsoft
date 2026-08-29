-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — UPGRADE 4
--
--  For a database that already has patients in it.
--  Do NOT run SETUP.sql. Run UPGRADE_3.sql first if you haven't.
--
--  What this adds:
--    1. Only the patient's name is required now. Phone, age, gender and
--       date of birth are all optional — people often don't remember them.
--       Age can be entered as a plain number; the date of birth is worked
--       out and stored behind it, so the age stays correct next year
--       instead of being frozen at whatever was typed.
--    2. Lab and imaging results can be typed in against each test, not
--       only uploaded as a file.
--    3. A saved visit can be continued — the patient comes back with their
--       report and the prescription is added to the same visit, with no
--       second consultation fee and no duplicate record.
--    4. A tick-list of standing advice (bed rest, parhez, and so on),
--       editable from Settings, instead of typing it out every time.
--
--  Safe to run more than once. No existing row's data is changed.
--  Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ONLY THE NAME IS REQUIRED
-- ---------------------------------------------------------------------
alter table patients alter column phone  drop not null;
alter table patients alter column dob    drop not null;
alter table patients alter column gender drop not null;

-- The old CHECK rejected a null date of birth outright. Allow null, but
-- keep rejecting dates that are obviously wrong.
alter table patients drop constraint if exists patients_dob_sane;
alter table patients add constraint patients_dob_sane
  check (dob is null or (dob > '1900-01-01' and dob <= current_date));

-- Records whether the age came from a real date of birth or from the
-- doctor typing "36". Both are usable; only one of them is exact.
alter table patients add column if not exists dob_is_estimated boolean not null default false;

comment on column patients.dob_is_estimated is
  'true when the date of birth was derived from an age the doctor typed, rather than a date the patient actually gave.';

-- Saving a consultation must accept a patient with only a name, and turn a
-- typed age into a date of birth. This replaces the whole function;
-- nothing else about it changes.
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
    -- Only the name is required. Everything else is optional, because
    -- people frequently don't have their number or date of birth with them.
    -- If an age was typed instead of a date of birth, turn it into a date so
    -- the age stays correct next year rather than being frozen.
    insert into patients (clinic_id, full_name, phone, whatsapp, dob, dob_is_estimated,
                          gender, address, primary_doctor_id, created_by)
    values (v_clinic,
            payload#>>'{patient,full_name}',
            nullif(payload#>>'{patient,phone}',''),
            nullif(payload#>>'{patient,whatsapp}',''),
            coalesce(
              nullif(payload#>>'{patient,dob}','')::date,
              case when nullif(payload#>>'{patient,age_years}','') is not null
                   then (current_date - ((payload#>>'{patient,age_years}')::numeric * 365.25)::int)
              end),
            nullif(payload#>>'{patient,dob}','') is null
              and nullif(payload#>>'{patient,age_years}','') is not null,
            lower(nullif(payload#>>'{patient,gender}',''))::gender_t,
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
    -- Close the appointment, and if it was a phone booking made before this
    -- person was registered, attach it to the patient record just created so
    -- the booking and the visit become one connected history.
    update appointments
       set status = 'completed',
           patient_id = coalesce(patient_id, v_patient),
           booking_name = null,
           booking_phone = null
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

-- ---------------------------------------------------------------------
-- 2. TYPED-IN LAB AND IMAGING RESULTS
-- ---------------------------------------------------------------------
alter table visit_investigations add column if not exists result_text text;
alter table visit_investigations add column if not exists result_flag text
  check (result_flag is null or result_flag in ('normal','abnormal'));
alter table visit_investigations add column if not exists result_at timestamptz;
alter table visit_investigations add column if not exists result_by uuid references profiles(id);

comment on column visit_investigations.result_text is
  'What the doctor read off the report, e.g. "Hb 9.2 g/dL". Separate from any uploaded file — a clinic can use either or both.';

-- Writing a result marks the test reviewed and stamps who and when, so the
-- status never has to be updated by hand as a second step.
create or replace function set_investigation_result(
  p_id uuid, p_text text, p_flag text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_flag is not null and p_flag not in ('normal','abnormal') then
    raise exception 'Result flag must be normal or abnormal';
  end if;

  update visit_investigations
     set result_text = nullif(btrim(p_text), ''),
         result_flag = p_flag,
         result_at   = case when nullif(btrim(p_text), '') is null then null else now() end,
         result_by   = case when nullif(btrim(p_text), '') is null then null else auth.uid() end,
         status      = case when nullif(btrim(p_text), '') is null then status else 'reviewed' end,
         reviewed_at = case when nullif(btrim(p_text), '') is null then reviewed_at else now() end,
         reviewed_by = case when nullif(btrim(p_text), '') is null then reviewed_by else auth.uid() end
   where id = p_id and clinic_id = app_clinic_id();

  perform log_audit('investigation_result_recorded', 'visit_investigations', p_id,
                    jsonb_build_object('flag', p_flag));
end $$;

-- ---------------------------------------------------------------------
-- 3. CONTINUING A SAVED VISIT
-- ---------------------------------------------------------------------
-- The patient was seen, tests were ordered, they came back a day later with
-- the report. Clinically that is one consultation, so it must stay one
-- visit: same record, no second fee, nothing overwritten.
--
-- Adds a prescription (and optionally investigations) to a visit that was
-- already saved. Existing prescriptions are never touched — a new one is
-- added, exactly as a new consultation would.
create or replace function continue_visit(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := app_clinic_id();
  v_actor   uuid := auth.uid();
  v_visit   uuid := nullif(payload->>'visit_id','')::uuid;
  v_patient uuid;
  v_doctor  uuid;
  v_rx      uuid;
  v_item    jsonb;
  v_idx     int := 0;
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  if v_visit is null then raise exception 'visit_id is required'; end if;

  select patient_id, doctor_id into v_patient, v_doctor
    from visits where id = v_visit and clinic_id = v_clinic and not is_deleted;
  if v_patient is null then raise exception 'Visit not found in this clinic'; end if;

  -- extra investigations ordered on the return visit
  for v_item in select * from jsonb_array_elements(coalesce(payload->'investigations','[]')) loop
    insert into visit_investigations (clinic_id, patient_id, visit_id, doctor_id, catalog_id,
                                      category, test_name, price)
    values (v_clinic, v_patient, v_visit, v_doctor,
            nullif(v_item->>'catalog_id','')::uuid,
            coalesce(nullif(v_item->>'category',''),'Laboratory'),
            v_item->>'test_name',
            coalesce((v_item->>'price')::numeric, 0));
  end loop;

  -- the prescription written now that the results are in
  if jsonb_array_length(coalesce(payload->'prescription_items','[]')) > 0 then
    insert into prescriptions (clinic_id, patient_id, visit_id, doctor_id, status,
                               advice, issued_at, created_by)
    values (v_clinic, v_patient, v_visit, v_doctor, 'finalized',
            nullif(payload->>'advice',''), now(), v_actor)
    returning id into v_rx;

    for v_item in select * from jsonb_array_elements(payload->'prescription_items') loop
      insert into prescription_items (clinic_id, prescription_id, medicine_id, medicine_name,
                                      strength, dose, frequency, duration, route, instructions,
                                      instruction_other, note, sort_order)
      values (v_clinic, v_rx, nullif(v_item->>'medicine_id','')::uuid, v_item->>'medicine_name',
              nullif(v_item->>'strength',''), nullif(v_item->>'dose',''),
              nullif(v_item->>'frequency',''), nullif(v_item->>'duration',''),
              nullif(v_item->>'route',''),
              coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'instructions','[]'))),'{}'),
              nullif(v_item->>'instruction_other',''), nullif(v_item->>'note',''), v_idx);
      v_idx := v_idx + 1;
    end loop;
  end if;

  -- a follow-up decided at the return visit
  if nullif(payload#>>'{followup,date}','') is not null then
    declare v_appt uuid; v_fu date := (payload#>>'{followup,date}')::date;
    begin
      insert into appointments (clinic_id, patient_id, doctor_id, source_visit_id, scheduled_at,
                                appt_type, status, created_by)
      values (v_clinic, v_patient, v_doctor, v_visit,
              (v_fu::text || ' ' || coalesce(nullif(payload#>>'{followup,time}',''),'10:00'))::timestamptz,
              'follow_up', 'scheduled', v_actor)
      returning id into v_appt;

      insert into followups (clinic_id, patient_id, visit_id, doctor_id, interval_days,
                             follow_up_date, appointment_id)
      values (v_clinic, v_patient, v_visit, v_doctor,
              nullif(payload#>>'{followup,interval_days}','')::int, v_fu, v_appt);
    end;
  end if;

  -- extra charges, added to the visit's existing invoice rather than
  -- creating a second one, so the patient is never billed twice for the
  -- same consultation
  if coalesce((payload#>>'{billing,extra}')::numeric, 0) > 0 then
    declare v_inv uuid; v_extra numeric(10,2) := (payload#>>'{billing,extra}')::numeric;
    begin
      select id into v_inv from invoices
       where visit_id = v_visit and clinic_id = v_clinic and not is_deleted
       order by created_at limit 1;
      if v_inv is not null then
        insert into invoice_items (clinic_id, invoice_id, description, item_type,
                                   quantity, unit_price, amount, sort_order)
        values (v_clinic, v_inv, coalesce(nullif(payload#>>'{billing,label}',''), 'Additional charges'),
                'Other', 1, v_extra, v_extra, 90);
        update invoices
           set charges_total = charges_total + v_extra,
               net_total     = net_total + v_extra
         where id = v_inv;
      end if;
    end;
  end if;

  perform log_audit('visit_continued', 'visits', v_visit,
                    jsonb_build_object('prescription_id', v_rx));

  return jsonb_build_object('visit_id', v_visit, 'patient_id', v_patient,
                            'prescription_id', v_rx);
end $$;

-- ---------------------------------------------------------------------
-- 4. STANDING ADVICE, TICKED NOT TYPED
-- ---------------------------------------------------------------------
create table if not exists advice_catalog (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  text       text not null,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists advice_catalog_uq
  on advice_catalog (clinic_id, lower(text));

alter table advice_catalog enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='advice_catalog' and policyname='advice_sel') then
    create policy advice_sel on advice_catalog for select using (clinic_id = app_clinic_id());
    create policy advice_ins on advice_catalog for insert with check (clinic_id = app_clinic_id());
    create policy advice_upd on advice_catalog for update using (clinic_id = app_clinic_id())
      with check (clinic_id = app_clinic_id());
    create policy advice_del on advice_catalog for delete
      using (clinic_id = app_clinic_id() and app_role() = 'admin');
  end if;
end $$;

grant select, insert, update, delete on advice_catalog to authenticated;

insert into advice_catalog (clinic_id, text, sort_order)
select c.id, v.text, v.ord
from clinics c
cross join (values
  ('Bed rest', 1), ('Plenty of water', 2), ('Light diet', 3),
  ('Avoid spicy food', 4), ('Avoid cold drinks', 5), ('Reduce salt', 6),
  ('Reduce sugar', 7), ('Avoid oily food', 8), ('Regular walk', 9),
  ('Stop smoking', 10), ('Complete the full course of medicine', 11),
  ('Return immediately if it gets worse', 12)
) as v(text, ord)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- SELF TEST
-- ---------------------------------------------------------------------
do $$
declare
  c uuid; d uuid; u uuid; v_pat uuid; v_visit uuid; v_inv uuid; res jsonb; n int;
begin
  select id into c from clinics limit 1;
  select id into d from doctors where clinic_id = c limit 1;
  select id into u from profiles limit 1;
  if c is null or d is null then
    raise exception 'No clinic/doctor found — is this the right database?';
  end if;

  -- a patient with nothing but a name
  insert into patients (clinic_id, full_name) values (c, 'ZZ Name Only')
  returning id into v_pat;
  raise notice 'PASS  a patient can be saved with only a name';

  -- an age typed as a number becomes a date of birth, flagged as estimated
  update patients
     set dob = (current_date - (36 * 365.25)::int), dob_is_estimated = true
   where id = v_pat;
  if date_part('year', age((select dob from patients where id = v_pat)))::int <> 36 then
    raise exception 'FAIL: age 36 did not round-trip through the date of birth';
  end if;
  raise notice 'PASS  age typed as a number is stored as a date and reads back as 36';

  -- a nonsense date of birth is still refused
  begin
    update patients set dob = current_date + 5 where id = v_pat;
    raise exception 'FAIL: a future date of birth was accepted';
  exception when check_violation then
    raise notice 'PASS  an impossible date of birth is still refused';
  end;

  -- typed lab results
  insert into visits (clinic_id, patient_id, doctor_id, visit_type, status)
  values (c, v_pat, d, 'new_consultation', 'completed') returning id into v_visit;
  insert into visit_investigations (clinic_id, patient_id, visit_id, doctor_id, category, test_name)
  values (c, v_pat, v_visit, d, 'Laboratory', 'CBC') returning id into v_inv;

  if u is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
    perform set_investigation_result(v_inv, 'Hb 9.2 g/dL', 'abnormal');
    if (select result_text from visit_investigations where id = v_inv) is null then
      raise exception 'FAIL: the result was not saved';
    end if;
    if (select status from visit_investigations where id = v_inv) <> 'reviewed' then
      raise exception 'FAIL: writing a result did not mark the test reviewed';
    end if;
    raise notice 'PASS  a typed result saves and marks the test reviewed';

    -- continuing the same visit adds a prescription, not a second visit
    res := continue_visit(jsonb_build_object(
      'visit_id', v_visit,
      'prescription_items', jsonb_build_array(
        jsonb_build_object('medicine_name','Ferrous Sulphate','strength','200mg',
                           'dose','1','frequency','OD','duration','30 days')),
      'advice', 'Bed rest. Plenty of water.'
    ));
    if (select count(*) from visits where patient_id = v_pat and not is_deleted) <> 1 then
      raise exception 'FAIL: continuing the visit created a second visit';
    end if;
    if (select count(*) from prescriptions where visit_id = v_visit) <> 1 then
      raise exception 'FAIL: the prescription was not added to the visit';
    end if;
    raise notice 'PASS  a saved visit can be continued without creating a second visit';
    perform set_config('request.jwt.claims', '', true);
  end if;

  -- advice list seeded
  select count(*) into n from advice_catalog where clinic_id = c;
  if n = 0 then raise exception 'FAIL: advice list is empty'; end if;
  raise notice 'PASS  standing advice list ready (% entries)', n;

  -- clean up
  delete from patients where id = v_pat;
  delete from audit_logs where clinic_id = c and entity_id in (v_inv, v_visit);

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' UPGRADE 4 APPLIED — your real data was not touched';
  raise notice '=====================================================';
exception when others then
  begin
    delete from patients where full_name = 'ZZ Name Only';
  exception when others then null;
  end;
  raise;
end $$;
