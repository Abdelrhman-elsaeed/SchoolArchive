# UI_OVERHAUL.md — Production-grade UI overhaul (Phase 7.9)

This document records the **systemic** UI overhaul applied on top of
the Phase 7.8 redesign. The 7.8 pass was technically correct but
read as a thin prototype: the screenshots showed washed-out surfaces,
disabled-looking controls, empty whitespace, an unstructured upload
page, and cards with no internal hierarchy. 7.9 is a proper product
rework — same brand DNA, but with depth, structure, and authority.

---

## 1. UI audit (the real problems)

| # | Symptom (in the 7.8 screenshots) | Why it read as broken | Fix |
|:--|:--|:--|:--|
| 1 | Sidebar (cream-on-cream) merges with the main canvas. | The sidebar used the same warm surface as the body, so there was no chrome — only a thin rule. | Sidebar is now solid **Date Palm Green** (`#0E5A46`) with a tan rule for the active item. It now reads as a real shell. |
| 2 | Filter inputs, segmented toggle, and "every year" select look disabled. | `bg-cream-soft` is too close to the page background, and the resting border (`#E1D6BC`) is too pale. | Inputs are `bg-paper` with `border-border` (`#D9C9A5`) and a `border-border-strong` hover. Focus is `border-palm` + 3 px ring. |
| 3 | Cards (e.g. `تحليل درجات اختيار الفترة الأولى`) have a flat, plain border and the title reads at the same weight as the body. | Border is 1 px warm-tan. Title is `font-bold` of the same size as the meta. | Card has a 1 px `border-border` + 3-tier shadow + a 1 px palm-tan-tan-400 top rail. Title is `font-display 15 px / 700 ink-strong`; meta is `12 px / 500 ink-muted`. |
| 4 | Tag chips on the card (`#تقويم`, `#درجات`, `+1`) are the same muted ink as the metadata. | They use the same fill and same text color as everything else. | New `Tag` primitive: outlined `neutral` chips for tags, solid `tan` for AI, solid `ink` for year, solid `maroon` for "review". Each tone has a real border and an explicit semantic. |
| 5 | Card metadata ("15.9 كيلوبايت", "5 م", "#درجات", "ب 5 م") floats in space with no rhythm. | All four pieces share the same row, same weight, no divider. | A real **meta strip** is now a 40 px footer of its own with a top border, three labeled slots (calendar / hard drive / tag), and ink-muted on cream-soft. |
| 6 | Upload page is a single dashed box on a vast empty canvas. | The dropzone is the only thing on the page, the CTA is missing, and the supporting information is in tiny type. | 12-column grid: 8 cols workflow + 4 cols sidebar. The dropzone is a **real hero** (palm icon tile, dotted texture, top rail, 4-pill type list). Sidebar has 3 cards: workflow steps, privacy, help. |
| 7 | Page header is one line and a paragraph. | No kicker, no display moment, no actions. | New `PageHeader`: kufi kicker with tan rule + display-grade title + description + palm-tan rule + actions slot + a strip of `PageStat` cards. |
| 8 | Segmented toggle ("القائمة / الشبكة المعرفية") looks like a chip group, not a real control. | Same `bg-cream-soft` fill on the active and inactive states. | Active option now paints `bg-paper` with `border-border` + `shadow-xs` and `ink-strong` text. Inactive options are `text-ink-muted` on `cream-soft`. |
| 9 | Buttons (e.g. "مسح الفلاتر" inside the filter bar) read as disabled text. | `text-ink-muted` with no fill. | New `Button` primitive with 7 variants and 3 sizes. The default is solid palm, 1 px palm-600 border, palm-tinted shadow on hover, and an active scale 0.985. |
| 10 | Top bar is a single cream-soft band with a search input and a notification dot. | No breadcrumb, no kicker, no real action set. | Top bar is two rows: row 1 = sidebar toggle + title + kufi kicker pill + search + bell + tenant badge with chevron; row 2 = a tan gradient hairline divider. |
| 11 | "ARABIC · ARCHIVE" mark sits as decorative ASCII under the Arabic title and adds no value. | Same color as the body text. | The mark now lives in **kufi** with 0.22 em tracking and tan-200 color, against the palm sidebar — it reads as a typographic mark, not as a label. |
| 12 | "هوية المدرسة الحالية: 11111111-1111-1111-…" sits in plain muted text under the dropzone. | Muted text on muted text. | Now wrapped in a small palm-50 "shield + monospace" block with an explicit divider before the primary CTA. |
| 13 | Empty state is a single "Inbox" icon and a single line. | No structure, no rhythm. | `EmptyState` is now a `asa-card` with a tan halo, a nested palm-50 icon tile, a `display-sm` title, and an optional CTA. |
| 14 | Subscriptions blocked page has a `bg-gradient-to-l from-danger-50` hero with a gradient icon. | Generic SaaS template. | A 1 px status rail at the top of a `asa-card` (`tan` for grace, `maroon` for the rest), a real display-grade title, and a 2-column body with explanation + steps. |

