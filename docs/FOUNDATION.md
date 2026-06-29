# Shakthi Journal — Foundation

> A personal health operating system. Not a tracker. A decision-making tool.

---

## Mission

Turn health data into clear daily decisions.

Not data for its own sake. Not dashboards that feel impressive but leave the user uncertain what to do. Every metric, every visualization, every coach note exists to answer one question: *What should I do today?*

---

## What It Is

A personal health OS for someone who takes training and recovery seriously and wants all their health data — sleep, nutrition, workouts, body composition, cardiovascular fitness — integrated into one coherent picture that updates every day.

The defining characteristic: it tells you what the data means, not just what it says.

---

## What It Is Not

**Not a social fitness app.** There are no followers, no leaderboards, no public activities. Health is personal. The only person Shakthi Journal is trying to impress is the user.

**Not a generic health dashboard.** It is designed for one person with specific goals: body recomposition, strength progress, athletic performance. Generic advice does not live here.

**Not a notification machine.** The app earns daily use by being useful. It does not manufacture urgency.

**Not a medical tool.** Shakthi Journal presents data. It does not diagnose, prescribe, or make clinical claims.

**Not a growth product.** The goal is to serve one person exceptionally well, not to acquire users.

---

## The User

John Mundackal. Athletic. Performance-oriented. Tracks seriously. Values precision and honesty over motivation and engagement. Uses Apple Watch, RingConn, RENPHO scale, trains at a gym, does basketball. Cares about body recomposition — reduce fat, maintain or increase lean mass. Wants to dunk.

Design for him specifically. Generalize only when generalization does not compromise the experience.

---

## Design Values

These eight words are not aesthetics. They are requirements. Every screen, every feature, every animation is tested against them.

**Calm.** Opening the app should reduce anxiety, not create it. Data presented in a way that overwhelms produces worse decisions, not better ones.

**Trustworthy.** Every number has a source. Every estimate is labeled. The user should never wonder whether what they're seeing is real, mocked, or guessed.

**Fast.** The daily use case is under 60 seconds. The app should be faster than the user expects.

**Personal.** The experience is shaped by the user's goals, data, and history. Not by population averages or generic recommendations.

**Intentional.** Nothing is on screen by accident. Every element earns its place by serving the user's decision-making.

**Private.** Health data does not leave the device without explicit consent. No telemetry. No analytics. No third-party sharing.

**Scientific.** Recommendations are grounded in evidence. Uncertainty is acknowledged. The app does not state opinions as facts.

**Motivating.** The app should make the user feel capable and informed — not judged, surveilled, or behind.

---

## Interaction Philosophy

**Never overwhelm the user.** One question per screen. One most-important metric per card. Progressive disclosure for everything else.

**Default to the simplest option.** When a user opens the app, they see the single most useful summary. Depth is available, but it requires intention.

**Advanced features remain discoverable but hidden.** Power users can access exercise history, multi-date compare, custom meal labels, and detailed recovery trends — but none of these appear until the user goes looking for them.

**Earned trust through honesty.** The app labels mock data, imported data, and estimated values differently. A user who sees a MOCK DATA badge learns to trust LIVE data. Transparency earns credibility.

---

## Core Principles

**1. Data without action is clutter.**
A metric that does not help the user make a better decision today should not be on the home screen. If we cannot answer "now what?" for a data point, it belongs deeper in the navigation — or not at all.

**2. Feel calmer after opening, not worse.**
Guilt is not motivation. Overwhelm is not information density. Every data point presented is an opportunity to give the user clarity or to take it away. Choose clarity.

**3. Usable in under 60 seconds a day.**
The daily use case is: open, see the summary, act. Not: open, navigate three layers, interpret raw data, close. The summary should be instant. Depth is optional.

**4. Privacy is not a feature — it is a constraint.**
Data stays local in IndexedDB unless the user explicitly chooses to connect a service. No health data is transmitted without explicit, informed consent. This is not negotiable.

**5. Honest labeling always.**
Mock data is labeled MOCK. Imported data is labeled IMPORTED. Estimated values say they are estimates. The source of every metric is traceable. A user who cannot verify what they're seeing cannot trust it.

**6. One navigation level is the goal.**
If the user needs to click more than twice to do something they do every day, the navigation has failed. Daily actions (log food, log workout, see today's summary) must be reachable in one tap.

---

## Success Criteria

The product is working when:

- The user opens the app in the morning and knows in 10 seconds whether to train hard, train easy, or rest.
- The user can log a workout in under 90 seconds without thinking.
- The user can log a meal in under 30 seconds without thinking.
- The app has never silently mixed real data with mock data.
- Every recommendation can be traced to a specific data source.
- The user has not lost data due to a browser update or accidental deletion.
