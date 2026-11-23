"use client";

import { usePreloadedQuery, type Preloaded } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { Badge, EmptyState } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/format";

/** Read-only, name + category only (the query itself never returns owner data). */
export function PublicToolList({ preloaded }: { preloaded: Preloaded<typeof api.tools.listAvailablePublic> }) {
  const tools = usePreloadedQuery(preloaded);
  if (tools.length === 0) return <EmptyState title="No tools available right now">Be the first to lend one.</EmptyState>;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <li key={t._id} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3">
            <span className="font-medium">{t.name}</span>
            <Badge>{CATEGORY_LABELS[t.category]}</Badge>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-sm text-stone-500">Sign in to see details and request a tool.</p>
    </>
  );
}
