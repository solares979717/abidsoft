import { createClient } from "@/lib/supabase/server";
import { buildBackup } from "@/lib/backup";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Download a backup right now. Same content as the nightly job, but reached
 * from Settings → Backup by a signed-in user rather than by the scheduler,
 * so a copy can always be taken on demand — before a risky change, or just
 * to keep one on the clinic computer.
 */
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { body } = await buildBackup();
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shafiq-backup-${date}.csv"`,
    },
  });
}
