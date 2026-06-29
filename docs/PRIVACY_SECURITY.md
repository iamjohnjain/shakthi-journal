# Privacy & Security

## The Core Principle

Your health data is among the most sensitive data you own. It reveals patterns about your body, sleep, location (via GPS workouts), mental state (via HRV and recovery), and daily routine. Treat every integration decision as a privacy decision first.

---

## V1 Security Posture: Local Only

In V1, all data stays on your Mac. No accounts, no API keys, no cloud storage, no third-party services touching your health data. This is the safest possible starting point.

**What "local only" means:**
- The Apple Health export file is parsed in the browser (client-side JavaScript) or locally on your machine
- The processed data is stored in browser localStorage or a local file — not sent anywhere
- No login, no server, no database you don't control

**Risk level: Minimal.** The only risk is someone with physical or remote access to your Mac.

---

## Data Sensitivity Tiers

Not all health data carries the same sensitivity. Knowing this helps you decide what to sync where.

### Tier 1 — High Sensitivity (handle with care)
- HRV and resting heart rate (can indicate stress, illness, mental health)
- Sleep patterns (reveals daily routine, life schedule)
- GPS workout routes (reveals where you live, work, run)
- Body composition trends over time
- Lab results and blood work

### Tier 2 — Medium Sensitivity
- Weight and body fat percentage
- Calorie and macro intake
- Workout history (types and frequency)
- Step counts

### Tier 3 — Lower Sensitivity
- Aggregate summaries (e.g., "I averaged 8,000 steps last month")
- Goal completion rates
- General fitness level

When sharing data with any service — including AI tools — share the lowest tier necessary for the task.

---

## Risks by Integration Type

### Apple Health Export (Low Risk)
- File stays local. You control it.
- Risk: the export file itself is large and unencrypted — store it in a secure location and delete old exports.

### Strava OAuth (Low-Medium Risk)
- Strava is a reputable company with a real privacy policy
- OAuth means you grant access without sharing your password
- Risk: Strava has your GPS routes. This is already true if you use the app. No new risk if you already have an account.
- Mitigation: In Strava settings, you can set a "privacy zone" around your home so the start/end of routes are obscured.

### MyFitnessPal (Low Risk via Apple Health path)
- If nutrition flows through Apple Health export, MFP is not directly involved in the dashboard
- Risk: Only if you use the MFP CSV export path — that file contains your full eating history. Treat it like medical records.

### Unofficial MCP Servers (High Risk — Avoid)
- Any unofficial MCP server that claims to connect to Apple Health, Garmin, Whoop, or similar is a significant risk
- These servers can read everything you grant them access to
- There is no oversight or audit process
- **Rule: Do not install any third-party health MCP server without reviewing its full source code and understanding exactly what it does with your data.**

### AI Coaching via Claude (Medium Risk — Manageable)
- When you share health data in a Claude conversation, Anthropic's privacy policy applies
- Anthropic does not use Claude.ai conversation data to train models by default (as of 2026)
- For maximum privacy: share summaries, not raw export files, in Claude conversations
- Use the local MCP server approach (see MCP_PLAN.md) to give Claude structured access to only what's needed

---

## API Key Security

When Strava OAuth is added in V2:
- Never commit API keys or client secrets to git
- Store them in environment variables or a local `.env` file
- Add `.env` to `.gitignore` before writing any keys to it
- The Strava OAuth flow issues a user access token — store this in localStorage (not a remote server)

---

## What to Do if This Project Goes Online

If you ever host this dashboard on the web (so you can access it from your phone):
1. Add authentication — even a simple password — before deploying
2. Use HTTPS (all modern hosting platforms provide this)
3. Consider whether you need server-side storage at all — a PWA that syncs via iCloud Drive may be simpler and more private
4. Never log health data in server access logs
5. Revisit this document before deploying anything

---

## Summary Checklist

- [x] V1 data stays local — no cloud, no accounts
- [x] Apple Health export parsed client-side only
- [ ] Strava OAuth (V2): review privacy zones, use official API only
- [ ] No unofficial third-party health MCP servers
- [ ] API keys stored in `.env`, never committed to git
- [ ] GPS route privacy zones configured in Strava before syncing routes
