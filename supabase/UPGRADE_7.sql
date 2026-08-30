-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — UPGRADE 7
--
--  Run the earlier UPGRADE files first if you haven't.
--
--  A saved visit is now editable.
--
--  The reason: a patient is sent for tests and comes back the same day or
--  the next. That is still one consultation in progress — the results may
--  change the diagnosis, the blood pressure may be taken again, and the
--  prescription is often being written for the first time. Until now
--  everything above the "Continue" panel was frozen, which forced the
--  doctor to either leave stale information on the record or start a
--  second visit that never really happened.
--
--  What changed:
--    1. Complaints, vitals, examination, diagnosis and the doctor's
--       private note can all be corrected on a saved visit.
--    2. A finalised prescription can be edited instead of being refused
--       outright. Every edit is written to the audit log, so the record
--       still shows what was changed and by whom.
--    3. Prescriptions remember when they were first printed or sent, so
--       the app can warn before changing one the patient already has.
--
--  Safe to run more than once. No existing row's data is changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. KNOW WHETHER THE PATIENT ALREADY HAS THE PRESCRIPTION
-- ---------------------------------------------------------------------
alter table prescriptions add column if not exists shared_at timestamptz;

comment on column prescriptions.shared_at is
  'First time this prescription was printed or sent on WhatsApp. Null means the patient does not have it yet, so it can be edited freely.';

create or replace function mark_prescription_shared(p_id uuid)
returns void
language sql security definer set search_path = public as $$
  update prescriptions set shared_at = coalesce(shared_at, now())
   where id = p_id and clinic_id = app_clinic_id();
$$;

-- ---------------------------------------------------------------------
-- 2. ALLOW EDITING A FINALISED PRESCRIPTION, BUT RECORD IT
-- ---------------------------------------------------------------------
-- The old rule refused the edit completely. That was the wrong trade-off
-- for a clinic where the prescription is usually written after the tests
-- come back. The safeguard is now an audit entry rather than a refusal —
-- the change is allowed, and the record shows it happened.
drop trigger if exists t_rx_items_immutable on prescription_items;

create or replace function audit_rx_item_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status rx_status_t; v_shared timestamptz; v_rx uuid;
begin
  v_rx := coalesce(new.prescription_id, old.prescription_id);
  select status, shared_at into v_status, v_shared from prescriptions where id = v_rx;

  if v_status = 'finalized' then
    perform log_audit(
      case when tg_op = 'DELETE' then 'prescription_item_removed'
           else 'prescription_item_edited' end,
      'prescriptions', v_rx,
      jsonb_build_object(
        'medicine', coalesce(new.medicine_name, old.medicine_name),
        'was_already_given_to_patient', v_shared is not null,
        'before', case when tg_op = 'DELETE' then null else jsonb_build_object(
          'dose', old.dose, 'frequency', old.frequency, 'duration', old.duration) end,
        'after', case when tg_op = 'DELETE' then null else jsonb_build_object(
          'dose', new.dose, 'frequency', new.frequency, 'duration', new.duration) end));
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists t_rx_items_audited on prescription_items;
create trigger t_rx_items_audited before update or delete on prescription_items
  for each row execute function audit_rx_item_edit();

