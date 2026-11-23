"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Button } from "@/components/ui";

export function AuthCta() {
  return (
    <>
      <AuthLoading>
        <Button disabled>Loading…</Button>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/tools">
          <Button className="px-5 py-2.5 text-base">Sign in to lend or borrow</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/tools" className="inline-flex rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800">
          Open LendLoop
        </Link>
      </Authenticated>
    </>
  );
}
