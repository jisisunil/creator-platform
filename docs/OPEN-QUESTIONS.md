# Open questions and default decisions

Questions the spec doesn't answer. Where work couldn't wait, a **default** was built and is
listed here so it can be confirmed or changed. Settled decisions with lasting impact also
get an ADR in `docs/adr/`.

**How this file is used**

- Every phase adds its new questions here in the same commit as the code (CLAUDE.md §2
  "write the open question down").
- **Status:** `open` (default built, waiting for an answer) · `confirmed` (product owner
  agreed) · `changed` (answer differed; the change is linked) · `external` (needs someone
  outside the codebase).
- To answer: edit the row (or say so in chat). A changed answer becomes a task in the next
  phase, and the row records the commit.
- Defaults are chosen to be safe and easy to change: usually a constant in `src/config/`.

## Product and business rules

| ID   | Phase | Question                                                                 | Default built                                                                                              | Where to change                          | Status |
| ---- | ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| Q-01 | plan  | 2FA: spec says "Later" (FR-1.5) but required for admins (SR-4, SR-17)    | TOTP for admins only                                                                                       | `domain/accounts.ts`                     | open   |
| Q-02 | plan  | CAPTCHA provider (sends IP to a third party)                             | Cloudflare Turnstile; listed as a processor                                                                | `adapters/security/captcha-verifier.ts`  | open   |
| Q-03 | plan  | Breached-password check                                                  | HIBP k-anonymity API with an offline fallback list                                                         | `BREACHED_PASSWORD_CHECK`                | open   |
| Q-04 | plan  | Malware scanner in production                                            | ClamAV; hosted choice in phase i                                                                           | `MALWARE_SCANNER`                        | open   |
| Q-05 | plan  | Embedding size for future AI search                                      | `vector(1024)` for an open-source model such as BGE-M3 (ADR-006)                                           | migration                                | open   |
| Q-06 | e     | What are "early messages" (FR-8.2)?                                      | First 10 messages or first 48 hours, whichever lasts longer                                                | `config/collaboration.ts` `CHAT_LIMITS`  | open   |
| Q-07 | e     | Do withdrawn, declined or expired requests still use the plan allowance? | Yes, counted when sent, never refunded                                                                     | `services/plans`                         | open   |
| Q-08 | plan  | Agency "multiple brands" conflicts with one brand per account            | Not built; Agency = higher limits only                                                                     | —                                        | open   |
| Q-09 | plan  | Shortlist sharing                                                        | Private until "share with team"; then the whole team can edit                                              | `services/shortlists`                    | open   |
| Q-10 | c     | Score weights and tier engagement averages                               | Engagement 35, consistency 20, growth 15, authenticity 20, completeness 10; averages are guesses           | `config/score.ts`                        | open   |
| Q-11 | e     | When does a lone rating show?                                            | 14 days after the deal completes                                                                           | `config/collaboration.ts` `RATING_RULES` | open   |
| Q-12 | d     | Profile views per hour by plan (SEC-3)                                   | Trial 60, PAYG 100, Starter 150, Free beta/Pro 300, Agency 600                                             | `config/plans.ts`                        | open   |
| Q-13 | d     | Shortlist limits by plan                                                 | Trial 5, PAYG 10, Starter 20, Free beta/Pro 50, Agency 200                                                 | `config/plans.ts`                        | open   |
| Q-14 | d     | Fields in the shortlist CSV                                              | Name, profile link, city, state, categories, platforms, tier, followers, engagement, score, verified, note | `services/shortlists`                    | open   |
| Q-15 | plan  | Collect phone numbers (WhatsApp is "Later")?                             | Not collected                                                                                              | —                                        | open   |
| Q-16 | e     | Deal summary format (FR-9.4)                                             | Printable page, "save as PDF" from the browser; no PDF library                                             | `deals/[id]/summary`                     | open   |
| Q-17 | plan  | Instagram without Meta approval: self-reported, unverified Instagram?    | Not built; mock provider for development                                                                   | —                                        | open   |
| Q-18 | e     | Who sets the deal amount and payment terms?                              | The brand; the creator sees every change in the history and agrees in chat                                 | `domain/deals.ts`                        | open   |
| Q-19 | e     | Rating comments on the public profile                                    | Shown without naming the brand                                                                             | `components/ratings`                     | open   |
| Q-20 | e     | Instagram post stats                                                     | Likes and comments only (no views); post matched among the latest 100                                      | `adapters/social/instagram-provider.ts`  | open   |
| Q-21 | f     | When the free beta ends, what happens to brands already on it?           | They stay on the free beta until an admin moves them                                                       | phase g admin                            | open   |
| Q-22 | f     | A company that already had a trial signs up again                        | Its trial starts already ended (admins can extend)                                                         | `services/plans` `startingPlanFor`       | open   |
| Q-23 | f     | Can users turn off payment and deadline reminders?                       | Yes, they're in the "Deals" category                                                                       | `services/notifications` `CATEGORY_OF`   | open   |
| Q-24 | f     | How brands buy credit packs or change plan before online payments        | Email to `SALES_EMAIL`; an admin applies it (admin screens in phase g)                                     | `SALES_EMAIL`                            | open   |

## Needs someone outside the codebase

| ID   | Item                                                                                                                     | Why it matters                                     | Status   |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------- |
| X-01 | Meta app review for the Instagram API                                                                                    | Real Instagram connections (FR-3.2)                | external |
| X-02 | Google OAuth verification for the YouTube read-only scope                                                                | Verified YouTube connections (FR-3.1)              | external |
| X-03 | Lawyer-reviewed privacy notice (English and Hindi) and terms                                                             | Placeholder text today (PR-1)                      | external |
| X-04 | Named grievance officer and contact                                                                                      | Placeholder `grievance@example.invalid` (PR-10)    | external |
| X-05 | Real `SALES_EMAIL`                                                                                                       | App refuses to start in staging/production without | external |
| X-06 | Cloud provider and infrastructure-as-code tool (India region)                                                            | Needed before phase i (PR-12)                      | external |
| X-07 | Spec checklist: first niche and region, product name and domain, when to end the free beta, when to register the company | Business decisions in the spec                     | external |

## Answered

None yet. Rows move here with the answer and the commit that applied it.
