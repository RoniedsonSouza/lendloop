"use client";

import { useNow } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";

type Activity = { kind: "loan_update" | "overdue_reminder"; status: "sent" | "failed"; recipientRole: "owner" | "borrower"; event?: string; at: number };

function describe(a: Activity) {
  if (a.kind === "overdue_reminder") return a.status === "sent" ? "Reminder sent" : "Reminder failed";
  const who = a.recipientRole === "owner" ? "Owner" : "Borrower";
  return a.status === "sent" ? `${who} notified (${a.event})` : `${who} notification failed (${a.event})`;
}

/** Bonus: recent automation activity for a loan, e.g. "Reminder sent 2 days ago". */
export function ActivityFeed({ activity }: { activity: Activity[] }) {
  const now = useNow();
  if (activity.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-stone-500" aria-label="Automation activity">
      {activity.map((a) => (
        <li key={`${a.kind}-${a.at}`} className={a.status === "failed" ? "text-red-700" : undefined}>
          ↳ {describe(a)} · {relativeTime(a.at, now)}
        </li>
      ))}
    </ul>
  );
}
