# Shafiq Medical & Diagnostic Center — Design System & Build Addendum

**What this is:** the missing half of your master prompt. Your document specifies *behaviour* in extreme detail but leaves *design* as adjectives ("clean, premium, blue+white"). Adjectives produce generic output. This file replaces them with tokens, measurements, and component contracts so that every screen an agent builds looks like it came from the same studio.

**How to use it:** put this file in the repo at `/docs/design-system.md`, commit it first, and append the prompt block in §11 to your master prompt. Reference it in every phase.

---

## 1. Design plan (the reasoning — read once, then follow the tokens)

**Subject:** software a busy two-doctor clinic in Swat uses 60–100 times a day, mostly on a desktop, often with a patient sitting across the desk. The single job of every screen is *let the doctor see or record something in under three seconds without typing*.

**Direction:** *clinical instrument, not SaaS dashboard.* The reference is a well-made lab analyser readout or a hospital chart — high information density, hairline rules, tabular numbers, no ornament. Not a startup dashboard with rounded cards and gradient stat tiles.

**The three decisions that make it look designed rather than defaulted:**

1. **A real blue, not the framework blue.** `#1656A6` — desaturated, slightly cold, institutional. Tailwind's `blue-600` (#2563EB) is the tell that nobody chose a colour.
2. **Clinical data is set in mono.** Every patient ID, dose, vital, date and rupee amount uses IBM Plex Mono with tabular figures. Prose uses Inter. This one rule does more for the "medical-grade" feeling than any amount of shadow work, and it makes columns of numbers actually scannable.
3. **The Patient Rail is the signature.** On every clinical screen, a fixed 280px right-hand rail carries the patient's identity: ID in mono, allergy flag, outstanding due, last visit, next appointment. It never scrolls away during a consultation. This is your §66 requirement — "one connected patient record" — made visible instead of merely claimed.

**Deliberately rejected:** gradient stat cards, `rounded-2xl` everywhere, drop shadows on inputs, animated counters, illustration empty states, dark mode in V1.

---

## 2. Colour tokens

Semantic names only. No component may use a raw hex.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0F1D2E` | Primary text, headings |
| `--ink-2` | `#48586B` | Secondary text, labels |
| `--ink-3` | `#7C8B9C` | Placeholder, disabled, meta |
| `--paper` | `#FFFFFF` | Cards, tables, modals, inputs |
| `--canvas` | `#F5F7FA` | App background behind cards |
| `--line` | `#E3E8EF` | Hairline borders, dividers |
| `--line-strong` | `#CBD4E1` | Input borders, table header rule |
| `--primary` | `#1656A6` | Primary buttons, active nav, links |
| `--primary-deep` | `#0E3C77` | Hover/pressed primary, sidebar base |
| `--primary-wash` | `#EAF1FA` | Selected rows, active chips, focus fill |
| `--focus` | `#2B7FD9` | Focus ring only — never a fill |

**Status colours.** One hue per meaning, used identically everywhere (appointment status, investigation status, WhatsApp status, payment state):

| Meaning | Text/icon | Background |
|---|---|---|
| Waiting / Ordered / Scheduled | `#9A5B00` | `#FDF3E3` |
| In Consultation / Pending | `#0F6E77` | `#E4F4F5` |
| Completed / Paid / Sent / Reviewed | `#15703C` | `#E7F4EB` |
| Due / Failed / Cancelled / Allergy | `#A81E1E` | `#FBECEC` |
| No Show / Inactive / Draft | `#5B6876` | `#EEF1F4` |

**Allergy is always red and always shown.** If a patient has a recorded allergy it appears as a red pill on the Patient Rail, in the header of every prescription screen, and on the printed prescription. No exceptions, no configuration.

### Drop-in tokens (Tailwind v4, `app/globals.css`)

