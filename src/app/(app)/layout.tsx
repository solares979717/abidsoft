import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles").select("full_name").eq("id", user.id).single();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-60">
        <TopBar userName={profile?.full_name ?? user.email ?? "Doctor"} />
        <main className="mx-auto max-w-[1440px] p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
