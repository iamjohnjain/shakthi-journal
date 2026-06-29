# Shakthi Journal — Product

## The Product in One Sentence

One screen, one truth, every morning: open the app, understand your body, know what to do.

---

## Information Architecture

The navigation is intentionally shallow. Eight destinations in the sidebar. All daily actions within one tap of wherever you are.

```
Dashboard     — Today's summary. The daily entry point.
Health        — Unified health overview (heart rate, VO2 max, vitals)
Recovery      — Sleep, HRV, resting heart rate, readiness
Nutrition     — Daily intake, macro targets, meal log
Workouts      — Today, Plan, History, Progress, Templates, Library
Goals         — Athletic goals with current status
Progress      — Trends, body composition, compare any two dates
─────────────────────────────────────────
Profile       — Baseline stats, goal weight, photos
Settings      — Units, integrations, import, backup, diagnostics
```

**Design intent:** Pages that are visited rarely (Connected Accounts, Sync History, Developer Diagnostics, Dashboard Layout) live inside Settings. They remain fully accessible but do not compete for attention in the main navigation.

---

## Navigation Philosophy

**Shallow over deep.** The most common action in any section should be one tap away. Rarely-used features live one level deeper.

**Tabs for sub-sections.** Workouts uses persistent in-page tabs (Today, Plan, History, Progress, Templates, Library) rather than sidebar sub-items. The tab bar travels with the user inside the Workouts section.

**No nesting.** There are no expandable groups, no chevrons, no collapsible menus in the sidebar. Navigation is visible at a glance.

**Breadcrumb-free.** Sub-pages that require a back button (a Settings detail page, an import flow) are the exception, not the pattern.

---

## Screen-by-Screen

### Dashboard
*Question it answers: How is my body doing today, and what should I do?*

The home screen. Opens to today. Shows recovery status, today's nutrition progress, workout status, and 1–3 coach notes. Quick actions at the bottom for logging.

Design constraint: the user should never need to scroll to find the day's most important information. If information is below the fold, it is not important enough to be on this screen.

### Recovery
*Question it answers: Am I recovered? Should I train today?*

Combines sleep and HRV in a single view. Recovery Score (0–100) is the headline metric. Supporting metrics: sleep hours, sleep score, HRV, resting heart rate.

**Why sleep and recovery are one page:** Sleep is the primary input to recovery. Treating them as separate navigation destinations creates the false impression that they are independent signals.

### Nutrition
*Question it answers: Am I hitting my targets today?*

Calorie ring is the primary visual. Protein bar is the highest-priority macro (at the user's target of 200g). Meal log is organized by configurable meal slots. Quick-add for frequent foods.

### Workouts — Today tab
*Question it answers: What did I do today? What should I do?*

Shows today's workout log. A training suggestion appears at the top when relevant. The week calendar shows the context of the current training week (W1–52). Log a new workout with one button.

### Workouts — History tab
*Question it answers: What have I done in the past?*

Chronological list of all past sessions, grouped by month, collapsible. No editing from History — to edit a session, navigate to Today and select that date from the week calendar.

### Workouts — Progress tab
*Question it answers: Am I getting stronger?*

Per-exercise history with volume tracking. Shows all-time PRs and recent trend.

### Goals
*Question it answers: Am I moving toward my athletic goals?*

Seven goal categories with current status indicators and suggested next actions. Not a to-do list — a progress map.

### Progress
*Question it answers: Is what I'm doing working over time?*

Body composition over time: weight, body fat %, lean mass. Two-date comparison for before/after clarity. Default to 30-day view; 90-day view reveals what 1-week views hide.

---

## Study Before You Build

Before implementing any new feature, research the best existing implementations:

| Category | Reference products |
|---|---|
| Health OS | Apple Health, WHOOP, Oura |
| Body composition | RENPHO, Withings Health Mate |
| Strength | Strong, Hevy, RepCount |
| Nutrition | MacroFactor, Cronometer |
| Cardio / GPS | Strava, Garmin Connect |
| All-in-one | Samsung Health, Garmin Health Snapshot |

Identify what works well. Understand why it works. Then design an original solution. Do not copy UI patterns directly — take the insight and build something that fits Shakthi Journal's visual language and philosophy.

---

## Competitive Clarity

### What we improve over Apple Health
Apple Health is a data firehose — 150+ metrics with equal visual weight. Shakthi Journal surfaces what matters *for this user's specific goals* on a given day. Less data, more signal.

### What we improve over WHOOP
WHOOP requires $30/month hardware. Shakthi Journal uses Apple Watch HRV and sleep data the user already collects. Same recovery insights, no subscription.

### What we improve over MacroFactor
MacroFactor is nutrition-only. Shakthi Journal connects nutrition to training load, recovery status, and body composition in a single coherent view.

### What we improve over Strong / Hevy
Training-only apps cannot answer "should I train today?" because they have no recovery data. Shakthi Journal connects workout history to recovery signals to give a contextual answer.

---

## Data Hierarchy

Not all data is equally actionable. Prioritize by how actionable it is *right now*:

| Level | What | Where |
|---|---|---|
| 1 — Act on today | Protein remaining, recovery score, workout status | Dashboard |
| 2 — Trend signal | HRV trend, weight trajectory | Dashboard cards, Recovery |
| 3 — Historical record | Full workout log, all nutrition entries | Workouts/History, Nutrition |
| 4 — Analytical depth | Exercise volume over time, body fat %, comparison | Progress, Workouts/Progress |

The Dashboard shows levels 1–2. Detail pages show levels 3–4. Information is not hidden — it is organized by when it becomes useful.

---

## Feature Evaluation

A feature earns its place by answering **yes** to all of:

1. **Decision value** — Does it help the user make a better health decision?
2. **Frequency** — Will the user use it daily, weekly, or rarely? (Rarely-used features live in Settings or sub-tabs, not the main nav)
3. **Data integrity** — Can we source this accurately and label it honestly?
4. **Privacy posture** — Does this require sending health data anywhere? If yes, is that disclosed and consented to?

Features that fail any of these tests belong deeper in the app — or not at all.

---

## Emotional Design Goals

**After logging a PR:** Pride. The UI surfaces it clearly — a gold badge, a brief celebration. The moment is not buried in a log entry.

**After a rest day:** Permission. Recovery is training. The app should treat it that way, not display an empty "no activity" state.

**After a bad week:** Context. One bad week does not erase months of progress. Show the trend, not just today.

**After hitting protein for 7 days:** Momentum. A quiet acknowledgment. Not a confetti explosion, but a note from the coach that this is working.

The app never makes the user feel judged, surveilled, or behind. It is a tool, not a critic.
