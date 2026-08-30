-- =====================================================================
--  SHAFIQ MEDICAL & DIAGNOSTIC CENTER — UPGRADE 6
--
--  Run the earlier UPGRADE files first if you haven't.
--
--  Fixes temperature. The consultation form asks for °F, which is what
--  the clinic uses, but the column only accepted 30–45 (°C) and silently
--  rejected every reading — so temperature never appeared on the visit
--  page or the printed sheet even though it had been typed in.
--
--  Safe to run more than once. No existing row's data is changed.
-- =====================================================================

alter table vitals drop constraint if exists vitals_temperature_check;
alter table vitals add constraint vitals_temperature_check
  -- Either scale: 30–45 °C or 86–113 °F. temp_unit records which one.
  check (temperature is null
         or temperature between 30 and 45
         or temperature between 86 and 113);

do $$
declare c uuid; d uuid; u uuid; res jsonb; v_pat uuid; r record;
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
    'patient', jsonb_build_object('full_name','ZZ Temp Test','age_years','22'),
    'visit_type','New Consultation',
    'vitals', jsonb_build_object('bp_systolic','120','bp_diastolic','70',
      'pulse','66','temperature','98.6','temp_unit','F','spo2','98')));
  v_pat := (res->>'patient_id')::uuid;

  select * into r from vitals where visit_id = (res->>'visit_id')::uuid;
  if r.temperature is null then raise exception 'FAIL: temperature still not saved'; end if;
  if r.temp_unit <> 'F' then raise exception 'FAIL: unit not stored'; end if;
  raise notice 'PASS  a Fahrenheit temperature (% °%) now saves', r.temperature, r.temp_unit;

  -- Celsius must still work for anyone who records it that way
  update vitals set temperature = 37.2, temp_unit = 'C' where visit_id = (res->>'visit_id')::uuid;
  raise notice 'PASS  Celsius still accepted';

  -- and an impossible reading is still refused
  begin
    update vitals set temperature = 250 where visit_id = (res->>'visit_id')::uuid;
    raise exception 'FAIL: an impossible temperature was accepted';
  exception when check_violation then
    raise notice 'PASS  an impossible temperature is still refused';
  end;

  delete from patients where id = v_pat;
  delete from audit_logs where entity_id = v_pat;
  perform set_config('request.jwt.claims', '', true);

  raise notice ' ';
  raise notice '=====================================================';
  raise notice ' UPGRADE 6 APPLIED — your real data was not touched';
  raise notice '=====================================================';
exception when others then
  begin delete from patients where full_name = 'ZZ Temp Test'; exception when others then null; end;
  raise;
end $$;