```css
@import "tailwindcss";

@theme {
  --color-ink:          #0F1D2E;
  --color-ink-2:        #48586B;
  --color-ink-3:        #7C8B9C;
  --color-paper:        #FFFFFF;
  --color-canvas:       #F5F7FA;
  --color-line:         #E3E8EF;
  --color-line-strong:  #CBD4E1;
  --color-primary:      #1656A6;
  --color-primary-deep: #0E3C77;
  --color-primary-wash: #EAF1FA;
  --color-focus:        #2B7FD9;

  --color-warn:      #9A5B00;  --color-warn-bg:    #FDF3E3;
  --color-info:      #0F6E77;  --color-info-bg:    #E4F4F5;
  --color-ok:        #15703C;  --color-ok-bg:      #E7F4EB;
  --color-danger:    #A81E1E;  --color-danger-bg:  #FBECEC;
  --color-muted:     #5B6876;  --color-muted-bg:   #EEF1F4;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Instrument Sans", "Inter", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  --radius-sm: 4px;
  --radius:    6px;
  --radius-lg: 8px;

  --shadow-card: 0 1px 2px rgb(15 29 46 / 0.06);
  --shadow-pop:  0 8px 24px rgb(15 29 46 / 0.12);
}

html { font-feature-settings: "cv05", "ss01"; }
.tnum { font-variant-numeric: tabular-nums; }

*:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

**Exactly two shadow levels exist:** `--shadow-card` for raised surfaces and `--shadow-pop` for modals, dropdowns and toasts. Nothing else casts a shadow. Inputs never do.

**Radius:** 6px default, 4px for pills and chips, 8px for modals. Never larger.

---

## 3. Typography

| Role | Face | Weight | Size / line | Notes |
|---|---|---|---|---|
| Page title | Instrument Sans | 600 | 24 / 30 | One per screen |
| Section header | Instrument Sans | 600 | 16 / 22 | Consultation section headers |
| Card title | Inter | 600 | 15 / 20 | |
| Body | Inter | 400 | 14 / 21 | Default everywhere |
| Label | Inter | 500 | 12 / 16, `+0.04em`, uppercase | Field labels, table headers |
| Meta | Inter | 400 | 12 / 16, `--ink-3` | Timestamps, helper text |
| **Data** | **IBM Plex Mono** | 500 | 14 / 20, tabular | IDs, doses, vitals, dates, amounts |
| Data large | IBM Plex Mono | 600 | 20 / 26 | Dashboard figures, invoice totals |

Load all three from `next/font/google` with `display: "swap"`. Base size is 14px, not 16 — this is a dense clinical tool used at arm's length on a desktop, and 16px body wastes a third of the row budget.

**The mono rule, stated so an agent can't miss it:** patient IDs (`PAT-000001`), phone numbers, all dates and times, all vitals with their units, all drug doses and durations, all rupee amounts, all reference numbers → `font-mono tnum`. Everything else → Inter.

---

## 4. Layout & density

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR  56px   logo │ search (flex) │ AI │ bell │ doctor        │
├────────┬─────────────────────────────────────────┬───────────────┤
│ SIDE   │  CONTENT                                │  PATIENT RAIL │
│ BAR    │  max 1440, padding 24                   │  280px, fixed │
│ 240px  │                                         │  (clinical    │
│ (64    │                                         │   screens     │
│  coll- │                                         │   only)       │
│  apsed)│                                         │               │
└────────┴─────────────────────────────────────────┴───────────────┘
```

- **Grid:** 8px. Sub-steps of 4px allowed inside components only.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48. Nothing else.
- **Top bar** 56px, `--paper`, 1px bottom `--line`. Search is 480px wide, centred, opens results in a popover under it.
- **Sidebar** 240px, background `--primary-deep`, white text at 88% opacity, active item = white text on `rgba(255,255,255,.12)` with a 3px white left bar. Collapses to 64px icon rail; state persists in localStorage. Exactly the 8 modules from §5 of the master prompt.
- **Table rows** 44px, header 40px, hairline `--line` between rows only (no vertical rules, no zebra striping). Row hover `--canvas`, selected `--primary-wash`.
- **Inputs** 38px tall, 1px `--line-strong`, radius 6, 12px horizontal padding. Focus = 2px `--focus` ring, no glow.
- **Buttons** 38px (compact 32px in toolbars). Primary: `--primary` fill, white text. Secondary: white fill, `--line-strong` border, `--ink` text. Ghost: no border, `--primary` text. Destructive: white fill, `--danger` border and text; filled red only inside a confirm dialog.
- **Breakpoints:** design at 1440. Rail collapses to a top summary strip below 1280. Sidebar becomes a drawer below 1024. Tables become stacked record cards below 768.

