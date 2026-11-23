"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { ToolForm, type ToolInput } from "@/components/ToolForm";
import { Badge, Button, Card, Dialog, EmptyState, Skeleton } from "@/components/ui";
import { withToast } from "@/lib/errors";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";
import { useToday } from "@/lib/hooks";

export default function MyListingsPage() {
  const today = useToday();
  const tools = useQuery(api.tools.mine, { today });
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<({ _id: Id<"tools"> } & ToolInput) | "new" | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My listings</h1>
        <Button onClick={() => setEditing("new")}>+ List a tool</Button>
      </div>
      {tools === undefined ? (
        <Skeleton />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">Share a tool your neighbors could use.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {tools.map((t) => (
            <li key={t._id}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{t.name}</h2>
                    <AvailabilityBadge availability={t.availability} />
                    {t.pendingRequests > 0 && <Badge tone="blue">{t.pendingRequests} pending request{t.pendingRequests > 1 ? "s" : ""}</Badge>}
                  </div>
                  <p className="text-sm text-stone-600">{CATEGORY_LABELS[t.category]} · {CONDITION_LABELS[t.condition]}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(t)}>Edit</Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Remove "${t.name}"? Pending and future requests will be cancelled.`)) {
                        void withToast(() => remove({ toolId: t._id }), "Listing removed");
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "List a tool" : "Edit listing"}>
        <ToolForm
          initial={editing && editing !== "new" ? editing : undefined}
          submitLabel={editing === "new" ? "Publish" : "Save"}
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => {
            const fields = { name: v.name, category: v.category, condition: v.condition, description: v.description };
            const result =
              editing === "new"
                ? await withToast(() => create(fields), "Listing published")
                : await withToast(() => update({ toolId: (editing as { _id: Id<"tools"> })._id, ...fields }), "Listing updated");
            return result !== undefined;
          }}
        />
      </Dialog>
    </div>
  );
}