-- ---------------------------------------------------------------------
-- 3. CORRECT THE REST OF A SAVED VISIT
-- ---------------------------------------------------------------------
-- Replaces the complaints, vitals, examination and diagnoses of one visit
-- with whatever the doctor now has. Only the keys that are present in the
-- payload are touched, so the panel can send just the section that was
-- edited rather than rewriting the whole visit every time.
create or replace function update_visit_details(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := app_clinic_id();
  v_visit  uuid := nullif(payload->>'visit_id','')::uuid;
  v_item   jsonb;
  v_idx    int := 0;
  v_changed text[] := '{}';
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  if v_visit is null then raise exception 'visit_id is required'; end if;
  if not exists (select 1 from visits
                 where id = v_visit and clinic_id = v_clinic and not is_deleted) then
    raise exception 'Visit not found in this clinic';
  end if;

  if payload ? 'complaints' then
    delete from visit_complaints where visit_id = v_visit;
    for v_item in select * from jsonb_array_elements(payload->'complaints') loop
      insert into visit_complaints (clinic_id, visit_id, complaint, duration_value,
                                    duration_unit, sort_order)
      values (v_clinic, v_visit, v_item->>'complaint',
              nullif(v_item->>'duration_value','')::numeric,
              lower(nullif(v_item->>'duration_unit','')), v_idx);
      v_idx := v_idx + 1;
    end loop;
    v_changed := array_append(v_changed, 'complaints');
  end if;

  if payload ? 'vitals' then
    delete from vitals where visit_id = v_visit;
    if jsonb_typeof(payload->'vitals') = 'object'
       and payload->'vitals' <> '{}'::jsonb then
      insert into vitals (clinic_id, visit_id, patient_id, bp_systolic, bp_diastolic,
                          pulse, temperature, temp_unit, weight_kg, height_cm, spo2, resp_rate)
      select v_clinic, v_visit, v.patient_id,
             nullif(payload#>>'{vitals,bp_systolic}','')::int,
             nullif(payload#>>'{vitals,bp_diastolic}','')::int,
             nullif(payload#>>'{vitals,pulse}','')::int,
             nullif(payload#>>'{vitals,temperature}','')::numeric,
             coalesce(nullif(payload#>>'{vitals,temp_unit}',''),'F'),
             nullif(payload#>>'{vitals,weight_kg}','')::numeric,
             nullif(payload#>>'{vitals,height_cm}','')::numeric,
             nullif(payload#>>'{vitals,spo2}','')::int,
             nullif(payload#>>'{vitals,resp_rate}','')::int
        from visits v where v.id = v_visit;
    end if;
    v_changed := array_append(v_changed, 'vitals');
  end if;

  if payload ? 'examination' then
    delete from physical_examinations where visit_id = v_visit;
    insert into physical_examinations (clinic_id, visit_id, general, chest, cvs,
                                       abdomen, cns, other_findings)
    values (v_clinic, v_visit,
            lower(nullif(payload#>>'{examination,general}','')),
            lower(nullif(payload#>>'{examination,chest}','')),
            lower(nullif(payload#>>'{examination,cvs}','')),
            lower(nullif(payload#>>'{examination,abdomen}','')),
            lower(nullif(payload#>>'{examination,cns}','')),
            nullif(payload#>>'{examination,other_findings}',''));
    v_changed := array_append(v_changed, 'examination');
  end if;

  if payload ? 'diagnoses' then
    delete from visit_diagnoses where visit_id = v_visit;
    v_idx := 0;
    for v_item in select * from jsonb_array_elements(payload->'diagnoses') loop
      insert into visit_diagnoses (clinic_id, visit_id, diagnosis_id, diagnosis_text,
                                   is_primary, sort_order)
      values (v_clinic, v_visit, nullif(v_item->>'diagnosis_id','')::uuid,
              v_item->>'diagnosis_text',
              coalesce((v_item->>'is_primary')::boolean, v_idx = 0), v_idx);
      v_idx := v_idx + 1;
    end loop;
    v_changed := array_append(v_changed, 'diagnoses');
  end if;

  if payload ? 'private_notes' then
    update visits set private_notes = nullif(payload->>'private_notes','')
     where id = v_visit and clinic_id = v_clinic;
    v_changed := array_append(v_changed, 'private_note');
  end if;

  perform log_audit('visit_edited', 'visits', v_visit,
                    jsonb_build_object('sections', to_jsonb(v_changed)));

  return jsonb_build_object('visit_id', v_visit, 'changed', to_jsonb(v_changed));
end $$;

-- Replaces every item of an existing prescription with the list given.
-- Used when the doctor corrects a prescription rather than adding a new one.
create or replace function replace_prescription_items(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := app_clinic_id();
  v_rx     uuid := nullif(payload->>'prescription_id','')::uuid;
  v_item   jsonb;
  v_idx    int := 0;
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  if v_rx is null then raise exception 'prescription_id is required'; end if;
  if not exists (select 1 from prescriptions
                 where id = v_rx and clinic_id = v_clinic and not is_deleted) then
    raise exception 'Prescription not found in this clinic';
  end if;

  delete from prescription_items where prescription_id = v_rx;

  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]')) loop
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

  if payload ? 'advice' then
    update prescriptions set advice = nullif(payload->>'advice','') where id = v_rx;
  end if;

  perform log_audit('prescription_replaced', 'prescriptions', v_rx,
                    jsonb_build_object('items', v_idx));

  return jsonb_build_object('prescription_id', v_rx, 'items', v_idx);
end $$;

-- ---------------------------------------------------------------------
-- SELF TEST
-- ---------------------------------------------------------------------
do $$
declare
  c uuid; d uuid; u uuid; res jsonb; v_pat uuid; v_visit uuid; v_rx uuid; n int; t text;
begin
  select id into c from clinics limit 1;
  select id into d from doctors where clinic_id = c limit 1;
  select id into u from profiles limit 1;
  if u is null then
    raise notice 'SKIPPED — add your login to the clinic first (README step 2)';
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);

  res := save_visit(jsonb_build_object('doctor_id', d,
    'patient', jsonb_build_object('full_name','ZZ Edit Test','age_years','35'),
    'visit_type','New Consultation',
    'complaints', jsonb_build_array(
      jsonb_build_object('complaint','Fever','duration_value','3','duration_unit','Days')),
    'vitals', jsonb_build_object('bp_systolic','120','bp_diastolic','80','temperature','101','temp_unit','F'),
    'diagnoses', jsonb_build_array(jsonb_build_object('diagnosis_text','Viral Fever')),
    'prescription_items', jsonb_build_array(
      jsonb_build_object('medicine_name','Panadol','dose','1','frequency','BD','duration','3 days'))));
  v_pat := (res->>'patient_id')::uuid;
  v_visit := (res->>'visit_id')::uuid;
  v_rx := (res->>'prescription_id')::uuid;

  -- the results came back and changed the picture
  perform update_visit_details(jsonb_build_object(
    'visit_id', v_visit,
    'complaints', jsonb_build_array(
      jsonb_build_object('complaint','Fever','duration_value','5','duration_unit','Days'),
      jsonb_build_object('complaint','Body Ache','duration_value','2','duration_unit','Days')),
    'vitals', jsonb_build_object('bp_systolic','130','bp_diastolic','85','temperature','99','temp_unit','F'),
    'diagnoses', jsonb_build_array(jsonb_build_object('diagnosis_text','Typhoid Fever')),
    'private_notes', 'Widal positive. Watch for relapse.'));

  select count(*) into n from visit_complaints where visit_id = v_visit;
  if n <> 2 then raise exception 'FAIL: complaints not updated (% found)', n; end if;
  select diagnosis_text into t from visit_diagnoses where visit_id = v_visit;
  if t <> 'Typhoid Fever' then raise exception 'FAIL: diagnosis not updated (%)', t; end if;
  select bp_systolic::text into t from vitals where visit_id = v_visit;
  if t <> '130' then raise exception 'FAIL: vitals not updated (%)', t; end if;
  select private_notes into t from visits where id = v_visit;
  if t is null then raise exception 'FAIL: private note not saved'; end if;
  raise notice 'PASS  complaints, vitals, diagnosis and the private note can all be corrected';

  -- editing a finalised prescription is now allowed, and recorded
  perform replace_prescription_items(jsonb_build_object(
    'prescription_id', v_rx,
    'items', jsonb_build_array(
      jsonb_build_object('medicine_name','Ciprofloxacin','strength','500mg',
                         'dose','1','frequency','BD','duration','7 days')),
    'advice','Complete the full course'));

  select medicine_name into t from prescription_items where prescription_id = v_rx;
  if t <> 'Ciprofloxacin' then raise exception 'FAIL: prescription not replaced (%)', t; end if;
  select count(*) into n from prescription_items where prescription_id = v_rx;
  if n <> 1 then raise exception 'FAIL: old medicine left behind'; end if;
  raise notice 'PASS  a finalised prescription can be corrected';

  select count(*) into n from audit_logs
   where entity_id = v_rx and action = 'prescription_replaced';
  if n <> 1 then raise exception 'FAIL: the prescription edit was not audited'; end if;
  select count(*) into n from audit_logs
   where entity_id = v_visit and action = 'visit_edited';
  if n <> 1 then raise exception 'FAIL: the visit edit was not audited'; end if;
  raise notice 'PASS  every edit is written to the audit log';

  -- sharing is remembered, so the app can warn before a later change
  if (select shared_at from prescriptions where id = v_rx) is not null then
    raise exception 'FAIL: prescription marked shared before it was';
  end if;
  perform mark_prescription_shared(v_rx);
  if (select shared_at from prescriptions where id = v_rx) is null then
    raise exception 'FAIL: sharing was not recorded';
  end if;
  raise notice 'PASS  the app knows when the patient already has the prescription';

  delete from patients where id = v_pat;
  delete from audit_logs where entity_id in (v_pat, v_visit, v_rx);
  perform set_config('request.jwt.claims', '', true);

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' UPGRADE 7 APPLIED — your real data was not touched';
  raise notice '=====================================================';
exception when others then
  begin delete from patients where full_name = 'ZZ Edit Test'; exception when others then null; end;
  raise;
end $$;
