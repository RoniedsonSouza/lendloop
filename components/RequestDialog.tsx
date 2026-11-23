"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays } from "@/convex/lib/dates";
import { LIMITS } from "@/convex/lib/domain";
import { withToast } from "@/lib/errors";
import { useToday } from "@/lib/hooks";
import { Button, Dialog, Field, inputClass } from "./ui";

export function RequestDialog({ tool, onClose }: { tool: { _id: Id<"tools">; name: string } | null; onClose: () => void }) {
  const today = useToday();
  const [start, setStart] = useState(addDays(today, 1));
  const [end, setEnd] = useState(addDays(today, 2));
  const [busy, setBusy] = useState(false);
  const request = useMutation(api.loans.request);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tool) return;
    setBusy(true);
    const ok = await withToast(() => request({ toolId: tool._id, startDate: start, endDate: end }), "Request sent to the owner");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={tool !== null} onClose={onClose} title={`Borrow ${tool?.name ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" required className={inputClass} min={today} max={addDays(today, LIMITS.maxStartDaysAhead)} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Until">
            <input type="date" required className={inputClass} min={start} max={addDays(start, LIMITS.maxLoanDays - 1)} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-stone-500">Up to {LIMITS.maxLoanDays} days. The owner&apos;s contact appears once they approve.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Send request</Button>
        </div>
      </form>
    </Dialog>
  );
}
