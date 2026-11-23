"use client";

import type { ReactNode } from "react";
import { useStoreUser } from "@/lib/hooks";
import { Skeleton } from "./ui";

/** Waits until the signed-in user's profile exists in Convex before rendering the app. */
export function UserGate({ children }: { children: ReactNode }) {
  const ready = useStoreUser();
  return ready ? <>{children}</> : <Skeleton />;
}