---

## 5. The interaction primitive: the chip grid

Your core philosophy is *minimum typing, maximum tick*. That deserves a real component, not scattered checkboxes. Build `<ChipGrid>` once and use it for medical history, allergies, lifestyle, complaints, examination findings, instructions, follow-up intervals, and investigation selection.

**Spec:** 32px tall pills, radius 4, wrapping grid with 8px gaps, single- or multi-select. Unselected: white, `--line-strong` border, `--ink-2` text. Selected: `--primary-wash` fill, `--primary` border, `--primary-deep` text, small check icon. Fully keyboard operable — arrow keys move, space toggles. The last chip in any set is always `+ Other`, which reveals a single inline text input in place, never a modal.

**Exclusivity is declared in data, not hand-coded:** a chip may be marked `exclusive`. Selecting "None" or "No Known Allergy" clears and disables its siblings; selecting a sibling clears the exclusive chip. One implementation covers §13 and §14 of the master prompt.

Duration chips (7 / 14 / 20 / 30 / 45 / 60 / 90 days) render the resulting calendar date directly beneath the selected chip in mono: `→ 10 October 2026`. The doctor confirms the date visually rather than trusting arithmetic.

---

## 6. Screen contracts

**Dashboard.** Eight figures in a 4×2 grid of plain bordered tiles: label in Label style, number in Data Large mono, no icons, no sparklines, no animation. Below, today's queue as a full-width table: time (mono), patient, ID (mono), doctor, type, status pill, and right-aligned `Start visit` / `Open profile` buttons. The queue is the page's centre of gravity; the tiles are a strip.

**Global search.** Debounce 200ms, indexed server-side. Results group under Label-style headers: Patients, Appointments, Prescriptions, Investigations, Billing. A patient result is one row: name in 15px semibold, `PAT-000001` in mono beneath, and right-aligned counts — `2 visits · 2 Rx · 1 lab · Rs 1,000 due` with the due in `--danger` when non-zero. Enter opens the top result. Cmd/Ctrl+K focuses.

**Patient profile.** Header block spanning the content column: name at 24px, ID in mono, then a single row of pills — age, gender, doctor, allergy (red), due (red). Tabs beneath as a 40px underlined row, active tab has a 2px `--primary` underline. The Patient Rail carries quick actions: `New visit`, `Appointment`, `Payment`.

**Consultation workspace.** Left: numbered accordion sections in the master prompt's order, all collapsed except the active one, each header showing a one-line filled summary when collapsed (`Vitals — BP 130/85 · Pulse 88 · Temp 98.4`). Right: the Patient Rail plus a live running summary that fills in as sections are completed, ending in the sticky `Save visit` button. Sections open on click and on tab-through; nothing is a wizard step, nothing blocks anything else. Autosave draft to local state every 10s and restore on reload.

**Billing.** Line items in a mono-aligned table with the arithmetic shown explicitly as its own rows — Charges, Discount, **Net total**, Paid, **Due** — with Due in `--danger` and the two bold rows separated by a 1px rule above. Never present a total without the subtraction visible.

**States.** Every list has three: loading (skeleton rows at exact final height, no spinner), empty (one line of plain text plus the primary action button — no illustration), error (what failed, what to do, a `Retry` button). Every save button disables itself and shows an inline spinner for the duration of the request.

---

## 7. Print & PDF

Print layouts are separate route-level components with their own stylesheet, rendered server-side to real HTML at exact paper dimensions. Do not screenshot the app.

- **Prescription — A5 portrait.** Clinic name in Instrument Sans 18/600 with both phone numbers and the Kala Kelay address beneath; doctor name and qualifications right-aligned. 1px rule. Patient block: name, `PAT-` ID, age/gender, date — all mono. Allergy line in red if present. `Rx` mark, then medicines as a numbered mono list: name, strength, dose · frequency · duration, instruction beneath in italic Inter. Follow-up date. Signature rule at 20mm from the foot.
- **Receipt — A5 portrait, and an 80mm variant for thermal.** Same header. Charges table, the same explicit arithmetic as the billing screen, payment method, online reference when applicable, and paid/due stamp.
- **Visit summary — A4.** Complaint, history, vitals, examination, diagnosis, investigations, prescription, follow-up, billing, in that order, each under a Label-style header.
- Print CSS: `@page { size: A5; margin: 12mm }`, black text on white, all colour except the red allergy line converted to greyscale, `print-color-adjust: exact` on status pills.

