import { Suspense } from "react";
import { connection } from "next/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { today } from "@/convex/lib/dates";
import { APP_TIMEZONE } from "@/lib/format";
import { AuthCta } from "./_components/AuthCta";
import { PublicToolList } from "./_components/PublicToolList";

async function AvailableTools() {
  await connection(); // "today" depends on the request time
  const preloaded = await preloadQuery(api.tools.listAvailablePublic, { today: today(APP_TIMEZONE) });
  return <PublicToolList preloaded={preloaded} />;
}

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-emerald-800 sm:text-5xl">LendLoop</h1>
        <p className="mt-3 text-lg text-stone-600">Borrow what you need. Lend what you don&apos;t.</p>
        <div className="mt-6">
          <AuthCta />
        </div>
      </section>
      <section aria-labelledby="available">
        <h2 id="available" className="mb-4 text-lg font-semibold">Available in the neighborhood</h2>
        <Suspense fallback={<p className="text-sm text-stone-500">Loading tools…</p>}>
          <AvailableTools />
        </Suspense>
      </section>
    </main>
  );
}
