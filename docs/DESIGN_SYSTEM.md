# Shakthi Journal — Design System

## Philosophy

**Apple-inspired craftsmanship. Original identity.**

The design should feel considered — like every spacing decision, color choice, and animation has a reason. Dark mode is the default experience, not a preference. White space is not emptiness; it is clarity.

The visual language must be calm. Information hierarchy should be obvious at a glance. Interactions should feel immediate and satisfying. Motion should communicate meaning, not decorate the screen.

**This design should not look assembled. It should look made.**

---

## Visual Philosophy

**Inspired by Apple craftsmanship.** SF Pro fonts, true-black backgrounds, clean cards, purposeful animation. Not because Apple is fashionable, but because this craftsmanship standard is the right one for a daily personal tool.

**Original identity.** We study Apple's patterns, then make our own design decisions. No component should be mistaken for a generic UI kit.

**Premium spacing.** Generous padding inside cards. Breathing room between sections. Whitespace earns its keep.

**Excellent typography.** The type hierarchy is the design. Bold metrics. Light supporting text. Uppercase section labels. Tabular numbers for all metrics.

**Purpose-driven motion.** Every animation communicates something: a ring filling shows progress, a card appearing shows a transition, a badge appearing celebrates an achievement. Decoration is not a use case.

---

## Color Palette

All colors are CSS custom properties defined in `src/styles/globals.css`. Never hard-code hex values in components.

### Background layers (darkest → lightest)
```css
--bg-primary:   #000000   /* True black — page background */
--bg-secondary: #111113   /* Cards, primary elevated surfaces */
--bg-tertiary:  #1c1c1e   /* Input fields, secondary cards, hover states */
--bg-elevated:  #0c0c0e   /* Deeply embedded UI, nested inputs */
```

### Semantic accent colors
```css
--blue:    #0A84FF   /* Primary CTA, active states, Lifting workouts */
--green:   #30D158   /* Success, Cardio, protein goal met, positive trends */
--orange:  #FF9F0A   /* Warning, caution, medium confidence, mock data */
--red:     #FF453A   /* Destructive actions, error states, negative trends */
--yellow:  #FFD60A   /* PRs, achievements, carbohydrates */
--purple:  #BF5AF2   /* Manual data badge, sleep metrics */
--teal:    #5AC8F5   /* Hydration, recovery, secondary metrics */
```

### Dim variants (backgrounds behind colored text)
```css
--blue-dim:   rgba(10, 132, 255, 0.14)
--green-dim:  rgba(48, 209, 88, 0.14)
--orange-dim: rgba(255, 159, 10, 0.14)
--red-dim:    rgba(255, 69, 58, 0.12)
--yellow-dim: rgba(255, 214, 10, 0.14)
--purple-dim: rgba(191, 90, 242, 0.14)
--teal-dim:   rgba(90, 200, 245, 0.14)
```

### Text hierarchy
```css
--text-primary:   #ffffff
--text-secondary: rgba(255, 255, 255, 0.65)
--text-tertiary:  rgba(255, 255, 255, 0.35)
```

### Borders
```css
--border:        rgba(255, 255, 255, 0.10)   /* Card borders */
--border-subtle: rgba(255, 255, 255, 0.055)  /* Dividers inside cards */
```

### Semantic color mapping

| Context | Token |
|---|---|
| Primary CTA | `--blue` |
| Lifting workout | `--blue` |
| Cardio workout | `--green` |
| PR achievement | `--yellow` |
| Caution / low recovery | `--orange` |
| Destructive / delete | `--red` |
| Manual data badge | `--purple` |
| Mock data badge | `--orange` |
| Imported data badge | `--blue` |
| Sleep | `--purple` |
| Hydration / water | `--teal` |

---

## Typography

**Font stack:** `-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif`

System fonts deliver native legibility on Apple devices and zero loading cost.

### Scale

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 22px | 700 | |
| Section label | 13px | 600 | Uppercase, letter-spacing 0.04em |
| Card heading | 16–18px | 700 | |
| Body copy | 14–15px | 400–500 | Line height 1.4–1.5 |
| Supporting text | 13px | 400 | |
| Labels / metadata | 11–12px | 500–600 | |
| Micro labels | 10–11px | 700 | Uppercase, letter-spacing 0.06em |

### Rules
- Minimum font size: 10px. Below this, text becomes inaccessible on small screens.
- Uppercase labels always include `letter-spacing: 0.04–0.06em`.
- Metrics use `font-variant-numeric: tabular-nums` to prevent layout shift as numbers change.
- Bold the number, reduce the weight of the unit: `185` lbs, not `185 lbs`.

---

## Spacing

Base unit: 4px.

```
4px   — Micro gap between inline elements
6px   — Gap between chips and badges
8px   — Gap between form elements in a row
12px  — Gap between related elements in a section
14–16px — Standard card padding (horizontal)
20px  — Modal body padding, section padding
24px  — Standard section margin-bottom
28px  — Large section margin-bottom
```

Cards: `padding: 14px 16px` on mobile, `padding: 16px 20px` on desktop.  
Section titles: `margin-bottom: 10px`.  
Page-level sections: `margin-bottom: 24–28px`.

