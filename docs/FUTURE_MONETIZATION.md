# Future Monetization
*Shakthi Journal — Sustainable Revenue Without Degrading the Free Experience*
*Status: Planning only — no monetization is implemented*
*Last updated: 2026-06-30*

---

## Core Principle

**The free experience must remain excellent forever.**

Monetization should add genuine new value, not remove value from what already exists. Features that are free today must never become paywalled. The free tier is the product. Premium is a upgrade for power users, not a ransom.

This document is reference-only. No Stripe integration, no subscriptions, no payment logic exists in the codebase.

---

## Why Not Monetize Now

- Beta has 3–50 users. Monetizing before product-market fit is premature and a distraction.
- Trust must be earned before being charged for. Users need to experience the full value first.
- Free growth is faster. Every user who loves the free product is a referral.
- Institutional health data (Apple Health exports, HRV, body composition) is sensitive. Users are more protective of health data than other categories. Earning trust takes longer.

**Target milestone for monetization evaluation: 1,000 active monthly users, 90-day retention > 40%.**

---

## What Must Always Be Free

These features are non-negotiable free-tier offerings, forever:

- Guest mode (full offline use, no account required)
- Email / Google / Apple account creation
- Cloud sync across unlimited devices
- Full onboarding
- Workout logging (unlimited sessions, unlimited exercises, unlimited history)
- Nutrition logging (unlimited entries, unlimited history)
- Daily logs
- Apple Health import
- Dashboard customization
- Backup and restore
- Data export
- All existing dashboard cards
- Profile and goals
- Workout templates
- Exercise library
- PWA installation

**Rationale:** Health tracking data compounds in value over time. A user who switches away because of a paywall loses all their historical data network effects. Retaining free users protects the data moat.

---

## Monetization Options (Future, Opt-In Only)

### Option A: AI Coach Pro
**Model:** Add-on subscription ($4–8/month)
**What it adds:**
- Personalized workout plan generation using LLM (not rules)
- Weekly AI-written narrative review ("Here's what's driving your results")
- Natural language Q&A about their health data
- Pattern analysis across sleep, HRV, nutrition, and training
- Periodization suggestions

**What stays free:**
- Rule-based coach notes (already implemented)
- Weekly/monthly review (already implemented, non-LLM)
- All logging and tracking

**Implementation notes:**
- LLM calls (OpenAI, Claude) cost ~$0.001–0.01 per request
- At $6/month, a user who chats 10× a day is still profitable
- Context: inject user's recent health data into system prompt
- Privacy: health data sent to LLM must be disclosed to user with explicit opt-in

---

### Option B: Advanced Analytics
**Model:** Add-on or included in AI Coach Pro
**What it adds:**
- Long-term trend charts (12+ months of body composition)
- Muscle group frequency heatmap
- Protein timing analysis
- Sleep debt accumulation tracker
- Readiness score (composite of HRV, sleep, training load)
- Personalized estimated 1RM progression curves
- Export reports as PDF

**What stays free:**
- All basic metrics and charts (as implemented)
- 30-day rolling views

**Implementation notes:**
- All compute happens locally or in Supabase Edge Functions
- No third-party analytics vendor required
- PDF generation: use `jsPDF` or `@react-pdf/renderer`

---

### Option C: Family / Team Plans
**Model:** Multi-seat plan ($8–15/month for 2–5 users)
**What it adds:**
- Coach/client relationship (personal trainer can monitor a client's logs)
- Family shared nutrition goals (parents tracking kids)
- Shared workout templates within a team
- Permission tiers (view-only, log-only, full access)

**What stays free:**
- Single-user accounts (no change)

**Implementation notes:**
- Requires a significant backend change: team membership tables, RLS policy updates
- Only viable after core product is stable and individual retention is proven
- High complexity; build last

---

### Option D: Native App (One-Time Purchase or Bundle)
**Model:** $4.99–9.99 one-time purchase on App Store, or included in subscription
**What it adds:**
- HealthKit background sync (no more manual exports)
- Push notifications
- Widgets
- Live Activities during workouts
- Apple Watch companion

**What stays free:**
- Web app (all features above)
- Manual Apple Health import on web

**Implementation notes:**
- Native app development cost is significant (3–6 months minimum)
- App Store requires 30% revenue share (drops to 15% after year 1 under <$1M)
- Web app free tier must be able to grow independently of the native app

---

### Option E: Coaching Marketplace (Long-Term)
**Model:** Revenue share (20–30% of coaching fee)
**What it adds:**
- Connect with verified fitness coaches
- Coach can view client data (with explicit client permission)
- Structured coaching programs
- In-app messaging
- Coach dashboard and analytics

**What stays free:**
- Self-coached users (no marketplace required)

**Implementation notes:**
- Highest complexity option
- Requires coach verification and vetting
- Need significant user base before marketplace has liquidity
- Think: Phase N+10, not N+3

---

### Option F: Data Portability Premium
**Model:** Do NOT do this.

**Specifically:** Do NOT charge users for data export, data access, or the ability to delete their data. This degrades trust catastrophically and in some jurisdictions (GDPR Art. 20) exporting personal data is a legal right that cannot be charged for.

---

## Pricing Philosophy

If/when paid tiers are introduced:

1. **Monthly pricing, cancel anytime** — no annual-only lock-in for basic tiers
2. **Free trial before billing** — 14–30 days before first charge
3. **Price in user's local currency** — use Stripe's automatic currency localization
4. **No dark patterns** — no hidden fees, no surprise renewals without reminder, no "sale price" fake urgency
5. **Non-profit / hardship pricing available** — discretionary on request
6. **Open pricing page** — pricing is publicly visible without requiring account creation

---

## Infrastructure Cost-Benefit at Scale

At the point where monetization becomes necessary (10,000+ MAU):

| Cost | At 10k MAU | Notes |
|---|---|---|
| Supabase Pro | ~$25/mo | Covers up to 8GB database |
| Cloudflare Pages | $0 | Free tier covers unlimited bandwidth |
| LLM (if AI Coach) | ~$500–2000/mo | Depends on usage |
| Support tooling | ~$50–100/mo | |

At $5/month with 5% paid conversion of 10k users = 500 paid users × $5 = **$2,500/month**, well above infrastructure costs.

At $5/month with 10% paid conversion of 10k users = 1,000 paid users × $5 = **$5,000/month**.

These projections suggest the product can be self-sustaining at 10k MAU without aggressive monetization.

---

## Implementation Plan When Ready

1. Add `stripe_customer_id`, `plan`, `plan_expires_at` to Supabase `profiles` table
2. Create Supabase Edge Functions for Stripe webhooks
3. Gate premium features with a client-side check against `plan` field (server-enforced via RLS for sensitive operations)
4. Test the free experience is completely unaffected
5. A/B test pricing before committing to a tier structure
6. Ship pricing page + upgrade flow before writing any premium feature code

**Do not implement any of this until the free product has strong retention.**

---

## What Would Make This Business Fail

- Paywalling features that exist today
- Making the free tier worse to pressure upgrades
- Poor data privacy leading to user loss
- Slow performance making the app feel unworthy of money
- Not having an exit path for users (no export, no data portability)
- Over-engineering premium before earning it with a great free product