## 2. The new token system (rebuilt)

| Concern | Before | After |
|:--|:--|:--|
| Canvas | `#F8FAFC` slate | `#F4ECDB` Hijazi Cream (deeper) |
| Surface | `#FFFDF8` warm white | `#FFFBF1` paper + `#F1E8D2` muted + `#E7DBBF` sunken — **explicit step** |
| Border | `#E2E8F0` slate / `#E1D6BC` warm-tan | `#D9C9A5` (default, visible) · `#E4D6B5` (soft) · `#BFA776` (strong) · `#A98A52` (deep, rare) |
| Ink | `#0F2236` → `#0B2236` | `#0F2236` strong · `#08172A` stronger · `#3F5468` muted · `#7A7363` soft — **4-step scale** |
| Sidebar | cream-on-cream | Solid Date Palm Green `#0E5A46` with `#073527` border |
| Top bar | cream-soft, no anchor | Cream-soft + 1 px tan gradient hairline divider + kufi kicker pill |
| Page header | one h1 | `kicker` (kufi, tan rule) + display title (2–2.5 rem, 700, ink-strong) + description + palm-tan rule + actions + stat strip |
| Type sizes | mixed `text-2xl` / `text-3xl` | New editorial scale: `display-2xl/xl/lg/md/sm`, `title`, `body`, `small`, `caption`, `kicker` |
| Radii | `rounded-2xl` everywhere | `xs/sm/md/lg/xl/2xl/3xl` — default control is `md` (8 px), cards are `lg` (12 px) |
| Shadows | 4 stock shadows | `xs / card / lift / pop / focus / tan / palm / inset / rail-l / rail-r` — explicit semantic names |
| Motion | `transition-all duration-300` | Single easing `cubic-bezier(0.22, 1, 0.36, 1)`, durations `180 / 220 / 260 / 320 ms` |
| Container | 1200 px max | 1240 px max, content column 720 px / wide 1320 px |

## 3. Component decisions

### 3.1 App shell

- **Sidebar**: solid Date Palm Green (depth). Tan left-rule on the active item (3 px, full-height). Brand-mark mark in the top-left, Arabic title + kufi mark beside it. A small palm-700 "secure storage" card sits below the nav. The collapse button is a kufi-tracked label, not just an icon.
- **Top bar**: two rows. Row 1 carries the sidebar toggle, a real breadcrumb (kufi 11 px, ink-soft), a real display title (16–17 px, 700, ink-strong), a kufi kicker pill (tan-200 on tan-50), a real search field with a `⌘ K` hint chip, a bell with a maroon dot, and a tenant badge that uses a chevron to advertise its dropdown. Row 2 is a tan gradient hairline — quiet, architectural.
- **Footer**: cream-soft, hairline border, kufi copyright + dev panel.

### 3.2 `PageHeader` (new)

- Kicker: kufi, 10 px, 0.22 em tracking, tan-600, with a 24 × 1 px tan rule.
- Title: display-grade, 32–40 px, 700, ink-strong, leading 1.1.
- Description: 15 px / 1.55 / ink-muted, max-w 2xl.
- Rule: 16 × 1 px palm-tan gradient.
- Actions: right-side row, flex-wrap.
- Stats: 1–4 `PageStat` cards under the header (palm / tan / ink tones).

