"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORIES, LIMITS, type Category } from "@/convex/lib/domain";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { RequestDialog } from "@/components/RequestDialog";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";
import { useToday } from "@/lib/hooks";
import { withToast } from "@/lib/errors";

export default function BrowsePage() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("category");
  const category = CATEGORIES.includes(raw as Category) ? (raw as Category) : undefined;
  const today = useToday();
  const { results, status, loadMore } = usePaginatedQuery(api.tools.browse, { today, category }, { initialNumItems: LIMITS.browsePageSize });
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);
  const [requesting, setRequesting] = useState<{ _id: Id<"tools">; name: string } | null>(null);

  const setCategory = (c?: Category) => router.replace(c ? `/tools?category=${c}` : "/tools", { scroll: false });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Browse tools</h1>
      <div role="group" aria-label="Filter by category" className="mb-6 flex flex-wrap gap-2">
        {[undefined, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className="rounded-full border border-stone-300 px-3 py-1 text-sm aria-pressed:border-emerald-700 aria-pressed:bg-emerald-700 aria-pressed:text-white"
          >
            {c ? CATEGORY_LABELS[c] : "All"}
          </button>
        ))}
      </div>
      {status === "LoadingFirstPage" ? (
        <Skeleton rows={4} />
      ) : results.length === 0 ? (
        <EmptyState title="No tools in this category yet" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {results.map((t) => (
            <li key={t._id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <AvailabilityBadge availability={t.availability} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{CATEGORY_LABELS[t.category]}</Badge>
                  <Badge tone="blue">Condition: {CONDITION_LABELS[t.condition]}</Badge>
                </div>
                {t.description && <p className="text-sm text-stone-600">{t.description}</p>}
                <div className="mt-auto flex items-center justify-between pt-2 text-sm text-stone-600">
                  <span>
                    {t.isMine ? "Your listing" : `Lent by ${t.ownerFirstName}`}
                    {t.ownerIsTrusted && <span className="ml-2"><Badge tone="green">★ Trusted Lender</Badge></span>}
                  </span>
                  <span className="flex gap-2">
                    {me?.role === "admin" && !t.isMine && (
                      <Button variant="danger" onClick={() => confirm(`Remove "${t.name}" as admin?`) && void withToast(() => remove({ toolId: t._id }), "Listing removed")}>Remove</Button>
                    )}
                    {!t.isMine && <Button onClick={() => setRequesting({ _id: t._id, name: t.name })}>Request</Button>}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <div className="mt-6 text-center">
          <Button variant="secondary" onClick={() => loadMore(LIMITS.browsePageSize)}>Load more</Button>
        </div>
      )}
      <RequestDialog key={requesting?._id ?? "none"} tool={requesting} onClose={() => setRequesting(null)} />
    </div>
  );
}
