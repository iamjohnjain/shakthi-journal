# Shakthi Journal — Research Principles

## Why this document exists

Shakthi Journal surfaces health guidance: training recommendations, nutrition targets, recovery assessments, progressive overload suggestions. Health guidance that is wrong or overstated causes real harm — both by misleading the user and by eroding the trust that makes the coach useful at all.

This document defines the standards every health-related claim, recommendation, and coach note must meet. It is not optional. It applies to the rule engine today and to any AI coach in the future.

---

## Evidence Hierarchy

When the app makes a claim or recommendation, it must be grounded in the highest available evidence tier:

| Tier | Description | Trust |
|---|---|---|
| 1 | Systematic reviews, meta-analyses (Cochrane, etc.) | Strongest |
| 2 | Randomized controlled trials (peer-reviewed) | Strong |
| 3 | Clinical guidelines (ACSM, AHA, NHS, NICE, etc.) | Strong |
| 4 | Professional consensus statements (ISSN, NSCA, etc.) | Moderate |
| 5 | Observational cohort studies | Moderate — note confounders |
| 6 | Expert opinion, case studies, anecdote | Weak — require explicit caveat |

Use Tier 1–3 by default. When a claim rests only on Tier 4–6 evidence, say so.

---

## Stating Uncertainty

When evidence is limited, mixed, or emerging:

**Do this:**
> "Some research suggests lower HRV may correlate with increased injury risk, though the relationship is not well established in resistance-trained athletes specifically."

**Not this:**
> "Your HRV is low. Reduce training load today." (stated with false certainty when evidence for the specific intervention is Tier 4–6)

**Not this:**
> (silently presenting a heuristic as if it were an established clinical guideline)

Uncertainty is not a weakness. It is how science works. The coach earns trust by being honest about what it knows and what it is estimating.

**Graduated language:**
- Tier 1–2 evidence: "Research shows…", "Studies consistently find…"
- Tier 3 evidence: "Clinical guidelines recommend…"
- Tier 4 evidence: "Expert consensus suggests…"
- Tier 5–6 evidence: "Some evidence suggests…", "There is preliminary support for…"
- Heuristic / rule of thumb: "A common approach is…", "Many coaches recommend…"

---

## Medical Boundary

Shakthi Journal is not a medical device. It never:

- Diagnoses any condition
- Recommends medications, supplements at clinical doses, or clinical interventions
- Replaces a physician, registered dietitian, physical therapist, or other licensed clinician
- Claims to prevent, treat, or cure any disease

When a feature approaches this boundary — for example, HRV-based illness detection, body fat as a clinical health risk, or sleep disorder detection — the app:
1. Presents the data, not the interpretation
2. Recommends the user consult a qualified professional
3. Does not imply a clinical conclusion

---

## Nutrition Standards

### Protein target: 200g/day
Based on: body weight (~83.8 kg), body recomposition goal, resistance training frequency.

Evidence: The International Society of Sports Nutrition recommends 1.6–2.2 g/kg/day for muscle building in trained athletes (Morton et al. 2018; ISSN Position Stand on Protein). At 200g / 83.8 kg ≈ 2.39 g/kg, this is at the high end of the evidence-supported range — appropriate for this user's training volume and goal.

Confidence: **Strong (Tier 1–2).**

### Calorie target: 2300 kcal/day
This is the user's preference, not a calculated TDEE. The app does not present this as a scientifically optimal target. If adaptive TDEE estimation is added, it must use a validated formula (Mifflin-St Jeor or Katch-McArdle) and display its estimate with explicit uncertainty.

### Macro-first calorie calculation
Protein × 4 + Carbs × 4 + Fat × 9 = Calories. This uses Atwater conversion factors — the established standard in nutrition science. Confidence: **Definitive.**

### Water goal: 3785 ml (1 US gallon)
The user's personal preference. Evidence on optimal daily hydration varies substantially by body size, activity level, climate, and sweat rate (NASEM Dietary Reference Intakes). The app does not present this as a universal target. It is a personal goal.

