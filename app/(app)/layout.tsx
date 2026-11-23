import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { AppHeader } from "@/components/AppHeader";
import { UserGate } from "@/components/UserGate";

/** UX guard only: every Convex function re-checks identity and role on the server. */
async function Protected({ children }: { children: React.ReactNode }) {
  await auth.protect();
  return <UserGate>{children}</UserGate>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Suspense fallback={null}>
          <Protected>{children}</Protected>
        </Suspense>
      </main>
    </>
  );
}