---

## 8. Motion

Permitted, and nothing else: modal and popover 120ms ease-out fade+2px rise; accordion height 160ms ease-in-out; dropdown 100ms; button hover instant colour change; toast slide-in 150ms. Respect `prefers-reduced-motion: reduce` by disabling all of it. No page transitions, no skeleton shimmer, no counting numbers, no scroll effects.

---

## 9. Copy rules

Sentence case everywhere, including buttons. Name the action, not the mechanism: `Save visit`, `Copy previous prescription`, `Send summary` — never `Submit` or `Confirm operation`. A button's verb survives into its confirmation toast: `Save visit` → "Visit saved." Errors state what happened and the next step, without apology: "Couldn't reach the database. Your entries are kept — try saving again." Empty states are invitations: "No visits yet. Start the first consultation." Bilingual note: keep UI copy in English; the AI assistant accepts Roman Urdu input as specified in §41 but replies in the interface's own vocabulary.

---

## 10. Design QA — run at the end of every phase

- [ ] No raw hex anywhere in components; only semantic tokens
- [ ] Every ID, dose, vital, date and amount is mono + tabular
- [ ] Only two shadow levels used; no shadowed inputs
- [ ] No radius above 8px
- [ ] Spacing values are from the scale only
- [ ] Every interactive element has a visible focus ring
- [ ] Body text contrast ≥ 4.5:1, labels/meta ≥ 4.5:1 against their background
- [ ] Every list has loading, empty and error states
- [ ] Every save disables on submit
- [ ] Allergy appears on rail, prescription screen, and printed prescription
- [ ] Print layouts render correctly at A5/A4 with no clipping
- [ ] `prefers-reduced-motion` disables all animation
- [ ] Screen works at 1024 and stacks correctly at 768

---

## 11. Paste-ready prompt block

Append this to the end of your master prompt, above `START NOW`:

> **DESIGN AUTHORITY**
>
> `/docs/design-system.md` in this repository is the single authority for all visual and interaction design. Read it in full before writing any component, and re-read §10 at the end of every phase.
>
> Build the token layer and the shared primitives *before* any feature screen. In Phase 1, create: `globals.css` with the token block exactly as specified; `Button`, `Input`, `Select`, `SearchSelect`, `ChipGrid`, `Card`, `DataTable`, `StatusPill`, `Modal`, `Toast`, `Tabs`, `Accordion`, `PatientRail`, `EmptyState`, `ErrorState`, `Skeleton`. Every later screen composes these. No feature screen may define its own button, input, table or pill.
>
> Rules that are not negotiable and not subject to your judgement: semantic tokens only, never raw hex; clinical data always in `font-mono tnum`; exactly two shadow levels; radius never above 8px; spacing only from the scale; motion only from §8; copy only per §9.
>
> Where §64 of this prompt tells you to make your own call on unspecified decisions, that still applies — but a decision that contradicts the design system is not an unspecified decision. If the design system and a feature requirement genuinely conflict, implement the feature requirement and note the conflict in `/docs/design-decisions.md` rather than silently diverging.
>
> Take one screenshot per completed screen, compare it against §10, and fix what fails before moving to the next phase.

---

## A note on "one prompt"

The design can be specified in one prompt — that's this file. The *build* can't be, and no honest tool will tell you otherwise: your own document lists 18 phases, ~30 tables, and 34 acceptance tests. That is weeks of agent-driven work with your review between phases.

The realistic path: open the repo in Claude Code, commit this file and your master prompt to `/docs/`, and run the phases one at a time, testing each before approving the next. Phases 1 and 2 (tokens + primitives, then the authoritative schema and RLS) are where quality is decided — spend your review attention there, because everything after is composition.
