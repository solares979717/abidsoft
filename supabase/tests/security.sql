-- =====================================================================
-- SECURITY TESTS — Shafiq Medical & Diagnostic Center
-- Run on a SCRATCH database after 0001_init.sql, seed.sql and a profiles
-- row. Creates a decoy second clinic, proves it is invisible, then removes
-- it. Any failure raises an exception, so a clean run means all passed.
-- =====================================================================
do $$
declare me uuid; my_clinic uuid; rival uuid; n int;
begin
  select id, clinic_id into me, my_clinic from profiles limit 1;
  if me is null then raise exception 'No profiles row. Complete README step 2 first.'; end if;

  insert into clinics (name) values ('ZZ Decoy Clinic') returning id into rival;
  insert into clinic_settings (clinic_id) values (rival);
  insert into patients (clinic_id, full_name, phone, dob, gender)
    values (rival, 'ZZ Decoy Patient', '03331112222', '1985-01-01', 'male');

  -- Become an ordinary signed-in user. Without this the SQL editor runs as
  -- the table owner and bypasses RLS entirely, so the tests would all pass
  -- for the wrong reason.
  perform set_config('request.jwt.claims', json_build_object('sub', me)::text, true);
  execute 'set local role authenticated';

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

  raise notice '--------------------------------------';
  raise notice 'ALL SECURITY TESTS PASSED';
end $$;
