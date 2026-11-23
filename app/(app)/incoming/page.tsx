"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoanCard, LoanSections } from "@/components/LoanCard";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { withToast } from "@/lib/errors";
import { useToday } from "@/lib/hooks";

export default function IncomingRequestsPage() {
  const today = useToday();
  const loans = useQuery(api.loans.incoming, { today });
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Incoming requests</h1>
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests for your tools yet" />
      ) : (
        <LoanSections
          loans={loans}
          render={(l) => (
            <LoanCard
              loan={l}
              role="owner"
              actions={
                l.status === "requested" ? (
                  <>
                    <Button onClick={() => void withToast(() => approve({ loanId: l._id }), "Request approved")}>Approve</Button>
                    <Button variant="secondary" onClick={() => void withToast(() => decline({ loanId: l._id }), "Request declined")}>Decline</Button>
                  </>
                ) : l.status === "approved" && l.hasStarted ? (
                  <Button variant="secondary" onClick={() => void withToast(() => markReturned({ loanId: l._id }), "Marked as returned")}>Mark returned</Button>
                ) : null
              }
            />
          )}
        />
      )}
    </div>
  );
}
