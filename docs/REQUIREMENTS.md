# Creator Discovery Platform: Plan, Requirements & Use Cases

Oct 9, 2026 · @Jisi Kottakuzhiyil

## Overview

The platform helps brands find, verify and contact the right content creators, starting with regional micro-creators in India. Creators join free and get a verified profile with a transparent content score. Brands search, shortlist, chat and track campaigns, free at first and later on a trial-then-subscription or pay-as-you-go plan.

**Problem.** Brands, especially small and regional ones, can't easily find trustworthy creators outside the big metros. Follower counts are often inflated, and existing tools are expensive and built for US and European brands. Creators with 5k–2 lakh followers have engaged audiences but no manager and no way to be found.

**Target users (phase 1)**

- Creators: Indian YouTube and Instagram creators, 18+, nano to mid tier (under 5 lakh followers), in any language.
- Brands: Indian D2C brands, small and local businesses, and small agencies.

**Scope decisions for the first version**

- India only, but built so new countries are configuration, not a rebuild (see International expansion).
- No payments between brands and creators. Brands pay creators directly. In-app payments come later, after company registration.
- Official APIs only (YouTube Data API, Instagram Graph API). No scraping.
- Creators are 18+ only, to avoid children's-data rules until parental consent is built.

**Guiding principles**

1. Verified over big: a connected, verified account is worth more than a large database of scraped profiles.
2. Transparent score: every score shows its breakdown.
3. Privacy by design: collect the minimum, get clear consent, make deletion easy.
4. Creators are free: they are the supply, and their trust is the asset.
5. Simple first: launch narrow (one niche, one region) and add features only when users ask.

## Phased plan

The platform goes from idea to paying brands in about 9 months, in five phases, each with a gate that must be passed before the next. Timings assume one strong developer using Claude Code (or 2–3 developers), plus the founder on design, outreach and sales.

&#91;embedded content: roadmap · 5 phases, 4 gates\]

The free beta (phase 2) is the real test: if creators don't join or brands don't send requests, fix that before building paid plans.

**Team and budget (rough, India)**

- Lean: founder + Claude Code + freelance designer; about ₹3–8 lakh for the first 6 months (cloud, APIs, design, legal review, marketing).
- Small team: 2–3 developers, part-time designer, 1 outreach person; about ₹20–40 lakh for 6 months, mostly salaries.

## Users and roles

Four roles, each seeing only what it needs; every permission is enforced on the server, not just hidden in the UI.

| Role | Who | Can | Cannot |
| --- | --- | --- | --- |
| Creator | An individual creator, 18+ | Manage own profile, connect/disconnect social accounts, accept or decline requests, chat, mark deals, rate brands, export or delete own data | See other creators' private data, see brand billing |
| Brand owner | Person who registers a brand | Search, shortlist, compare, send requests, chat, run campaigns, rate creators, invite team members, change plan | See creators' phone or email, exceed plan limits |
| Brand member | Team member invited by a brand owner | Same as brand owner within that brand, except billing and team management | Access other brands' data |
| Admin | Platform operator (you) | Verify or suspend users, review reports, change plans, trigger data refresh, handle data requests, view audit logs | Read private chats unless a report or legal request requires it (logged) |

One person can't be a creator and a brand on the same account; they need two accounts. This keeps data and limits separate.

## Functional requirements

Requirements are grouped by module and numbered so each can be traced to use cases and tests. "Must" items are in the first version; "Later" items are designed for but built after launch.

**FR-1 Accounts and sign-up**

1. Must: sign up with email and password, or Google sign-in; email verification before the account is usable.
2. Must: choose role at sign-up (creator or brand); 18+ confirmation; privacy notice with an unticked consent checkbox; separate optional marketing consent.
3. Must: password reset by email link; change email (re-verify) and password.
4. Must: delete account from settings, and download my data.
5. Later: phone OTP login; two-factor authentication for brands and admins.

**FR-2 Creator profile**

