"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, FormRow } from "@/components/ui/Field";
import { ChipGrid } from "@/components/ui/ChipGrid";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { money } from "@/lib/utils";

export function PaymentButton({
  invoiceId, patientId, due,
}: { invoiceId: string; patientId: string; due: number }) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(String(due));
  const [method, setMethod] = React.useState("Cash");
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const router = useRouter();

  async function pay() {
    const value = Number(amount);
    if (!(value > 0)) return toast("Enter an amount greater than zero.", "error");
    if (value > due) return toast(`Amount is more than the ${money(due)} outstanding.`, "error");
    setBusy(true);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from("profiles").select("clinic_id").eq("id", user!.id).single();
    const { error } = await sb.from("payments").insert({
      clinic_id: prof!.clinic_id, patient_id: patientId, invoice_id: invoiceId,
      amount: value, method: method.toLowerCase(), reference_no: method === "Online" ? ref : null,
      recorded_by: user!.id,
    });
    setBusy(false);
    if (error) return toast("Couldn't record the payment. Try again.", "error");
    toast("Payment recorded");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[13px] font-medium text-primary">
        Add payment
      </button>
      <Modal
        open={open} onClose={() => setOpen(false)} title="Add payment" width={440}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={pay} loading={busy}>Record payment</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="data text-[14px]">
            Outstanding <span className="font-semibold text-danger">{money(due)}</span>
          </p>
          <FormRow label="Amount" required>
            <Input mono value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormRow>
          <FormRow label="Method">
            <ChipGrid options={["Cash", "Online"]} multiple={false} value={[method]}
              onChange={(v) => setMethod(v[0] ?? "Cash")} />
          </FormRow>
          {method === "Online" && (
            <FormRow label="Transaction / reference number">
              <Input mono value={ref} onChange={(e) => setRef(e.target.value)} />
            </FormRow>
          )}
          <p className="text-[12px] text-ink-3">
            Payments are added to the ledger. Earlier payments are never overwritten.
          </p>
        </div>
      </Modal>
    </>
  );
}
