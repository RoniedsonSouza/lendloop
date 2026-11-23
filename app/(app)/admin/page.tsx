"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LOAN_STATUSES, type LoanStatus } from "@/convex/lib/domain";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Badge, Button, Card, EmptyState, Skeleton, inputClass } from "@/components/ui";
import { withToast } from "@/lib/errors";
import { formatRange, relativeTime } from "@/lib/format";
import { useNow, useToday } from "@/lib/hooks";

const TABS = ["Loans", "Members", "Automation", "Audit log"] as const;

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Loans");
  if (me === undefined) return <Skeleton />;
  if (me?.role !== "admin") return <EmptyState title="Admins only" />;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Admin</h1>
      <div role="tablist" className="mb-6 flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm aria-selected:border-emerald-700 aria-selected:font-medium">
            {t}
          </button>
        ))}
      </div>
      {tab === "Loans" && <AllLoans />}
      {tab === "Members" && <Members />}
      {tab === "Automation" && <Automation />}
      {tab === "Audit log" && <Audit />}
      <p className="mt-8 text-xs text-stone-500">To remove a listing, open Browse — admins see a Remove action on every card.</p>
    </div>
  );
}

function AllLoans() {
  const today = useToday();
  const [status, setStatus] = useState<LoanStatus | "">("");
  const { results, status: s, loadMore } = usePaginatedQuery(
    api.admin.loans, { today, status: status || undefined }, { initialNumItems: 25 },
  );
  return (
    <div>
      <select aria-label="Filter by status" className={`${inputClass} mb-4 w-48`} value={status} onChange={(e) => setStatus(e.target.value as LoanStatus | "")}>
        <option value="">All statuses</option>
        {LOAN_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
      </select>
      {s === "LoadingFirstPage" ? <Skeleton /> : results.length === 0 ? <EmptyState title="No loans" /> : (
        <ul className="space-y-2">
          {results.map((l) => (
            <li key={l._id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.toolName}</span>
                  <Badge tone={l.isOverdue ? "red" : "neutral"}>{l.isOverdue ? "overdue" : l.status}</Badge>
                  <span className="text-sm text-stone-600">{formatRange(l.startDate, l.endDate)} · {l.ownerName} → {l.borrowerName}</span>
                </div>
                <ActivityFeed activity={l.activity} />
              </Card>
            </li>
          ))}
        </ul>
      )}
      {s === "CanLoadMore" && <Button variant="secondary" className="mt-4" onClick={() => loadMore(25)}>Load more</Button>}
    </div>
  );
}

function Members() {
  const { results, status, loadMore } = usePaginatedQuery(api.admin.members, {}, { initialNumItems: 50 });
  const setTrusted = useMutation(api.admin.setTrustedLender);
  if (status === "LoadingFirstPage") return <Skeleton />;
  return (
    <div>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {results.map((u) => (
          <li key={u._id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <span className="font-medium">{u.name}</span> <span className="text-sm text-stone-500">{u.email}</span>
              {u.role === "admin" && <span className="ml-2"><Badge tone="blue">admin</Badge></span>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={u.isTrustedLender}
                onChange={(e) => void withToast(() => setTrusted({ userId: u._id, value: e.target.checked }), "Updated")} />
              Trusted Lender
            </label>
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && <Button variant="secondary" className="mt-4" onClick={() => loadMore(50)}>Load more</Button>}
    </div>
  );
}

function Automation() {
  const issues = useQuery(api.admin.automationIssues);
  const now = useNow();
  if (!issues) return <Skeleton />;
  if (issues.deliveries.length === 0 && issues.incidents.length === 0) {
    return <EmptyState title="All automations healthy">Failed deliveries and n8n workflow errors show up here.</EmptyState>;
  }
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Deliveries needing attention</h2>
        <ul className="space-y-2">
          {issues.deliveries.map((d) => (
            <li key={d._id}><Card className="text-sm">
              <Badge tone="red">{d.status}</Badge> <span className="font-medium">{d.kind === "overdue_reminder" ? "Reminder" : "Notification"}</span> to {d.recipientRole} · {d.toolName} · {relativeTime(d.at, now)}
              {d.lastError && <p className="mt-1 text-stone-500">{d.lastError}</p>}
            </Card></li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">n8n workflow incidents</h2>
        <ul className="space-y-2">
          {issues.incidents.map((i) => (
            <li key={i._id}><Card className="text-sm">
              <span className="font-medium">{i.workflowName}</span> · {i.failedNode ?? "unknown node"} · {relativeTime(i.at, now)}
              <p className="mt-1 text-stone-500">{i.message}</p>
            </Card></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Audit() {
  const { results, status } = usePaginatedQuery(api.admin.auditLog, {}, { initialNumItems: 50 });
  const now = useNow();
  if (status === "LoadingFirstPage") return <Skeleton />;
  if (results.length === 0) return <EmptyState title="No privileged actions yet" />;
  return (
    <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white text-sm">
      {results.map((a) => (
        <li key={a._id} className="px-4 py-2"><span className="font-medium">{a.actorName}</span> · {a.action} · {a.target} · {relativeTime(a.at, now)}</li>
      ))}
    </ul>
  );
}
