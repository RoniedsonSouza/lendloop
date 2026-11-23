import { ConvexError } from "convex/values";
import { toast } from "sonner";

/** Shows the server's user-safe message for ConvexErrors, a generic one otherwise. */
export function errorMessage(e: unknown) {
  if (e instanceof ConvexError) {
    const message = (e.data as { message?: string }).message ?? "";
    return message.replace(/^[A-Z_]+: /, "");
  }
  return "Something went wrong. Please try again.";
}

export async function withToast<T>(action: () => Promise<T>, success?: string) {
  try {
    const result = await action();
    if (success) toast.success(success);
    return result;
  } catch (e) {
    toast.error(errorMessage(e));
    return undefined;
  }
}