### 3.3 `PageStat` (new)

- A small KPI card with a 36 × 36 icon tile, a kufi label, and a `display-md` value. Used as the page's "scoreboard" so the user always sees the data that matters.

### 3.4 `Button` (rebuilt, 7 variants × 3 sizes)

- `primary` = solid palm + palm-600 border + palm-tinted shadow on hover.
- `secondary` = paper + visible border + cream-soft hover.
- `ghost` = transparent + cream-soft hover (for tertiary actions).
- `tan` = solid tan + tan-400 border (for tonal emphasis).
- `ink` = solid ink (for "show details" CTAs on hero panels).
- `danger` = solid maroon.
- `link` = text-only palm link with tan underline decoration.
- Active scale 0.985, focus ring 3 px palm, transition 180 ms.

### 3.5 `Tag` (rebuilt, 7 tones)

- 4 solid tones (palm / tan / ink / maroon) for the dominant semantic events.
- 1 outlined "neutral" tone for soft labels.
- 1 "oud" for warm-brown support.
- Sizes `sm` (24 px) and `md` (28 px).

### 3.6 `Input` (new) + `Select` (new)

- Both wrap the native element so ARIA / form behavior is preserved.
- Resting: `bg-paper`, `border-border`, ink-soft placeholder.
- Hover: `border-border-strong`.
- Focus: `border-palm` + 3 px palm ring + `bg-paper`.
- Error: `border-maroon` + maroon ring.
- The `Select` has a chevron baked into the wrapper, not a stock `appearance-none` hack.

### 3.7 `SegmentedToggle` (new, replaces the brittle slider)

- 1 × container with `bg-cream-soft`, 1 px border, 4 px padding.
- Each option is a real `<button role="tab">`. The active option paints `bg-paper` with `border-border` and a 1 px lift shadow. Inactive options are transparent with `text-ink-muted` until hover.

### 3.8 `DocumentCard` (rebuilt, structured)

- **Top rail**: 1 px palm-tan-tan-400 gradient (architectural mark).
- **Header**: 48 × 48 file-kind tile (color-coded: PDF maroon, Word navy, XLS palm, IMG oud) + 4 status pills (type, AI, review, year).
- **Title block**: `display-sm 15 px / 700 / ink-strong` + original-name in ltr-mono ink-soft.
- **Tag row**: 3 visible `#وسم` chips, then a `+N` kufi overflow indicator.
- **Meta strip**: 40 px footer, divided top-border, 3 labeled slots — calendar (date), hard-drive (size), tag (category, clickable). Active row is `cream-soft/50`.
- **Hover**: `-translate-y-0.5` lift, palm-200 border, lift shadow, chevron reveal, extension label reveal in the bottom-right.

### 3.9 `UploadPage` (rebuilt as a real workflow)

- **PageHeader** with a 3-card stat strip (files-ready / total size / valid count).
- **Two-column layout**: 8 cols workflow + 4 cols sidebar.
- **Dropzone (hero)**:
  - 2 px dashed border that goes `border-strong` → `border-palm` on drag.
  - Dotted `saudi-pattern` texture at 40 % opacity.
  - 1 px palm-tan-tan-400 top rail.
  - A radial palm-50 vignette on drag.
  - 64 × 64 palm icon tile with palm-tinted shadow + 1.05 scale on drag.
  - 18–20 px bold title + 14 px muted description.
  - 5 ALLOWED_EXTS pills, `outline` tone.
- **File list card**: 4 px thick "N files" header (palm-50 on the avatar), `allowed · rejected` summary line, file rows with file-kind tile + size + remove button. Footer with school-id line + a large `lg` primary CTA.
- **Results panel**: kicker + `display-md` title with a results summary line, 4 solid summary pills (palm / tan / ink / maroon), per-file result rows with file-kind tile + status badge, and a footer with two actions ("رفع ملفات أخرى" ghost / "عرض الأرشيف" primary).
- **Sidebar (workflow)**: 3 cards —
  1. "خطوات العملية" (4 numbered palm-50 steps).
  2. "الخصوصية والأمان" (3 check-list items in palm).
  3. "المساعدة" with a palm-toned link to the archive.

