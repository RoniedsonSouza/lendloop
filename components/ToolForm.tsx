"use client";

import { useState } from "react";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/domain";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

export function ToolForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: ToolInput;
  submitLabel: string;
  onSubmit: (v: ToolInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<ToolInput>(initial ?? { name: "", category: "power-tools", condition: "good", description: "" });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolInput>(k: K, v: ToolInput[K]) => setValue((prev) => ({ ...prev, [k]: v }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit(value);
        setBusy(false);
        if (ok) onCancel();
      }}
    >
      <Field label="Name">
        <input required minLength={LIMITS.toolNameMin} maxLength={LIMITS.toolNameMax} className={inputClass} value={value.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className={inputClass} value={value.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </Field>
        <Field label="Condition">
          <select className={inputClass} value={value.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABELS[c]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Short description" hint="Please don't include phone numbers or addresses — contact details are shared after approval.">
        <textarea maxLength={LIMITS.descriptionMax} rows={3} className={inputClass} value={value.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