1. Must: display name, photo, bio, city, state, country, languages, content categories (multi-select from a fixed list), optional rate card (per reel, story, video, post, in local currency).
2. Must: portfolio of past brand collaborations (link + brand name + date).
3. Must: availability toggle ("open to collaborations").
4. Must: public profile URL that brands can open; contact details never shown.
5. Later: media kit PDF download; profile in multiple languages.

**FR-3 Social account connection and data ingestion**

1. Must: connect YouTube by channel URL or ID (public stats via API key) and, for verification, via Google sign-in that proves ownership.
2. Must: connect Instagram through the official Instagram Graph API login (Business or Creator accounts); fetch followers, media, and insights including audience age, gender and top cities.
3. Must: "Verified" badge only when ownership is proved through official login.
4. Must: daily refresh per creator, stored as dated snapshots for growth charts; show "last updated".
5. Must: handle disconnect, revoked token, private or deleted account, and API quota limits without breaking profiles.
6. Later: more platforms (Moj, Josh, ShareChat, LinkedIn, X, TikTok outside India) through the same provider interface.

**FR-4 Content score**

1. Must: score from 0 to 100, recalculated after each refresh.
2. Must: components shown on every profile: engagement rate vs. tier average, consistency (posts per month), growth trend (90 days), audience authenticity signals, profile completeness.
3. Must: weights stored in configuration and versioned, so scores can be explained and recalculated.
4. Must: tiers: nano (<10k), micro (10k–100k), mid (100k–500k), macro (500k–1M), mega (1M+).
5. Must: authenticity flags (sudden follower spikes, very low views-to-followers ratio, engagement far above or below normal) lower the score and are visible to admins.

**FR-5 Search and discovery (brands)**

1. Must: filters: platform, category, country, state, city, language, tier, follower range, minimum engagement, minimum score, verified only, open to collaborations, audience gender and age (where available).
2. Must: sort by score, engagement, followers, recent growth; text search on name and bio.
3. Must: results paginated; empty-result suggestions ("widen city to state").
4. Must: saved searches.
5. Later: "similar creators" and AI-assisted search ("Tamil food creators in Chennai under 50k").

**FR-6 Shortlists and comparison**

1. Must: create named shortlists, add or remove creators, notes per creator, share a shortlist with team members.
2. Must: compare 2–4 creators side by side.
3. Must: export a shortlist as CSV (only public profile fields).

**FR-7 Collaboration requests**

1. Must: brand sends a request: campaign name, brief, deliverables, budget (optional), deadline, content usage rights.
2. Must: creator accepts, declines (with optional reason) or ignores; requests expire after 14 days (configurable).
3. Must: each request counts against the brand's plan limit; duplicate open requests to the same creator are blocked.

**FR-8 Chat**

1. Must: in-app chat per accepted request; text and image or file attachments (size and type limits).
2. Must: phone numbers, emails and links in early messages are flagged with a safety note; creators can share payment details only after accepting.
3. Must: block and report a user; read receipts; unread counts.

**FR-9 Deals and campaigns**

