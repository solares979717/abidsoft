-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — UPGRADE 5
--
--  Run UPGRADE_3.sql and UPGRADE_4.sql first if you haven't.
--
--  Deleting a patient now takes their whole record with it — visits,
--  prescriptions, investigations, appointments, invoices, payments and
--  documents. Until now only the patient row was hidden, so their
--  prescriptions and bills still appeared in the module lists, which is
--  both confusing and wrong.
--
--  Two ways to delete, and the difference matters:
--
--    delete_patient()  — hides everything, recoverable for 30 days from
--                        Settings → Recycle bin. This is what the Delete
--                        button uses. A mis-click at a busy desk should
--                        never be permanent.
--
--    purge_patient()   — actually removes the rows from the database and
--                        cannot be undone. For test data and for genuine
--                        erasure requests. Admin only.
--
--  Safe to run more than once. No existing row's data is changed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. HIDE A PATIENT AND EVERYTHING ATTACHED TO THEM
-- ---------------------------------------------------------------------
create or replace function delete_patient(p_patient uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := app_clinic_id();
  v_visits int; v_rx int; v_inv int; v_appt int; v_docs int;
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  if not exists (select 1 from patients where id = p_patient and clinic_id = v_clinic) then
    raise exception 'Patient not found in this clinic';
  end if;

  update visits set is_deleted = true
   where patient_id = p_patient and clinic_id = v_clinic and not is_deleted;
  get diagnostics v_visits = row_count;

  update prescriptions set is_deleted = true
   where patient_id = p_patient and clinic_id = v_clinic and not is_deleted;
  get diagnostics v_rx = row_count;

  update invoices set is_deleted = true
   where patient_id = p_patient and clinic_id = v_clinic and not is_deleted;
  get diagnostics v_inv = row_count;

  update appointments set is_deleted = true
   where patient_id = p_patient and clinic_id = v_clinic and not is_deleted;
  get diagnostics v_appt = row_count;

  update documents set is_deleted = true
   where patient_id = p_patient and clinic_id = v_clinic and not is_deleted;
  get diagnostics v_docs = row_count;

  -- Investigations have no is_deleted column of their own; they belong to a
  -- visit, so hiding the visit is what removes them from the lists. The
  -- module list filters on the visit, so nothing extra is needed here.

  update patients set is_deleted = true where id = p_patient and clinic_id = v_clinic;

  perform log_audit('patient_deleted', 'patients', p_patient,
    jsonb_build_object('visits', v_visits, 'prescriptions', v_rx,
                       'invoices', v_inv, 'appointments', v_appt, 'documents', v_docs));

  return jsonb_build_object('visits', v_visits, 'prescriptions', v_rx,
    'invoices', v_inv, 'appointments', v_appt, 'documents', v_docs);
end $$;

-- Restoring brings the whole record back the same way.
create or replace function restore_patient(p_patient uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := app_clinic_id();
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  update patients      set is_deleted = false where id = p_patient and clinic_id = v_clinic;
  update visits        set is_deleted = false where patient_id = p_patient and clinic_id = v_clinic;
  update prescriptions set is_deleted = false where patient_id = p_patient and clinic_id = v_clinic;
  update invoices      set is_deleted = false where patient_id = p_patient and clinic_id = v_clinic;
  update appointments  set is_deleted = false where patient_id = p_patient and clinic_id = v_clinic;
  update documents     set is_deleted = false where patient_id = p_patient and clinic_id = v_clinic;
  perform log_audit('patient_restored', 'patients', p_patient, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 2. PERMANENT ERASURE
-- ---------------------------------------------------------------------
-- Actually deletes the rows. The foreign keys already cascade, so removing
-- the patient removes their visits, prescriptions, investigations,
-- appointments, invoices, payments and documents with them.
--
-- Admin only, and it cannot be undone — the recycle bin exists precisely so
-- that this is a deliberate act rather than the normal way to delete.
create or replace function purge_patient(p_patient uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := app_clinic_id();
  v_name text; v_no text; v_visits int; v_inv int;
begin
  if v_clinic is null then raise exception 'No clinic is linked to this user'; end if;
  if app_role() <> 'admin' then
    raise exception 'Only an administrator can permanently delete a patient';
  end if;

  select full_name, patient_no into v_name, v_no
    from patients where id = p_patient and clinic_id = v_clinic;
  if v_name is null then raise exception 'Patient not found in this clinic'; end if;

  select count(*) into v_visits from visits   where patient_id = p_patient;
  select count(*) into v_inv    from invoices where patient_id = p_patient;

  -- Written before the delete, so the audit trail survives the patient.
  perform log_audit('patient_purged', 'patients', p_patient,
    jsonb_build_object('patient_no', v_no, 'name', v_name,
                       'visits', v_visits, 'invoices', v_inv));

  delete from patients where id = p_patient and clinic_id = v_clinic;

  return jsonb_build_object('patient_no', v_no, 'visits', v_visits, 'invoices', v_inv);
end $$;

-- ---------------------------------------------------------------------
-- SELF TEST
-- ---------------------------------------------------------------------
do $$
declare
  c uuid; d uuid; u uuid; res jsonb; v_pat uuid; n int;
begin
  select id into c from clinics limit 1;
  select id into d from doctors where clinic_id = c limit 1;
  select id into u from profiles limit 1;
  if u is null then
    raise notice 'SKIPPED — add your login to the clinic first (README step 2)';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);

  res := save_visit(jsonb_build_object(
    'doctor_id', d,
    'patient', jsonb_build_object('full_name','ZZ Cascade Test','age_years','30'),
    'visit_type','New Consultation',
    'investigations', jsonb_build_array(
      jsonb_build_object('test_name','CBC','category','Laboratory','price',0)),
    'prescription_items', jsonb_build_array(
      jsonb_build_object('medicine_name','Panadol','dose','1','frequency','BD','duration','5 days')),
    'followup', jsonb_build_object('type','scheduled','interval_days',7,
                                   'date',(current_date + 7)::text),
    'billing', jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('item_type','Consultation','description','Fee','quantity',1,
                         'unit_price',500,'amount',500)),'discount',0,'paid',0)));
  v_pat := (res->>'patient_id')::uuid;

  -- delete takes the whole record with it
  perform delete_patient(v_pat);

  select count(*) into n from visits where patient_id=v_pat and not is_deleted;
  if n <> 0 then raise exception 'FAIL: % visit(s) still visible', n; end if;
  select count(*) into n from prescriptions where patient_id=v_pat and not is_deleted;
  if n <> 0 then raise exception 'FAIL: % prescription(s) still visible', n; end if;
  select count(*) into n from invoices where patient_id=v_pat and not is_deleted;
  if n <> 0 then raise exception 'FAIL: % invoice(s) still visible', n; end if;
  select count(*) into n from appointments where patient_id=v_pat and not is_deleted;
  if n <> 0 then raise exception 'FAIL: % appointment(s) still visible', n; end if;
  raise notice 'PASS  deleting a patient hides their visits, prescriptions, invoices and appointments';

  -- and restore brings it all back
  perform restore_patient(v_pat);
  select count(*) into n from visits where patient_id=v_pat and not is_deleted;
  if n <> 1 then raise exception 'FAIL: visit did not come back'; end if;
  select count(*) into n from invoices where patient_id=v_pat and not is_deleted;
  if n <> 1 then raise exception 'FAIL: invoice did not come back'; end if;
  raise notice 'PASS  restoring brings the whole record back';

  -- permanent erasure really removes everything
  perform purge_patient(v_pat);
  select count(*) into n from patients where id = v_pat;
  if n <> 0 then raise exception 'FAIL: patient row survived the purge'; end if;
  select count(*) into n from visits where patient_id = v_pat;
  if n <> 0 then raise exception 'FAIL: % visit row(s) survived the purge', n; end if;
  select count(*) into n from invoices where patient_id = v_pat;
  if n <> 0 then raise exception 'FAIL: % invoice row(s) survived the purge', n; end if;
  select count(*) into n from prescriptions where patient_id = v_pat;
  if n <> 0 then raise exception 'FAIL: % prescription row(s) survived the purge', n; end if;
  raise notice 'PASS  permanent delete removes every trace from the database';

  -- the audit trail still records that it happened
  select count(*) into n from audit_logs
   where entity_id = v_pat and action = 'patient_purged';
  if n <> 1 then raise exception 'FAIL: the purge was not recorded in the audit log'; end if;
  raise notice 'PASS  the deletion itself is still recorded in the audit log';

  delete from audit_logs where entity_id = v_pat;
  perform set_config('request.jwt.claims', '', true);

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' UPGRADE 5 APPLIED — your real data was not touched';
  raise notice '=====================================================';
exception when others then
  begin
    delete from patients where full_name = 'ZZ Cascade Test';
  exception when others then null;
  end;
  raise;
end $$;
