import { appError } from "./errors";

export const CATEGORIES = [
  "power-tools",
  "hand-tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "painting",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LIMITS = {
  toolNameMin: 2,
  toolNameMax: 60,
  descriptionMax: 500,
  maxPendingRequestsPerBorrower: 5,
  maxLoanDays: 30,
  maxStartDaysAhead: 90,
  publicListMax: 50,
  browsePageSize: 24,
} as const;

export const LOAN_STATUSES = ["requested", "approved", "declined", "cancelled", "returned"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export type LoanAction = "approve" | "decline" | "cancel" | "return";

const TRANSITIONS: Partial<Record<LoanStatus, Partial<Record<LoanAction, LoanStatus>>>> = {
  requested: { approve: "approved", decline: "declined", cancel: "cancelled" },
  approved: { return: "returned", cancel: "cancelled" },
};

/** Pure loan state machine. Throws CONFLICT on an illegal transition. */
export function nextStatus(from: LoanStatus, action: LoanAction): LoanStatus {
  const to = TRANSITIONS[from]?.[action];
  if (!to) throw appError("CONFLICT", `Cannot ${action} a ${from} loan`);
  return to;
}
