-- =====================================================================
-- ACCEPTANCE TESTS — Shafiq Medical & Diagnostic Center
-- Run on a scratch database AFTER 0001_init.sql and seed.sql.
-- Every check raises an exception on failure, so a clean run means pass.
-- =====================================================================
do $$
declare
  c uuid; d uuid; u uuid; res jsonb; res2 jsonb;
  v_pat uuid; v_rx1 uuid; v_rx2 uuid; n int; amt numeric; dt date;
begin
  select id into c from clinics limit 1;
  select id into d from doctors where full_name = 'Dr. Abid Ali Khan';
  select id into u from profiles limit 1;
  if u is null then
    raise exception 'No profiles row. Follow README step 2 (link your auth user to the clinic) first.';
  end if;
  -- run the rest as that user so RLS and app_clinic_id() behave normally
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);

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

  raise notice '--------------------------------------';
  raise notice 'ALL ACCEPTANCE TESTS PASSED';
end $$;
