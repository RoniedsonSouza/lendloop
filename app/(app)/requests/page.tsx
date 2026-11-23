"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanCard, LoanSections } from "@/components/LoanCard";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { withToast } from "@/lib/errors";
import { useToday } from "@/lib/hooks";

export default function MyRequestsPage() {
  const today = useToday();
  const loans = useQuery(api.loans.myRequests, { today });
  const cancel = useMutation(api.loans.cancel);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">My requests</h1>
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">Find something useful in Browse.</EmptyState>
      ) : (
        <LoanSections
          loans={loans}
          render={(l) => (
            <LoanCard
              loan={l}
              role="borrower"
              actions={
                (l.status === "requested" || (l.status === "approved" && !l.hasStarted)) && (
                  <Button variant="danger" onClick={() => void withToast(() => cancel({ loanId: l._id }), "Request cancelled")}>Cancel</Button>
                )
              }
            />
          )}
        />
      )}
    </div>
  );
}
