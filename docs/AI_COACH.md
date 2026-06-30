# Shakthi Journal — AI Coach Philosophy

## What the coach is

The coach is a rule-based intelligence layer that reads your data and surfaces what matters. It does not use external AI APIs, does not call any servers, and never sends your health data anywhere. Everything runs locally on your device.

The coach is a *translator*, not a doctor. It translates numbers into words — helping you understand what your data means without requiring you to be a health expert.

---

## What the coach is allowed to say

- Observations from real logged data, with explicit attribution to the source
- Well-established relationships from exercise science and nutrition (e.g., "protein synthesis requires consistent daily intake")
- Specific, actionable suggestions calibrated to your situation (e.g., "38g remaining — one chicken breast closes it")
- Confidence level on each insight (high / medium / low)
- When data is insufficient: what's missing and how to get it
- Positive reinforcement when you're on track
- Gentle, non-alarmist nudges when a pattern warrants attention

---

## What the coach must never say

- Medical diagnoses ("You may have overtraining syndrome")
- Clinical interpretations of lab-like metrics ("Your HRV indicates autonomic dysfunction")
- Specific medication, supplement dosage, or clinical protocol advice
- Anything implying certainty from insufficient data ("Your HRV shows you are overtrained")
- Fear-based or alarmist language
- Absolute statements about what will happen ("If you don't eat X, you will lose muscle")
- Fabricated or interpolated data presented as real ("Based on your typical pattern…")
- Results from data that was marked as mock or simulated, presented as real

---

## Evidence hierarchy

Confidence is assigned based on data quality:

| Level  | Meaning                                                           |
|--------|-------------------------------------------------------------------|
| High   | Derived from logged data with direct measurement (e.g., logged protein, Apple Health HRV) |
| Medium | Derived from logged data with estimation (e.g., workout calorie burn) or partial data |
| Low    | Heuristic or pattern-based, insufficient data for strong conclusion |

When confidence is low, the insight says so explicitly.

---

## Insight structure

Every insight follows this format:

```
Observation     — what the data actually shows
Why it matters  — the relevant physiology/mechanism in plain language
Suggested action — one specific, concrete next step
Confidence      — high / medium / low
Data used       — which sources informed this insight
```

Missing data is always listed when it would change the insight.

---

## Communicating uncertainty

- Use "suggests" not "proves"
- Use "may" not "will"
- Use "typically" not "always"
- Say "based on [source]" for every claim
- Say "with more data, this would be more reliable" when confidence is low
- Never suppress an insight just because data is partial — acknowledge the gap instead

Examples of correct hedging:
- ✅ "HRV is on the lower side (52ms). This *suggests* moderate recovery — not a rest day, but probably not a max-effort session."
- ✅ "Weight has been flat for 7 days. *If* you're trying to lose fat, this warrants a small calorie reduction. *If* you're maintaining, this is perfect."
- ❌ "Your HRV of 52 means you are under-recovered." (too certain)
- ❌ "You need to eat less." (not attributing data, not explaining)

---

## Tone

**Calm.** Not urgent. Not pushy. The coach does not panic when a number looks off.

**Encouraging.** Acknowledge effort. Celebrate consistency. Recognize when someone is close to a goal.

**Specific.** Vague advice ("eat more protein") is noise. Specific advice ("38g protein remaining — one shake or 200g chicken breast") is signal.

**Human.** Short sentences. No jargon unless explained. The way a knowledgeable friend would talk.

**Never alarmist.** Even a genuinely concerning pattern (very low HRV, consecutive poor sleep nights) is presented factually and calmly, not dramatically.

---

## When to suggest seeing a healthcare professional

The coach proactively adds "speak to a doctor if this persists" when:
- Resting HR has been elevated (>20% above baseline) for 3+ consecutive days
- Sleep quality has been consistently very poor (< 5h or self-rated 1/5) for 5+ days
- Any metric shows a pattern that is medically significant rather than performance-relevant

Language to use:
> "This pattern is worth mentioning to your doctor — not urgent, but worth tracking."

Language NOT to use:
> "This could indicate a serious health condition."

---

## Priority system

Insights are ranked by priority. The top 3–5 are surfaced in the Daily Brief.

| Priority range | Category                          |
|---------------|-----------------------------------|
| 1–15          | Action items (missing something important today) |
| 16–30         | Warnings (trend worth addressing) |
| 31–50         | Positives (on-track acknowledgments) |
| 51–70         | Informational (patterns, context)  |
| 71–100        | Setup prompts (encourage data capture) |

Setup prompts float to priority 20 if they would enable an otherwise-unavailable insight.

---

## Data source labels

Every insight card shows which data it came from:

- **Apple Health** — imported from Apple Health XML export
- **Manual Log** — entered via the daily log page
- **Workout Log** — from a logged workout session
- **Nutrition Log** — from logged meals
- **Profile** — from onboarding or profile page
- **Calculated** — derived from multiple sources

---

## Category definitions

| Category   | What it covers                                           |
|------------|----------------------------------------------------------|
| recovery   | HRV, sleep, resting HR, training load context            |
| nutrition  | protein, calories, macros, hydration, meal timing        |
| training   | workouts, progressive overload, muscle recovery, cardio  |
| weight     | trend analysis, goal progress, plateau detection         |
| activity   | steps, NEAT, movement consistency                        |
| setup      | prompts to log data or connect a source                  |

---

## What this engine is not

- Not an AI language model
- Not connected to the internet
- Not a medical device
- Not a substitute for professional guidance
- Not accessing any data outside this app

The insights are *interpretations of your data by pre-written rules*, not predictions or diagnoses. The rules are written by a human, reviewed for accuracy, and conservative by design.
