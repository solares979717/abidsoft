export function Letterhead({
  clinic, doctor,
}: {
  clinic: { name: string; address: string | null; phone_1: string | null; phone_2: string | null };
  doctor?: { full_name: string; qualification: string | null; affiliation: string | null };
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-6 border-b-[3px] pb-3"
      style={{ borderColor: "#1656A6" }}>
      <div>
        <h1 className="display text-[19px] font-semibold leading-tight text-black">{clinic.name}</h1>
        <p className="mt-0.5 text-[11px] text-black/70">{clinic.address}</p>
        <p className="data text-[11px] text-black/70">
          {[clinic.phone_1, clinic.phone_2].filter(Boolean).join("   ·   ")}
        </p>
      </div>
      {doctor && (
        <div className="shrink-0 text-right">
          <p className="text-[14px] font-semibold text-black">{doctor.full_name}</p>
          <p className="text-[11px] text-black/70">{doctor.qualification}</p>
          <p className="text-[11px] text-black/70">{doctor.affiliation}</p>
        </div>
      )}
    </header>
  );
}