### 3.10 `BrowsePage` (rebuilt)

- `PageHeader` with a 3-card `PageStat` strip (total / current year / active category) and a real actions slot (segmented toggle + "رفع جديد" primary button).
- Real filter bar: 1 col search + 4 col right cluster (category input + year select + month select + reset).
- A "الفلاتر النشطة" footer row that lists active filter chips with semantic tones (palm / tan / ink) plus a "نتائج محدّثة" or "جاري التحديث" status badge.
- `EmptyState` for the no-results case with a "مسح كل الفلاتر" CTA.
- The same 4-col card grid (now using the new `DocumentCard`).

### 3.11 `DocumentDetailsPage` (rebuilt)

- Back-link above the header (real hit target, kufi-muted).
- `PageHeader` with the document title as the display title, a rich description (category · upload date · original name), and three actions (مشاركة / طباعة / تنزيل المستند).
- 12-col grid: 8 cols main + 4 cols sidebar.
- **Hero card**: 1 px palm-tan-tan-400 top rail + 64 × 64 file-kind tile + 4 status pills + display-grade sub-title + tag row.
- **AI summary card**: 3 px vertical palm-tan rail on the end + tan-50 quote tile + asa-eyebrow + body.
- **Review notice**: maroon-50 panel (when needs review).
- **Details table**: card with a cream-soft header (eyebrow + title + "قراءة فقط" pill), then 9 `DetailRow`s with palm-50 icon tiles and kufi-tracked labels.
- **Sidebar**: confidence meter card (display-3xl value + 1.5 px progress bar + advisory text) · 5-row quick-info table with a soft divider · privacy card.

### 3.12 `SubscriptionBlockedPage` (rebuilt)

- `PageHeader` with a 3-card stat strip and a kicker pill.
- A single `asa-card` with a 1 px status rail (`tan` for grace, `maroon` for the rest), a 64 × 64 reason icon tile, a 22–26 px display title, and a 2-column body (explanation + steps).
- The two body cards are `asa-card-soft`, not `bg-slate-50 / border-blue-500`.
- Primary action "إعادة المحاولة" with a `RefreshCw` icon.

### 3.13 `DevSettingsPanel` (rebuilt)

- `Button` for the trigger (no more naked `<button>`).
- `Alert` for the warning.
- `Tag` for the 4 status presets (palm / tan / maroon).
- `Input` for the UUIDs (ltr + monospace).

### 3.14 `GraphErrorBoundary` (rebuilt)

- New `asa-card` styling, maroon-50 icon tile, `display-sm` title, 14 px muted description, solid-palm retry button.

### 3.15 Graph palette

- File-kind → brand tones (maroon / navy / palm / oud) so the graph reads as part of the same product.
- Category hub → Date Palm Green gradient.
- Edges → Ink Navy (category) / Tan (tag).
- Background → `#FFFBF1` (paper).

## 4. Layout improvements

- **Sidebar** now reads as a real shell because it is a different color from the canvas.
- **Top bar** is taller (76 px) and split into two visual rows: a content row and a 1 px tan hairline. The breadcrumb + kicker pill + display title give the page a real entry point.
- **Main column** is capped at 1240 px on `max-w` so screens wider than 1440 px do not get an unreadable line length.
- **Page rhythm** is now `gap-7` between sections, with `PageHeader` providing a real 24 px rule that grounds every page.
- **Upload workflow** uses a 12-col grid (8 / 4) so the dropzone has a workflow sidebar with steps, privacy, and help — no more empty space below.
- **Card grids** are now `xl:grid-cols-4` for the archive; the larger card has space for the new internal structure.

## 5. Motion / polish improvements

- One easing, three durations.
- All hover transitions: 180 ms.
- Card hover: 220 ms `-translate-y-0.5` + `shadow-lift` swap.
- Page transitions: `animate-fade-in` 280 ms.
- Skeleton: 1.8 s `shimmer`.
- No `transition-all`; each component declares exactly which properties animate.
- Active scale: 0.985 (consistent across every interactive).
- Focus: 3 px palm ring on every control (no neon, no orange).
- Press feedback: 0.985 + a soft `shadow-palm` lift on primary buttons.

