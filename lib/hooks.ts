"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { today } from "@/convex/lib/dates";
import { APP_TIMEZONE } from "./format";

/** Re-renders every `intervalMs` so relative times and "today" stay fresh. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Today's calendar date in the neighborhood timezone (queries take it as an argument). */
export function useToday() {
  return today(APP_TIMEZONE, useNow());
}

/** Creates/refreshes the user's profile in Convex after sign-in; returns true once ready. */
export function useStoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store({}).then(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);
  return isAuthenticated && ready;
}