---

## Training Standards

### Epley 1RM formula
`e1RM = weight × (1 + reps / 30)`

Confidence: **Strong (Tier 1–2)** for multi-rep compound lifts under 10 reps (Epley 1985; Mayhew et al. 1992). Accuracy decreases for >10 reps and for isolation movements. Always present as an estimate.

### Progressive overload: RPE-based adjustment
- RPE ≤ 7 → suggest weight increase (+5 lbs)
- RPE 8–9 → maintain weight
- RPE 10 / failure → suggest deload (−10%)

Evidence: Grounded in autoregulation principles (Helms, Morgan, Zourdos) and general progressive overload science (Kraemer & Ratamess 2004; NSCA guidelines). Confidence: **Moderate (Tier 4)** — the thresholds are practical heuristics, not RCT-derived. Individual variation is high.

### Calorie estimation from heart rate (Keytel formula)
`kcal/min = ((-55.0969 + 0.6309×HR + 0.1988×weightKg + 0.2017×age) / 4.184)`

Source: Keytel et al. 2005. Accuracy: ±15–20% vs. metabolic cart. Confidence: **Moderate (Tier 2)** — adequate for logging and trend analysis, not for clinical use. Shown with a `medium` confidence badge.

### HRV as a training readiness indicator
HRV predicts training readiness better than subjective reporting alone (Plews et al. 2013; Kiviniemi et al. 2007). Confidence: **Moderate (Tier 2–3).**

Caveats:
- HRV varies widely between individuals. Absolute values matter less than within-person trends.
- A single low-HRV day is a weak predictor; a 7-day declining trend is much more meaningful.
- The coach combines HRV with sleep quality — a stronger signal than either alone.

The coach notes say "lower than your recent average" — never "you are overtrained" or "you are getting sick."

---

## What the Coach May and May Not Say

### The coach may say:
- "Your HRV is 12% below your 7-day average. Consider a lighter session today."
- "You're 45g of protein away from your goal."
- "You've hit your protein target 6 of the last 7 days — good consistency."
- "Based on last week, you might try 195 lbs × 5 for bench press today."
- "Recovery looks strong today — good day to train hard."

### The coach may never say:
- "Your HRV indicates you are getting sick."
- "You need to lose X more pounds to be healthy."
- "You are overtrained."
- "This diet will help you lose X lbs in Y weeks."
- "Supplement X is proven to improve Y."
- Anything that functions as a clinical diagnosis or a medical prescription.

---

## AI Coach Standards (when built)

The rule engine will eventually be augmented by an AI coach. When that happens, additional standards apply:

**Source transparency.** The AI must state the reasoning behind its recommendations, not just its conclusions. "Based on your 7-day HRV trend and this week's training volume…" is appropriate. "You should rest" without context is not.

**No hallucinated citations.** If a study or guideline is referenced, it must exist and say what the AI claims it says. Hallucinated citations are grounds to remove the feature.

**Evidence grounding.** The AI should prefer Tier 1–3 evidence. When it extrapolates beyond that, it says so explicitly.

**Medical boundary preserved.** The AI is subject to the same medical boundary rules as the rule engine — no diagnosis, no prescription, no clinical claim.

**User control.** AI recommendations are advisory. The user can always dismiss, override, or ignore them. No recommendation affects the user's data or settings without explicit action.

**No health data to third-party AI services without explicit consent.** The user must know what data is sent, why, and where. This is a hard requirement — not a default.

---

## When You Are Unsure

If you are implementing a health-related feature and are not confident the claim is evidence-based:

1. Do not present it as established fact
2. Use graduated language ("some evidence suggests", "commonly recommended")
3. Recommend the user consult a qualified professional for individualized advice
4. Note the uncertainty in a code comment so future implementers can revisit it

**The default posture is epistemic humility.** The app helps the user understand their own data. It does not tell them what their data means for their long-term health. That leap belongs to a doctor, dietitian, or coach — not an app.
