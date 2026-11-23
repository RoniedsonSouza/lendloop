"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const LINKS = [
  { href: "/tools", label: "Browse" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

export function AppHeader() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const links = me?.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-800">LendLoop</Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? "page" : undefined}
              className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 aria-[current=page]:bg-emerald-50 aria-[current=page]:font-medium aria-[current=page]:text-emerald-800"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </div>
    </header>
  );
}
