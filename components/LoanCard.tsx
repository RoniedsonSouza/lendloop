"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { ActivityFeed } from "./ActivityFeed";
import { Badge, Card } from "./ui";
import { formatRange } from "@/lib/format";

export type LoanView = FunctionReturnType<typeof api.loans.incoming>[number];

const STATUS: Record<LoanView["status"], { label: string; tone: "neutral" | "green" | "amber" | "red" | "blue" }> = {
  requested: { label: "Pending", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "neutral" },
};

export function LoanCard({ loan, role, actions }: { loan: LoanView; role: "owner" | "borrower"; actions?: ReactNode }) {
  const s = loan.isOverdue ? { label: "Overdue", tone: "red" as const } : loan.status === "approved" && loan.hasStarted ? { label: "On loan", tone: "amber" as const } : STATUS[loan.status];
  const who = role === "owner" ? "Requested by" : "Owner";
  return (
    <Card className={loan.isOverdue ? "border-red-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{loan.toolName}</h2>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <p className="text-sm text-stone-600">{formatRange(loan.startDate, loan.endDate)} · {who} {loan.counterpart.firstName}</p>
          {loan.counterpart.email && (
            <p className="text-sm text-stone-600">
              Contact: {loan.counterpart.name} · <a className="text-emerald-800 underline" href={`mailto:${loan.counterpart.email}`}>{loan.counterpart.email}</a>
            </p>
          )}
          {loan.closedReason === "dates_unavailable" && <p className="text-xs text-stone-500">Those dates were taken by another request.</p>}
          {loan.closedReason === "listing_removed" && <p className="text-xs text-stone-500">The listing was removed.</p>}
          <ActivityFeed activity={loan.activity} />
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

export function LoanSections({ loans, render }: { loans: LoanView[]; render: (l: LoanView) => ReactNode }) {
  const groups = [
    { title: "Pending", items: loans.filter((l) => l.status === "requested") },
    { title: "Active", items: loans.filter((l) => l.status === "approved") },
    { title: "History", items: loans.filter((l) => !["requested", "approved"].includes(l.status)) },
  ];
  return (
    <div className="space-y-8">
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{g.title}</h2>
          <ul className="space-y-3">{g.items.map((l) => <li key={l._id}>{render(l)}</li>)}</ul>
        </section>
      ))}
    </div>
  );
}
