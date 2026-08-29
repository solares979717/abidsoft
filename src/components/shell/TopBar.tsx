"use client";
import { GlobalSearch } from "./GlobalSearch";
import { AiAssistant } from "./AiAssistant";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, WifiOff } from "lucide-react";
import * as React from "react";

export function TopBar({ userName }: { userName: string }) {
  const router = useRouter();
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-paper px-4 lg:px-6">
      <span className="display shrink-0 text-[15px] text-ink lg:hidden">Shafiq Medical</span>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-3">
        {!online && (
          <span className="flex items-center gap-1.5 rounded-[4px] bg-warn-bg px-2 py-1 text-[12px] font-medium text-warn">
            <WifiOff size={13} /> Offline
          </span>
        )}
        <AiAssistant />
        <span className="hidden text-[13px] text-ink-2 sm:block">{userName}</span>
        <button onClick={signOut} title="Sign out" className="text-ink-3 hover:text-ink">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
