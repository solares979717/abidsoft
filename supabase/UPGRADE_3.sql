-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — UPGRADE 3
--
--  For a database that ALREADY has patients in it.
--  Do NOT run SETUP.sql — it refuses on purpose. This is the correct file.
--
--  What this adds:
--    1. Appointments can be booked for someone who isn't registered yet —
--       just a name and phone number over the telephone. When they arrive,
--       "Start visit" opens the consultation with those details already
--       filled in, and saving registers them properly.
--    2. A recycle bin: soft-deleted records can be restored for 30 days.
--    3. Storage usage reporting, so the 500 MB / 1 GB free limits never
--       run out without warning.
--
--  Safe to run more than once. Touches no existing row's data.
--  Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. APPOINTMENTS FOR PEOPLE WHO AREN'T REGISTERED YET
-- ---------------------------------------------------------------------
-- patient_id becomes optional. When it's null, the walk-in name and phone
-- carry the booking instead. A CHECK makes sure an appointment always has
-- one or the other — it can never be completely anonymous.
alter table appointments alter column patient_id drop not null;

alter table appointments add column if not exists booking_name  text;
alter table appointments add column if not exists booking_phone text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_identifies_someone'
  ) then
    alter table appointments add constraint appointments_identifies_someone
      check (patient_id is not null or nullif(btrim(booking_name), '') is not null);
  end if;
end $$;

create index if not exists appointments_unregistered
  on appointments (clinic_id, scheduled_at) where patient_id is null;

comment on column appointments.booking_name is
  'Name given on the phone when the appointment was made before the patient existed in the system. Cleared once patient_id is filled in.';

