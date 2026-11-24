# Next steps

Open items after the first complete version. Ordered by priority.

## 1. Browser walkthrough with a real Clerk app

- [x] Create a Clerk application, enable the Convex integration and add the session-token claims (see README → Reviewer quick start).
- [x] Put the keys in `.env.local` (never commit them) and run `npm run setup`, which replaces the placeholder `CLERK_JWT_ISSUER_DOMAIN`.
- [x] Walk through every screen: public page, browse, listings, requests, incoming, admin. *(Automated in the Playwright suite, `npm run test:e2e`.)*
- [x] Repeat the Quick start demo (seed, reminder, SMTP outage) through the UI. *(Seed and approval email are covered end-to-end; reminder and SMTP outage remain manual steps in the README walkthrough.)*

## 2. README fixes

- [x] **Testing section:** unit + E2E, how to run, what is covered, results.
- [x] **Add a "Known limitations" section** listing the deferred items below in one place.
- [x] **Screenshots** of the main screens (`docs/screenshots/`).
- [x] Add a CI status badge at the top.
- [x] Make the `---` section separators consistent.
- [x] Remove or rephrase the "health context" remark under production changes.

## 3. Known limitations (deferred from the final review)

- [x] `POST /automation/deliveries/complete` accepts deliveries that were never claimed. Fixed: requires status `claimed` (CONFLICT otherwise).
- [x] `purgeOld` deletes in a single mutation. Fixed: bounded batches, reschedules itself.
- [x] The public list takes `today` from the caller. Fixed: computed on the server in the app timezone.
- [ ] Failed n8n executions keep the recipient's first name and email for 7 days (documented trade-off; set `EXECUTIONS_DATA_SAVE_ON_ERROR=none` to drop it).

## 4. Still open

- [ ] Fully containerized demo with the self-hosted Convex backend image (the `ghcr.io/get-convex/convex-backend` pull was denied from the dev machine; `npm run demo` is the tested alternative).
- [ ] Run the optional E2E workflow on GitHub once `CLERK_*` repository secrets are added (not yet exercised on GitHub Actions).
- [ ] Index on `(status, completedAt)` for the retention purge if delivery volume grows.