1. Must: deal status: requested → accepted → content submitted → posted → payment marked → completed (or cancelled).
2. Must: agreed amount and payment terms recorded (advance %, balance); both sides mark "paid" and "received"; reminders for overdue payment.
3. Must: campaign groups many deals; creator submits the post link; the platform fetches that post's stats and shows a campaign report (views, likes, comments, engagement, cost per view or engagement if amount is known).
4. Must: downloadable deal summary (parties, deliverables, amount, dates) as an informal contract.
5. Must: disclosure reminder that sponsored posts must be labelled (#ad, #collab).
6. Later: tracked links and discount codes; in-app payments with holding until delivery.

**FR-10 Ratings and reviews**

1. Must: after completion, each side rates 1–5 on fixed criteria (creator: content quality, on time, communication; brand: clear brief, paid on time, communication) plus an optional comment.
2. Must: only completed deals can be rated; one rating per deal per side; ratings shown after both submit or after 14 days.
3. Must: users can report an unfair review; admins can hide it.

**FR-11 Plans and limits**

1. Must: plans stored in the database: Free beta, Trial, Pay-as-you-go packs, Starter, Pro, Agency, each with limits (contact requests per month, team seats, shortlists, report access).
2. Must: limits enforced on the server; clear "limit reached" message with upgrade options.
3. Must: admin can change a brand's plan and extend trials.
4. Later: online payment for plans through a payment gateway; GST invoices.

**FR-12 Notifications**

1. Must: in-app and email notifications for new request, accepted or declined, new message, deal status changes, payment reminders, rating requests, data refresh failure on a creator's account.
2. Must: users control which notifications they get; transactional security emails can't be turned off.
3. Later: WhatsApp notifications (opt-in, approved templates).

**FR-13 Admin console**

1. Must: user list and search; verify, suspend, or delete users; view reports and moderation queue.
2. Must: authenticity flags queue; manual refresh; change plans; data requests (export, deletion, correction) with status tracking.
3. Must: audit log of all admin actions.
4. Must: platform metrics: sign-ups, active users, requests, deals completed.

## Use cases

Every use case has an ID used in code and tests; each lists its main flow and the edge cases that must be handled. Security (SEC) and privacy (PRV) use cases are in their own sections below.

**Accounts (UC-A)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-A1 | Sign up | Choose role, enter details, confirm 18+, accept privacy notice, verify email | Email already registered; under-18 declared (block, no data kept); unverified email after 7 days (delete); disposable email domains; consent not ticked |
| UC-A2 | Log in | Email + password or Google | Wrong password (lockout after 5 tries for 15 min); suspended account; unverified email; Google email matches an existing password account (link after password check) |
| UC-A3 | Reset password | Request link, set new password | Unknown email (same response, no leak); expired or reused link; all sessions signed out after reset |
| UC-A4 | Change email | Enter new email, verify, old email notified | New email taken; verification never completed (old email stays) |
| UC-A5 | Delete account | Confirm, data deleted or anonymised | Open deals (warn, notify the other side); brand owner with team members (transfer or delete brand); deletion during an active subscription |
| UC-A6 | Invite brand team member | Owner invites by email, member accepts | Seat limit reached; invite to an existing creator account; invite expired; owner removes member (access ends immediately) |

**Creator profile and data (UC-C)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-C1 | Create profile | Fill details, categories, languages, location | Missing required fields; profanity or contact details in bio (blocked); unsupported city (free text, mapped later) |
| UC-C2 | Connect YouTube | Sign in with Google, choose channel, stats fetched | Several channels on one Google account; channel already claimed by another user (dispute to admin); channel with hidden subscriber count; brand-new channel with no videos |
| UC-C3 | Connect Instagram | Official login, select Business/Creator account, insights fetched | Personal account (show how to switch to Creator); permissions partly granted; account already claimed; token expires (prompt reconnect) |
| UC-C4 | Daily refresh | Scheduler fetches stats, saves snapshot, recalculates score | API quota exhausted (retry next window, keep old data); account deleted or made private (mark inactive, hide from search); token revoked; temporary API error (retry with back-off) |
| UC-C5 | Disconnect account | Creator disconnects; tokens deleted | Last connected account removed (profile hidden from search, verified badge removed) |
| UC-C6 | Update rate card and availability | Edit prices, toggle open/closed | Closed creators don't receive new requests; prices in local currency |
| UC-C7 | View own analytics | Growth charts, score breakdown, profile views | Not enough history yet ("need 7 days of data") |

**Discovery (UC-D)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-D1 | Search creators | Apply filters and sort, view results | No results (suggest wider filters); very broad search (paginate, cap page size); trial expired (search still visible, contact blocked) |
| UC-D2 | View creator profile | Open profile with stats and score | Creator deleted or suspended ("profile unavailable"); stale data (show last updated) |
| UC-D3 | Shortlist | Create list, add, note, share with team | Creator later deleted (removed from list with notice); duplicate adds ignored |
| UC-D4 | Compare | Pick 2–4 creators | Different platforms (compare per platform); missing audience data shown as "not shared" |
| UC-D5 | Save search | Save filters, rerun later | Saved filter value no longer exists |

**Collaboration (UC-R)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-R1 | Send request | Brand fills brief, sends; counts against plan | Plan limit reached; creator not open; duplicate open request; creator blocked the brand (generic "not available") |
| UC-R2 | Respond to request | Creator accepts or declines | Request expired; brand deleted meanwhile; accept after budget changed (creator sees latest version) |
| UC-R3 | Chat | Messages and attachments | Contact details flagged; blocked user; oversized or unsafe file rejected; other side deleted ("Deleted user") |
| UC-R4 | Track deal | Status moves through stages | Out-of-order updates rejected; cancellation by either side with reason; deadline passed (reminder to both) |
| UC-R5 | Mark payment | Brand marks paid; creator confirms received | Disagreement ("not received") goes to admin as a report; overdue reminders after 7 days |
| UC-R6 | Campaign report | Creator submits post link; stats fetched | Link to a different account than the creator's (rejected); post deleted later (keep last stats, mark deleted); private post |
| UC-R7 | Rate | Both sides rate after completion | One side never rates (other's rating shown after 14 days); retaliation report |

**Plans and billing (UC-B)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-B1 | Start trial | Automatic for new brands after the free beta | One trial per brand (detect same company domain or repeated sign-ups) |
| UC-B2 | Reach limit | Action blocked with upgrade options | Limit reached mid-action (nothing partially saved) |
| UC-B3 | Change plan (admin now, self-serve later) | Plan and limits updated | Downgrade with more team members than allowed (keep, block new invites) |

**Admin (UC-M)**

| ID | Use case | Main flow | Edge cases to handle |
| --- | --- | --- | --- |
| UC-M1 | Review reports | See report, take action (warn, hide, suspend) | Report against an admin; repeated false reports |
| UC-M2 | Review authenticity flags | Inspect, clear or mark suspicious | Creator appeals |
| UC-M3 | Resolve account ownership dispute | Check proof, assign account | Both users verified via official login (latest proof wins, other notified) |
| UC-M4 | Handle data request | Export, delete or correct within the legal time | Request from someone who isn't the account holder (verify identity first) |

## Security

The platform stores creators' account tokens, audience data and private chats, so security is a launch requirement, not a later phase. Follow the OWASP Top 10 and OWASP ASVS Level 2 as the baseline.

**Security requirements**

| ID | Area | Requirement |
| --- | --- | --- |
| SR-1 | Passwords | Hashed with Argon2id or bcrypt; minimum 10 characters; checked against known-breached passwords; never logged or emailed |
| SR-2 | Sessions | Secure, HttpOnly, SameSite cookies; 30-day sliding expiry; sign out of all devices; sessions revoked on password change or suspension |
| SR-3 | Login protection | Rate limits per IP and per account; lockout after 5 failures; CAPTCHA after repeated failures; same message for unknown email and wrong password |
| SR-4 | Two-factor | Required for admins at launch; optional for brands and creators later |
| SR-5 | Access control | Every API checks role and ownership on the server (a brand can only read its own shortlists, chats, campaigns); deny by default; automated tests for cross-account access |
| SR-6 | Social tokens | Instagram and Google tokens encrypted at rest with a key in a secrets manager; least permissions requested; deleted on disconnect or account deletion |
| SR-7 | Data in transit and at rest | HTTPS only (TLS 1.2+, HSTS); database, backups and file storage encrypted |
| SR-8 | Input and output | Validate all input on the server; parameterised queries (ORM); escape output to prevent XSS; Content Security Policy; CSRF protection |
| SR-9 | File uploads | Type and size limits (images, PDF; 10 MB); stored outside the web root with random names; malware scan; served through signed, expiring URLs |
| SR-10 | Secrets | All keys in a secrets manager or environment, never in code or Git; rotated on staff change or leak |
| SR-11 | Rate limiting and abuse | Limits on search, requests, messages and API per user and IP; bot detection on sign-up |
| SR-12 | Contact privacy | Creators' email and phone never returned by any brand-facing API |
| SR-13 | Logging and audit | Security events (logins, failures, role changes, admin actions, data exports) logged with time, user and IP; logs contain no passwords, tokens or chat content; kept at least 1 year |
| SR-14 | Monitoring | Alerts on error spikes, failed-login spikes, unusual export volume, and admin actions outside working hours |
| SR-15 | Backups | Daily automated backups, 30-day retention, restore tested every quarter |
| SR-16 | Dependencies | Automated vulnerability scanning of libraries and container images; critical fixes within 7 days |
| SR-17 | Infrastructure | Database in a private network; least-privilege cloud roles; admin console only over 2FA; separate production and test environments with no real data in test |
| SR-18 | Testing | Security tests in CI; a penetration test before public paid launch |

**Security use cases**

| ID | Threat | How the platform responds |
| --- | --- | --- |
| SEC-1 | Password guessing or credential stuffing | Rate limits, lockout, CAPTCHA, breached-password check, alert on spikes |
| SEC-2 | Brand tries to view another brand's shortlist or chat by changing an ID in the URL | Ownership check returns "not found"; attempt logged |
| SEC-3 | Brand scrapes the creator database through search | Per-plan and per-hour view limits, no bulk export of contact data, anomaly alert |
| SEC-4 | Fake creator claims someone else's channel | Verification only through official login proving ownership; disputes to admin |
| SEC-5 | Fake or bought followers | Authenticity flags lower the score and go to the admin queue |
| SEC-6 | Spam or scam messages to creators | Message rate limits, contact-detail and link warnings, report and block, suspension |
| SEC-7 | Fake brand collecting creators' personal details | Brand email verification, business details for paid plans, payment details shared only after acceptance, report button |
| SEC-8 | Malicious file upload | Type check, size limit, malware scan, never executed or served from the main domain |
| SEC-9 | Stolen session | Secure cookies, revoke all sessions, new-device login email |
| SEC-10 | Leaked API key or token | Rotate key, revoke tokens, review logs, follow the breach process |
| SEC-11 | Insider misuse by an admin | 2FA, least privilege, every admin action audited, chats viewed only with a logged reason |
| SEC-12 | Data breach | Incident response plan: contain, assess, notify the Data Protection Board and affected users (see Data privacy) |

## Data privacy and DPDP compliance

India's Digital Personal Data Protection Act 2023 applies from the first user, free or paid; no government licence is needed, but each user's consent is. The DPDP Rules were notified on 13 November 2025, and most duties for apps like this (notice, consent, security, breach reporting, user rights) apply from 13 May 2027 ([Hogan Lovells](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-)). The platform is built to comply from launch. This is a product checklist, not legal advice; a lawyer should review it before paid launch.

**Data inventory**

| Data | Whose | Required? | Why | Kept until |
| --- | --- | --- | --- | --- |
| Name, email, password hash | All users | Yes | Account and login | Account deletion |
| 18+ confirmation, consent records (time, notice version) | All users | Yes | Proof of valid consent | Account deletion + legal hold period |
| City, state, country, languages, categories | Creators | Yes | Search and matching | Account deletion |
| Bio, photo, rate card, portfolio | Creators | Optional | Profile | Account deletion or removal |
| Social account IDs, encrypted tokens | Creators | Yes (one account) | Stats and verification | Disconnect or deletion |
| Public stats and post data | Creators | Automatic | Profile, score, reports | Deletion; snapshots older than 2 years aggregated |
| Audience demographics (age, gender, city, aggregate only) | Creators' audiences | Only if creator connects Instagram | Matching | Disconnect or deletion |
| Brand name, industry, website, logo | Brands | Name and industry yes | Brand profile | Account deletion |
| Requests, chats, attachments, deals, ratings | Both | Generated | Collaboration | Deletion of both accounts; the other side keeps their copy with "Deleted user" |
| Phone number | Optional | No | WhatsApp alerts only | Removal or deletion |
| Security logs (IP, device, login times) | All users | Automatic | Security and fraud | 1 year |

**Not collected:** Aadhaar, PAN, date of birth, home address, bank or UPI details, social media passwords, device contacts or location. Payment-related data is collected only when in-app payments are added.

**Privacy requirements**

| ID | Requirement |
| --- | --- |
| PR-1 | A standalone privacy notice in plain English and Hindi (more languages later): what data, why, how to withdraw consent, how to exercise rights, how to complain to the Data Protection Board |
| PR-2 | Consent by unticked checkbox at sign-up; separate optional consent for marketing; no bundled consent |
| PR-3 | Consent records stored with time, user, notice version; new consent asked when the notice changes materially |
| PR-4 | Withdraw consent as easily as giving it: settings toggle for marketing, "delete my account" for everything |
| PR-5 | Rights in settings: download my data (JSON/CSV), correct my data, delete my account; requests that need admin handled within 30 days |
| PR-6 | 18+ only: age confirmation at sign-up; accounts reported as under 18 are suspended and their data deleted |
| PR-7 | Purpose limitation: data used only to run the platform; no selling of personal data; analytics only on aggregated data |
| PR-8 | Brands see only public profile fields and stats; audience data shown as aggregates |
| PR-9 | Retention: delete or anonymise when no longer needed, including unverified sign-ups after 7 days and inactive accounts after 3 years (with 30 days' warning) |
| PR-10 | Grievance contact named in the notice and in the app; complaints answered within the legal time |
| PR-11 | Processors (cloud host, email provider, analytics) under written terms; list kept up to date |
| PR-12 | Data stored in India (cloud region Mumbai or Hyderabad) by default; transfers outside India only to countries not restricted by the government |
| PR-13 | Breach response: notify the Data Protection Board without delay and with a full report within 72 hours; notify affected users promptly |
| PR-14 | Platform rules: creators keep their own data rights; data from YouTube and Instagram used only as their terms allow, including deleting it on disconnect |

**Privacy use cases**

| ID | Use case | Flow |
| --- | --- | --- |
| PRV-1 | User gives consent at sign-up | Notice shown, box ticked, record saved; without it the account isn't created |
| PRV-2 | User downloads their data | One-click export of profile, stats, requests, chats they sent, ratings, consent history |
| PRV-3 | User corrects their data | Edit in settings; locked fields (verified stats) explained |
| PRV-4 | User deletes their account | Immediate sign-out and hidden profile; full deletion within 30 days; tokens revoked; chat partner sees "Deleted user"; security logs kept 1 year |
| PRV-5 | User withdraws marketing consent | Toggle off; no further marketing emails |
| PRV-6 | Under-18 user found | Account suspended, data deleted, no further processing |
| PRV-7 | Creator disconnects Instagram | Tokens deleted; audience data deleted; verified badge removed |
| PRV-8 | Privacy notice updated | Users shown the change at next login and asked to agree again if purposes changed |
| PRV-9 | Complaint received | Logged, acknowledged, answered; escalation path to the Data Protection Board stated |
| PRV-10 | Breach detected | Incident plan: contain, assess, notify Board and users, record lessons |

## Non-functional requirements

Targets are sized for the first year (up to about 50,000 creators and 2,000 brands) and can be raised later without redesign.

| ID | Area | Target |
| --- | --- | --- |
| NFR-1 | Speed | Pages load in under 2 seconds on a 4G phone; search results in under 1 second for 95% of searches |
| NFR-2 | Availability | 99.5% monthly uptime; planned maintenance announced |
| NFR-3 | Data freshness | Creator stats no older than 48 hours, unless the platform's API is down |
| NFR-4 | Scale | Handles 10x first-year volume by adding servers, not rewriting |
| NFR-5 | Mobile | Mobile-first responsive web app (most Indian creators use phones); installable as a web app; native apps later |
| NFR-6 | Low bandwidth | Images compressed and lazy-loaded; usable on slow connections |
| NFR-7 | Languages | Interface text in translation files; English and Hindi first; regional languages added without code changes |
| NFR-8 | Local formats | Currency, number style (lakh/crore or millions) and dates by country setting; store times in UTC, show local time |
| NFR-9 | Accessibility | WCAG 2.1 AA: keyboard use, screen-reader labels, colour contrast |
| NFR-10 | Observability | Structured logs, error tracking, uptime checks, job monitoring for refreshes and emails |
| NFR-11 | Recovery | Backups restorable within 4 hours; at most 24 hours of data lost in a disaster |
| NFR-12 | Maintainability | Clean layers (domain, services, adapters, UI); each external platform behind one interface; automated tests above 80% on business logic; CI on every change |
| NFR-13 | Cost | Runs on modest cloud resources at launch; API quotas and costs monitored |

## Monetisation and plans

Creators are always free; brands pay for discovery, contacts and tools, starting only after the free beta shows steady brand activity. Prices below are starting assumptions to test, not final.

| Plan | Price (example) | Contact requests | Team seats | Includes |
| --- | --- | --- | --- | --- |
| Free beta | ₹0 | Generous, set by admin | 1 | Everything, until paid plans launch |
| Trial | ₹0 for 14 days | 10 | 1 | Search, shortlists, chat |
| Pay-as-you-go | ₹499 per 10, ₹1,999 per 50 | As bought, valid 90 days | 1 | Search, shortlists, chat |
| Starter | ₹1,999/month | 50/month | 1 | + saved searches, compare |
| Pro | ₹4,999/month | 200/month | 3 | + campaign reports, CSV export |
| Agency | ₹14,999/month | 1,000/month | 10 | + multiple brands, priority support |

**Later revenue (after company registration):** featured creator listings (clearly labelled), Creator Pro analytics and media kits, managed campaigns for a 15–20% fee, commission of 5–15% on optional in-app payments, and anonymised market reports.

**Keeping brands paying:** charge for what brands need every campaign (new creators, reports, saved time), not just a contact they use once. Ratings, campaign reports and deal history stay only in the platform.

For reference, CollabVue sells about 30 contacts for ₹749 and Qoruz starts around ₹15,000/month ([Elev8or](https://www.elev8or.io/blog/best-influencer-marketing-platforms-in-india)); Modash starts at $199/month ([Dupple](https://dupple.com/learn/best-influencer-marketing-platforms)).

## Architecture

One web app with clean layers, a PostgreSQL database in an India region, and a background worker; each social platform sits behind one adapter so new platforms and countries plug in without touching business rules.

&#91;embedded content: architecture · clients, API, services, data and external platforms\]

Dashed boxes are outside services. External platforms are reached only through the adapters, so the rest of the code never depends on YouTube's or Meta's details.

**Suggested stack:** Next.js with TypeScript for UI and API, PostgreSQL with Prisma, Auth.js for login, a job scheduler for the worker, object storage for files, an email provider for notifications, and a cloud host with a Mumbai or Hyderabad region. Docker for local development; CI runs tests and security scans on every change.

**Core data model:** User, ConsentRecord, CreatorProfile, SocialAccount (encrypted tokens), StatsSnapshot, ScoreResult (with weights version), Brand, BrandMember, Plan, UsageCounter, Shortlist, SavedSearch, CollabRequest, ChatThread, Message, Attachment, Deal, Campaign, PostReport, Rating, Report (abuse), DataRequest, Notification, AuditEvent, CountrySettings.

## International expansion

Launch in India only, but build country support in from day one so a new market is mostly configuration, translation and local legal review, not new code.

**Built in from day one**

- A `country` on every user, creator, brand and plan; India is the only enabled country at launch.
- Country settings table: currency, number format, default language(s), timezone(s), enabled social platforms, category list, plan prices, privacy notice version, data region.
- Social platforms behind one provider interface, so a country can enable TikTok (blocked in India), Kwai or others.
- All interface text in translation files; right-to-left layout support for Arabic or Urdu later.
- Data stored per region where a country requires local storage.
- Prices stored per country and currency, not converted on the fly.

**Candidate next markets** (fast-growing creator economies where expensive global tools fit poorly): Bangladesh, Sri Lanka and Nepal (close to India, shared languages); Indonesia, the Philippines and Vietnam; the Middle East (UAE, Saudi Arabia); Africa (Nigeria, Kenya, South Africa). Pick one based on contacts, language fit and early demand from brands already on the platform.

**Per-country launch checklist**

- [ ] Local data protection law reviewed (for example Indonesia's PDP Law, the Philippines' Data Privacy Act, Nigeria's NDPA, Kenya's Data Protection Act) and privacy notice adapted
- [ ] Data storage location confirmed
- [ ] Local advertising disclosure rules for influencers added to creator guidelines
- [ ] Social platforms popular there enabled and API access confirmed
- [ ] Languages translated and reviewed by native speakers
- [ ] Currency, prices and taxes on subscriptions set (with a local tax adviser)
- [ ] Local company or partner needed? (decide before charging)
- [ ] Categories and cities list localised
- [ ] Seed creators onboarded before inviting brands
- [ ] Support hours and language covered

## Risks, decisions and success metrics

The biggest risks are getting enough creators and Meta API approval, not the technology.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Meta app review delayed or rejected | No Instagram verification for the public | Launch with YouTube plus self-reported Instagram (unverified); apply early with a complete privacy policy and demo video |
| Too few creators at launch | Brands find nothing and leave | Onboard 300–500 creators in one niche and region before inviting brands |
| Brands deal off-platform | Lower revenue | Charge for discovery and reports, not single contacts; ratings and reports only in the platform |
| Fake profiles and inflated stats | Brands lose trust | Verified-only filter, authenticity flags, reports |
| API rules or quotas change | Data gaps | Provider interface, caching, quota monitoring, more platforms |
| Privacy breach | Legal penalties and lost trust | Security requirements above, minimal data, incident plan |
| Low willingness to pay | No revenue | Free beta to learn; test pay-as-you-go before subscriptions |

**Open decisions**

- [ ] First niche and region (for example food creators in one state)
- [ ] Product name, domain, trademark check
- [ ] Content score weights (start simple, tune with real campaign results)
- [ ] When to end the free beta and start charging
- [ ] When to register the company (at first paid customer, investor interest, or Meta business verification)

**Success metrics**

| Metric | Target by end of phase 2 |
| --- | --- |
| Verified creators in the launch niche | 500 |
| Brands active monthly | 50 |
| Collaboration requests per month | 300 |
| Request acceptance rate | 40% |
| Deals completed per month | 60 |
| Brands converting from trial to paid (phase 3) | 10% |

## Sources

- [India's Digital Personal Data Protection Act 2023 brought into force – Hogan Lovells](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-)
- [Best influencer marketing platforms in India – Elev8or](https://www.elev8or.io/blog/best-influencer-marketing-platforms-in-india)
- [9 best influencer marketing platforms in 2026 – Dupple](https://dupple.com/learn/best-influencer-marketing-platforms)
- [India's influencer marketing set to hit ₹5,000 crore – Deccan Chronicle](https://www.deccanchronicle.com/amp/business/indias-influencer-marketing-boom-industry-nears-5000-crore-as-regional-creators-rise-1970876)