-- When an unregistered booking finally becomes a real patient, link them
-- and drop the temporary name/phone so there is only one source of truth.
create or replace function attach_appointment_to_patient(
  p_appointment uuid, p_patient uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update appointments
     set patient_id = p_patient, booking_name = null, booking_phone = null
   where id = p_appointment
     and clinic_id = app_clinic_id()
     and patient_id is null;
end $$;

-- Saving a consultation must now also attach a phone booking to the patient
-- it just created, so the booking and the visit become one connected record.
-- This replaces the whole function; everything else about it is unchanged.
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
-- 2. RECYCLE BIN — 30 DAYS
-- ---------------------------------------------------------------------
-- The is_deleted columns already exist. This records WHEN something was
-- deleted so it can be listed, restored, and eventually cleaned up.
alter table patients      add column if not exists deleted_at timestamptz;
alter table visits        add column if not exists deleted_at timestamptz;
alter table prescriptions add column if not exists deleted_at timestamptz;
alter table appointments  add column if not exists deleted_at timestamptz;
alter table invoices      add column if not exists deleted_at timestamptz;
alter table documents     add column if not exists deleted_at timestamptz;

create or replace function stamp_deleted_at() returns trigger
language plpgsql as $$
begin
  if new.is_deleted and not coalesce(old.is_deleted, false) then
    new.deleted_at := now();
  elsif not new.is_deleted then
    new.deleted_at := null;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['patients','visits','prescriptions','appointments','invoices','documents']
  loop
    execute format('drop trigger if exists t_%s_deleted_at on %I', t, t);
    execute format(
      'create trigger t_%s_deleted_at before update on %I
         for each row execute function stamp_deleted_at()', t, t);
  end loop;
end $$;

-- Everything deleted in the last 30 days, newest first.
create or replace function deleted_items()
returns table (entity text, id uuid, label text, deleted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select 'patient', p.id, p.full_name || ' (' || p.patient_no || ')', p.deleted_at
    from patients p
   where p.clinic_id = app_clinic_id() and p.is_deleted
     and p.deleted_at > now() - interval '30 days'
  union all
  select 'visit', v.id, to_char(v.visit_date, 'DD Mon YYYY') || ' — ' ||
         coalesce((select pt.full_name from patients pt where pt.id = v.patient_id), '?'),
         v.deleted_at
    from visits v
   where v.clinic_id = app_clinic_id() and v.is_deleted
     and v.deleted_at > now() - interval '30 days'
  union all
  select 'invoice', i.id, i.invoice_no, i.deleted_at
    from invoices i
   where i.clinic_id = app_clinic_id() and i.is_deleted
     and i.deleted_at > now() - interval '30 days'
  order by 4 desc;
$$;

create or replace function restore_deleted(p_entity text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_entity not in ('patient','visit','invoice','prescription','appointment','document') then
    raise exception 'Unknown record type';
  end if;
  execute format(
    'update %I set is_deleted = false where id = $1 and clinic_id = $2',
    case p_entity
      when 'patient' then 'patients'      when 'visit' then 'visits'
      when 'invoice' then 'invoices'      when 'prescription' then 'prescriptions'
      when 'appointment' then 'appointments' else 'documents' end
  ) using p_id, app_clinic_id();
  perform log_audit('record_restored', p_entity, p_id, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 3. STORAGE USAGE — so the free-tier limits never surprise anyone
-- ---------------------------------------------------------------------
create or replace function storage_usage()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'database_bytes', (select pg_database_size(current_database())),
    'database_limit_bytes', 500 * 1024 * 1024,
    'files_bytes', coalesce((
      select sum(coalesce(d.file_size, 0)) from documents d
       where d.clinic_id = app_clinic_id() and not d.is_deleted), 0)
      + coalesce((
      select sum(coalesce(r.file_size, 0)) from investigation_reports r
       where r.clinic_id = app_clinic_id()), 0),
    'files_limit_bytes', 1024 * 1024 * 1024,
    'patients', (select count(*) from patients where clinic_id = app_clinic_id() and not is_deleted),
    'visits',   (select count(*) from visits   where clinic_id = app_clinic_id() and not is_deleted),
    'documents',(select count(*) from documents where clinic_id = app_clinic_id() and not is_deleted)
  );
$$;

-- ---------------------------------------------------------------------
-- SELF TEST — creates throwaway rows, proves it works, removes them
-- ---------------------------------------------------------------------
do $$
declare c uuid; d uuid; v_appt uuid; v_pat uuid; n int;
begin
  select id into c from clinics limit 1;
  select id into d from doctors where clinic_id = c limit 1;
  if c is null or d is null then
    raise exception 'No clinic/doctor found — is this the right database?';
  end if;

  -- an appointment with no patient at all, just a name from a phone call
  insert into appointments (clinic_id, doctor_id, scheduled_at, appt_type, status,
                            booking_name, booking_phone)
  values (c, d, now() + interval '2 days', 'new_patient', 'scheduled',
          'ZZ Phone Booking', '03001234567')
  returning id into v_appt;
  raise notice 'PASS  appointment booked without a registered patient';

  -- it must refuse a booking that identifies nobody
  begin
    insert into appointments (clinic_id, doctor_id, scheduled_at, appt_type, status)
    values (c, d, now() + interval '2 days', 'custom', 'scheduled');
    raise exception 'FAIL: an appointment with no patient and no name was allowed';
  exception when check_violation then
    raise notice 'PASS  an appointment must name someone';
  end;

  -- the real flow: "Register & start visit" on a phone booking runs
  -- save_visit with that appointment id, which must register the patient AND
  -- attach the booking to them in one go
  declare u uuid; res jsonb;
  begin
    select id into u from profiles limit 1;
    if u is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
      res := save_visit(jsonb_build_object(
        'doctor_id', d,
        'appointment_id', v_appt,
        'patient', jsonb_build_object('full_name','ZZ Phone Booking','phone','03001234567',
                                      'dob','1990-01-01','gender','Male'),
        'visit_type','New Consultation'
      ));
      v_pat := (res->>'patient_id')::uuid;
      if (select patient_id from appointments where id = v_appt) is distinct from v_pat then
        raise exception 'FAIL: booking did not attach to the newly registered patient';
      end if;
      if (select booking_name from appointments where id = v_appt) is not null then
        raise exception 'FAIL: temporary booking name was not cleared';
      end if;
      if (select status from appointments where id = v_appt) <> 'completed' then
        raise exception 'FAIL: appointment was not closed';
      end if;
      raise notice 'PASS  Register and start visit turns a phone booking into a real patient';
      perform set_config('request.jwt.claims', '', true);
    end if;
  end;

  -- recycle bin records the time and can restore. This makes its own patient
  -- rather than reusing the one above, because the save_visit test only runs
  -- when a profiles row exists — on a brand new database it doesn't, and this
  -- check must still run.
  declare v_bin uuid;
  begin
    insert into patients (clinic_id, full_name, phone, dob, gender)
    values (c, 'ZZ Recycle Probe', '03000000002', '1990-01-01', 'male')
    returning id into v_bin;

    update patients set is_deleted = true where id = v_bin;
    if (select deleted_at from patients where id = v_bin) is null then
      raise exception 'FAIL: deleted_at was not stamped';
    end if;
    update patients set is_deleted = false where id = v_bin;
    if (select deleted_at from patients where id = v_bin) is not null then
      raise exception 'FAIL: deleted_at was not cleared on restore';
    end if;
    delete from patients where id = v_bin;
    raise notice 'PASS  recycle bin stamps and clears the deletion time';
  end;

  -- storage reporting answers
  if (storage_usage() ->> 'database_bytes') is null then
    raise exception 'FAIL: storage usage did not report';
  end if;
  raise notice 'PASS  storage usage reports (database now %)',
    pg_size_pretty((storage_usage() ->> 'database_bytes')::bigint);

  -- clean up everything this test made (deleting the patient cascades to the
  -- visit, invoice and prescription save_visit created)
  delete from appointments where id = v_appt;
  if v_pat is not null then
    delete from patients where id = v_pat;
    delete from audit_logs where clinic_id = c and entity_id = v_pat;
  end if;
  delete from patients where full_name in ('ZZ Phone Booking','ZZ Recycle Probe');

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' UPGRADE 3 APPLIED — your real data was not touched';
  raise notice '=====================================================';
exception when others then
  begin
    delete from appointments where booking_name = 'ZZ Phone Booking';
    delete from appointments where id = v_appt;
    delete from patients where full_name = 'ZZ Phone Booking';
  exception when others then null;
  end;
  raise;
end $$;
