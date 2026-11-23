import { ConvexError } from "convex/values";

export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID";

/** Typed, client-readable error. The message is safe to show to end users. */
export function appError(code: AppErrorCode, message: string) {
  return new ConvexError({ code, message: `${code}: ${message}` });
}
