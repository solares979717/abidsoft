"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, FormRow } from "@/components/ui/Field";
import * as React from "react";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError("Email or password is not correct."); setBusy(false); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[6px] bg-primary text-[17px] font-semibold text-white">S</div>
          <h1 className="display text-[20px] text-ink">Shafiq Medical &amp; Diagnostic Center</h1>
          <p className="text-[13px] text-ink-3">Main Road, Kala Kelay, Swat</p>
        </div>
        <form onSubmit={submit} className="rounded-[6px] border border-line bg-paper p-5 shadow-[var(--shadow-card)]">
          <FormRow label="Email" className="mb-3">
            <Input type="email" value={email} required autoFocus
              onChange={(e) => setEmail(e.target.value)} />
          </FormRow>
          <FormRow label="Password" className="mb-4">
            <Input type="password" value={password} required
              onChange={(e) => setPassword(e.target.value)} />
          </FormRow>
          {error && <p className="mb-3 rounded-[4px] bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
        </form>
        <p className="mt-4 text-center text-[12px] text-ink-3">
          Accounts are created by the clinic administrator in Supabase.
        </p>
      </div>
    </main>
  );
}
