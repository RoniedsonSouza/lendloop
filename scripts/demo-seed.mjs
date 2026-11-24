#!/usr/bin/env node
// Usage: npm run demo:seed -- you@example.com  (sign in to the app with that email first)
import { execFileSync } from "node:child_process";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npm run demo:seed -- you@example.com");
  process.exit(1);
}
const convex = (fn) => execFileSync("npx", ["convex", "run", fn, JSON.stringify({ email })], { stdio: "inherit" });
convex("admin:grantAdmin");
convex("seed:demo");
console.log(`\n${email} is now an admin, and demo data is loaded. New notifications appear in Mailpit (http://localhost:8025).`);