## 6. Files changed

| File | Why |
|:--|:--|
| `tailwind.config.js` | New token scale, new radii, new shadows, new motion, new backgrounds. |
| `src/ui/styles/global.css` | Runtime mirror of tokens; new focus / scrollbar / divider rules; cream body wash. |
| `src/ui/components/Button.tsx` | Rebuilt: 7 variants × 3 sizes, solid fills, palm-tinted focus. |
| `src/ui/components/Tag.tsx` | Rebuilt: 7 tones, real borders, `outline` variant. |
| `src/ui/components/Input.tsx` (new) | Wrapped input with a real focus state, leading/trailing icon, sizes. |
| `src/ui/components/Select.tsx` (new) | Wrapped select with chevron + real focus state. |
| `src/ui/components/SegmentedToggle.tsx` (new) | Replaces the brittle slider with a real segmented control. |
| `src/ui/components/PageHeader.tsx` (new) | Reusable page header: kicker, display title, rule, actions, stats. |
| `src/ui/components/DocumentCard.tsx` (new) | Replaces the inline card in `BrowsePage`. Structured: rail, header, title, tags, meta strip, hover state. |
| `src/ui/components/Skeleton.tsx` | Updated to the new shimmer. |
| `src/ui/components/SectionHeading.tsx` | Updated. |
| `src/ui/components/Alert.tsx` | Real status backgrounds, maroon/palm/tan/navy tokens. |
| `src/ui/components/EmptyState.tsx` | `asa-card` with tan halo. |
| `src/ui/components/Loading.tsx` | No more `Loader2`. |
| `src/ui/components/Pagination.tsx` | Border-top, secondary buttons. |
| `src/ui/components/StatusBadge.tsx` | Brand status tones, ink-strong text. |
| `src/ui/components/DevSettingsPanel.tsx` | Uses `Button`, `Alert`, `Tag`, `Input`. |
| `src/ui/components/GraphErrorBoundary.tsx` | Uses the new card system. |
| `src/ui/components/graph/styles.ts` | Palette re-keyed to the new system. |
| `src/ui/App.tsx` | Deep palm sidebar, structured top bar, max-w 1240 px, breadcrumb / kicker, real search. |
| `src/ui/pages/BrowsePage.tsx` | `PageHeader` + stat strip + new filter bar + new `DocumentCard`. |
| `src/ui/pages/UploadPage.tsx` | 12-col grid: dropzone hero + file list + results + workflow sidebar. |
| `src/ui/pages/DocumentDetailsPage.tsx` | Strong hero, 12-col grid, polished sidebar. |
| `src/ui/pages/SubscriptionBlockedPage.tsx` | Calm but authoritative card. |
| `docs/agent/PROGRESS.md` | New Phase 7.9 section. |

## 7. Acceptance criteria

| Criterion | How it's met |
|:--|:--|
| UI feels intentional and premium | Single token system; every control has a real rest / hover / active / focus / error state. |
| Pages no longer look empty or washed out | Upload page now has a 12-col layout with a workflow sidebar; browse has a `PageHeader` + 3-card stat strip. |
| Hierarchy is clear immediately | Display title is 2.5 rem 700 ink-strong; meta is 13.5 px 500 ink-muted; muted is 12 px 400 ink-soft — four steps, no overlap. |
| Controls look active and product-grade | `Input` and `Select` have visible borders, focus rings, and real padding; the segmented toggle is a real control. |
| Archive cards feel structured and strong | `DocumentCard` has a top rail, header, title, tag row, and meta strip — five structural regions. |
| Upload page feels like a real core workflow | 8 / 4 split with hero dropzone, file list with strong active states, results panel with summary pills, and a workflow sidebar. |
| Looks like a mature application | `tsc` clean · 28/28 tests pass · `vite build` clean · bundle 132 kB gz JS / 7.4 kB gz CSS. |

## 8. Open follow-ups

- Dark mode is intentionally not designed.
- A "schools" / multi-tenant switcher in the top bar is a natural next step.
- A dashboard page (using `display-2xl` + the stat strip) is the natural home for the next iteration.
