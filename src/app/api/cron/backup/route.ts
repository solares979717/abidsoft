import { buildBackup } from "@/lib/backup";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily backup, run by Vercel Cron (see vercel.json) and protected by
 * CRON_SECRET. Everything lives in one Supabase project, so this puts a
 * copy somewhere else every night without anyone remembering to.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { body, totalRows } = await buildBackup();
  const date = new Date().toISOString().slice(0, 10);

  // If an email service is configured, post it there. Without one the backup
  // is still produced and returned, so nothing silently does nothing.
  const hook = process.env.BACKUP_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `shafiq-backup-${date}.csv`,
          rows: totalRows,
          content: body,
        }),
      });
      return NextResponse.json({ ok: true, rows: totalRows, delivered: "webhook" });
    } catch (e) {
      return NextResponse.json(
        { ok: false, rows: totalRows, error: (e as Error).message }, { status: 502 });
    }
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shafiq-backup-${date}.csv"`,
    },
  });
}
