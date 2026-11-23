import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

import { modules } from "./test.setup";
const ANA = { subject: "user_ana", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|user_ana", name: "Ana Souza", givenName: "Ana", email: "ana@example.com" };

describe("users", () => {
  test("store creates a member once and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const asAna = t.withIdentity(ANA);
    const id1 = await asAna.mutation(api.users.store, {});
    const id2 = await asAna.mutation(api.users.store, {});
    expect(id1).toBe(id2);
    const me = await asAna.query(api.users.me, {});
    expect(me).toMatchObject({ firstName: "Ana", role: "member", isTrustedLender: false });
  });

  test("member functions reject anonymous callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.users.me, {})).resolves.toBeNull();
    await expect(t.mutation(api.users.store, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });

  test("grantAdmin promotes by email and is audited", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ANA).mutation(api.users.store, {});
    await t.mutation(internal.admin.grantAdmin, { email: "ana@example.com" });
    const me = await t.withIdentity(ANA).query(api.users.me, {});
    expect(me?.role).toBe("admin");
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.action)).toEqual(["user.admin_granted"]);
  });
});
