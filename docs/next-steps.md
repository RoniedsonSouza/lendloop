# Next steps

Open items after the first complete version. Ordered by priority.

## 1. Browser walkthrough with a real Clerk app

- [ ] Create a Clerk application, enable the Convex integration and add the session-token claims (see README → Quick start).
- [ ] Put the keys in `.env.local` (never commit them) and run `npm run setup`, which replaces the placeholder `CLERK_JWT_ISSUER_DOMAIN`.
- [ ] Walk through every screen: public page, browse, listings, requests, incoming, admin.
- [ ] Repeat the Quick start demo (seed, reminder, SMTP outage) through the UI.

## 2. README fixes

- [ ] **Testing section:** the Convex ⇄ n8n ⇄ Mailpit flow was verified manually; the UI screens were not yet. Reword the sentence (or keep it once step 1 is done).
- [ ] **Add a "Known limitations" section** listing the deferred items below in one place.
- [ ] **Screenshots or a short GIF** of the main screens (after step 1).
- [ ] Add a CI status badge at the top.
- [ ] Make the `---` section separators consistent (missing before "Data minimization" and "Product decisions").
- [ ] Remove or rephrase the "health context" remark under production changes.

## 3. Known limitations (deferred from the final review)

- [ ] `POST /automation/deliveries/complete` accepts deliveries that were never claimed. Fix: require status `claimed` (or the claim token).
- [ ] `purgeOld` deletes in a single mutation; at high volume it can hit transaction limits. Fix: paginate and reschedule itself.
- [ ] The public list takes `today` from the caller. It leaks no data, but a client can make a lent tool appear available. Fix: compute the date on the server.
- [ ] Failed n8n executions keep the recipient's first name and email for 7 days (documented trade-off; set `EXECUTIONS_DATA_SAVE_ON_ERROR=none` to drop it).
