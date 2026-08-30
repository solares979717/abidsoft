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
