/// <reference types="vite/client" />
// Function modules for convex-test (files with more than one dot, like tests, are excluded).
export const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

/** Signs a user in (creates the users row) and returns a client acting as them. */
export async function signIn(t: T, first: string, opts: { admin?: boolean } = {}) {
  const sub = `user_${first.toLowerCase()}`;
  const client = t.withIdentity({
    subject: sub,
    issuer: "https://clerk.test",
    tokenIdentifier: `https://clerk.test|${sub}`,
    name: `${first} Test`,
    givenName: first,
    email: `${first.toLowerCase()}@example.com`,
  });
  const id = await client.mutation(api.users.store, {});
  if (opts.admin) await t.run((ctx) => ctx.db.patch("users", id, { role: "admin" }));
  return { client, id };
}

export const TOOL = { name: "Cordless drill", category: "power-tools", condition: "good", description: "18V" } as const;