---

## Corner Radius

| Element | Radius |
|---|---|
| Page-level cards | 12–16px |
| Modals | 20px (bottom sheet: 20px top only) |
| Primary buttons | 10px |
| Chips / pills | 20px (fully rounded) |
| Inputs | 8–10px |
| Badges | 4–6px |
| Avatar | 50% |

---

## Component Patterns

### Cards
- Background: `--bg-secondary`
- Border: `1px solid var(--border)`
- Hover: `background: var(--bg-tertiary)`, transition `0.1s`
- PR state: `border-color: rgba(255, 214, 10, 0.25)` — gold tint

### Buttons

**Primary:** `background: var(--accent)`, white text, `border-radius: 10px`, `font-weight: 600`

**Secondary:** `background: var(--bg-tertiary)`, `border: 1px solid var(--border)`, muted text

**Destructive:** `color: var(--red)` on hover, `background: rgba(255, 69, 58, 0.08)` on hover

**Ghost:** No background, border only — for low-emphasis actions alongside primary CTAs

### Chips and Pills
- Fully rounded: `border-radius: 20px`
- States: inactive (bg-elevated + subtle border) → active (dim-color bg + color border + color text)
- Transitions: `border-color 0.12s, color 0.12s, background 0.12s`

### Inputs
- Background: `--bg-elevated` or `--bg-tertiary`
- Border: `1px solid var(--border)`
- Focused: border shifts to `--blue` (or contextual accent)
- Font size: 14–15px minimum — never smaller on mobile (accessibility)
- Always paired with a visible label above — never rely on placeholder as the sole label

### Modals
- **Mobile (< 540px):** Bottom sheet, `border-radius: 20px 20px 0 0`
- **Desktop (≥ 540px):** Centered dialog, `border-radius: 20px`
- `max-height: 88–92dvh` with `overflow-y: auto` on the body
- Overlay: `rgba(0, 0, 0, 0.65)`
- Header: sticky, title + close button
- Footer: sticky, primary action button
- Footer padding includes `env(safe-area-inset-bottom)` for iOS

### Data Source Badges

Every record from outside the user's current manual session carries a badge:

| Source | Label | Color |
|---|---|---|
| `mock` | MOCK DATA | Orange |
| `imported` | IMPORTED | Blue |
| `manual` | MANUAL | Purple |
| `live` | LIVE | Green |

Badges are always visible when data provenance is ambiguous. There is no silent mixing.

### Empty States
Every data section that can be empty has a state that:
- States the situation neutrally (not apologetically)
- Offers one clear action ("Log your first workout →")
- Applies no pressure or guilt

### In-Page Tab Navigation (Workouts)
- Horizontal scrollable strip inside a rounded container
- Items: `flex: 0 0 auto`, `white-space: nowrap` — they do not stretch
- Active state: `background: var(--blue-dim)`, `color: var(--blue)`, `font-weight: 600`
- Container has `overflow-x: auto`, `scrollbar-width: none` for clean mobile scroll

---

## Motion

Every animation serves a purpose. If you cannot state why an animation exists, remove it.

| Animation | Duration | Easing |
|---|---|---|
| Recovery ring fill | 1.4s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Progress bars | 1.0s | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Hover transitions | 0.1–0.15s | ease |
| Modal entry (bottom sheet) | 0.3s | ease-out |
| Chip state change | 0.12s | ease |

No looping animations. No auto-playing motion on idle screens. No animation that the user did not trigger.

---

## Layout

### Desktop
- Sidebar: 220px fixed left
- Main content: remaining width, max-width 760px centered
- Page padding: `24px 16px 60px`

### Mobile
- Sidebar hidden; bottom navigation bar
- Horizontal padding: 16px
- Safe area insets: `env(safe-area-inset-*)` applied to bottom-fixed elements
- Modals: bottom sheet

### Breakpoints
- `< 540px` — Mobile
- `≥ 540px` — Compact desktop (centered modals)
- `≥ 768px` — Full desktop (sidebar visible)

---

## Iconography

Library: `lucide-react` — 1.5px stroke, consistent visual weight, tree-shakeable.

| Context | Size |
|---|---|
| Sidebar navigation | 16px |
| Button icons | 14–16px |
| Inline text icons | 12–14px |
| Feature / hero icons | 20–24px |

Icon-only buttons always have an `aria-label`. Navigation icons always have a text label.

---

## Anti-Patterns

**Gradient soup.** Gradients appear only on the recovery ring and the sidebar avatar. Every other surface is flat.

**Color overload.** Each screen should have one or two accent colors, not five.

**Cramped text.** Minimum 4px between any text and its container edge. 8px is better.

**Placeholder-as-label.** Inputs always have a visible label above them. Placeholders may supplement but never replace.

**Overflow without affordance.** Any horizontally scrollable content must visually indicate it is scrollable (fade-out at edge, or visible partial next item).

**Decoration for decoration's sake.** No looping animations, no loading spinners for instant operations, no skeleton screens where data loads in under 100ms.

**AI-assembled layouts.** No generic card grids with filler content. No stock-style illustration sets with mixed stroke weights. If something looks AI-assembled, it should be redesigned.
