import { defineApp } from "convex/server";
import { v } from "convex/values";

// Typed environment. Secrets are set with `npx convex env set` (see scripts/setup.mjs), never committed.
const app = defineApp({
  env: {
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
    APP_TIMEZONE: v.optional(v.string()),
    APP_URL: v.optional(v.string()),
    N8N_LOAN_EVENTS_URL: v.optional(v.string()),
    LENDLOOP_WEBHOOK_SECRET: v.optional(v.string()),
    LENDLOOP_AUTOMATION_SECRET: v.optional(v.string()),
    ALLOW_SEED: v.optional(v.string()),
  },
});

export default app;
