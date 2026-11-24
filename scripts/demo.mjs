#!/usr/bin/env node
// One-command local demo: Convex (local, no account) + secrets + n8n/Mailpit + Next.js.
// Prerequisite: .env.local with your own Clerk dev keys (see README → Reviewer quick start).
// Safe to re-run. Never prints secret values.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createConnection } from "node:net";

const REQUIRED = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "CLERK_JWT_ISSUER_DOMAIN"];

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

function run(cmd, args, extraEnv = {}) {
  try {
    execFileSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  } catch {
    console.error(`\nFailed: ${cmd} ${args.join(" ")} (see output above).`);
    process.exit(1);
  }
}

const portInUse = (port) =>
  new Promise((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.end(), resolve(true)));
    s.once("error", () => resolve(false));
  });

const step = (n, msg) => console.log(`\n\x1b[1m[${n}/4] ${msg}\x1b[0m`);

const missing = REQUIRED.filter((k) => !readEnv(".env.local")[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}.\nCreate a Clerk dev app and copy its keys (README → Reviewer quick start).`);
  process.exit(1);
}

step(1, "Convex local deployment: deploy functions");
if (await portInUse(3210)) {
  // A running `convex dev` owns the local backend and already pushes function changes.
  console.log("Convex local backend already running on :3210 (convex dev) — skipping.");
} else {
  // "anonymous" agent mode creates a local deployment without a Convex account or prompts.
  run("npx", ["convex", "dev", "--once"], { CONVEX_AGENT_MODE: "anonymous" });
}

step(2, "Secrets and Convex environment");
run("node", ["scripts/setup.mjs"]);

step(3, "n8n + Mailpit (Docker)");
run("docker", ["compose", "up", "-d", "--wait", "n8n", "mailpit"]);

step(4, "App");
console.log(`
  App      http://localhost:3000
  Mailpit  http://localhost:8025
  n8n      http://localhost:5678

  After signing in once:  npm run demo:seed -- you@example.com
  (makes that account an admin and loads demo neighbors, tools and loans)
`);
if (await portInUse(3000)) {
  console.log("Port 3000 is already in use — assuming the app is running. Done.");
  process.exit(0);
}
const dev = spawn("npm", ["run", "dev"], { stdio: "inherit" });
dev.on("exit", (code) => process.exit(code ?? 0));
