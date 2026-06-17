# UI_REDESIGN.md — Visual Rationale & Before/After

This document records the visual decisions behind Phase 7.8 (the premium
Saudi/Arabic UI redesign) and the rationale for each major change. It is
intended as a reference for the next design iteration, the client
presentation, and the QA team.

---

## 1. Direction in one sentence

A warm, materially-rooted Saudi product. Calm surfaces, deep palm and
ink-navy accents, tan and maroon used sparingly. Editorial composition.
No glassmorphism, no neon, no SaaS gradients.

## 2. What was wrong with the previous design

| Symptom | Why it felt generic | Fix |
|:---|:---|:---|
| `bg-white/95 backdrop-blur-xl` on the sidebar | Glassmorphism = SaaS template tell. | Warm surface (`#FFFDF8`), 1px warm border, fixed background wash. |
| Slate-50 page background (`#F8FAFC`) | Cool, office-tool tone. | Hijazi Cream (`#F6F1E7`) with a fixed sand-grain wash. |
| `bg-rose/blue/emerald/violet` file-type tints | Stock dashboard palette. | Re-keyed: PDF → maroon, DOCX → navy, XLSX → palm, IMG → oud. |
| `bg-gradient-to-l from-brand-600 to-brand-700` on every primary button | Loud, ad-tech. | Solid palm primary, hairline border, 1-layer shadow. |
| `shadow-glow` halo on hero icons | "AI app" aesthetic. | Removed. |
| `Loader2` spinner | "Cheap spinner" banned by the brief. | Brand-tinted `Skeleton` / `SkeletonText` only. |
| Translating `translate-x-[-96%]` segmented control | Brittle RTL hack. | Real segmented control: each option is a button, the active one is the surface. |
| Generic `Building2` icon as brand mark | No identity. | `BrandMark` — abstract palm-tile monogram, no literal heritage symbol. |
| `bg-blue-50 border-r-4 border-blue-500` on the AI summary card | Default Tailwind UI. | Vertical palm-tan side rule, 3px, no border-r-4. |
| Cairo + Tajawal fonts | Decent but heavy. | IBM Plex Sans Arabic (body) + Noto Kufi Arabic (kufi labels) + Saudi display option. |

## 3. The new token system

### 3.1 Color (mirrored in CSS variables on `:root`)

| Token | Value | Role |
|:---|:---|:---|
| `--asa-cream` | `#F6F1E7` | Page background (Hijazi Cream). |
| `--asa-surface` | `#FFFDF8` | Card / surface. |
| `--asa-surface-muted` | `#EFE7D6` | Muted surface (filter inputs). |
| `--asa-surface-sunken` | `#E8DCC2` | Inset wells (sunken panels, status warnings). |
| `--asa-stone` | `#DCC8A6` | Stone Beige — sparingly. |
| `--asa-border` / `--asa-border-soft` / `--asa-border-strong` | warm tans | 3-step border scale. |
| `--asa-ink` | `#11314A` | Default text, graph, icon (Ink Navy). |
| `--asa-ink-strong` | `#0B2236` | Headings, deep emphasis. |
| `--asa-ink-muted` | `#5A6878` | Body text. |
| `--asa-ink-soft` | `#8A847B` | Captions, meta, soft borders. |
| `--asa-palm` | `#0E5A46` | Date Palm Green — primary brand. |
| `--asa-tan` | `#C8A46A` | Diriyah Tan — accent. |
| `--asa-oud` | `#5C4532` | Oud Brown — supporting tone. |
| `--asa-maroon` | `#7A2E2E` | Sadu Maroon — rare (destructive / formal). |
| `--asa-warm` | `#8A847B` | Warm Gray. |

Usage rule of thumb: 70% warm neutrals, 20% deep green/navy, 10%
tan/maroon accents. The status semantics are now rooted in the same
system — `success` = palm, `warning` = tan, `danger` = maroon,
`info` = ink.

### 3.2 Typography

- **Display**: "Saudi" (with "Al-Awwal" + IBM Plex Sans Arabic fallbacks). Used for H1 / H2.
- **Body**: IBM Plex Sans Arabic, 16/400, leading-relaxed. Used everywhere a user reads.
- **Kufi**: Noto Kufi Arabic for `.asa-eyebrow` and `.asa-section-label` (10–12 px, 0.18–0.22 em tracking, uppercase). It carries the small "architectural label" rhythm.
- **Mono**: IBM Plex Mono for LTR IDs / hashes; `ltr-mono` utility forces LTR + `tnum` + `break-all`.

Editorial sizes:

| Token | Size | Use |
|:---|:---|:---|
| `display-xl` | 3.5 rem / 700 | Marketing hero (future use). |
| `display-lg` | 2.75 rem / 700 | Section hero. |
| `display-md` | 2.25 rem / 700 | Page H1. |
| `display-sm` | 1.75 rem / 700 | Card H1. |
| `section` | 0.75 rem / 600 | `.asa-section-label`. |
| `eyebrow` | 0.6875 rem / 600 | `.asa-eyebrow`. |

### 3.3 Radius & shadow

- Restrained radii: `4 / 6 / 8 / 12 / 16`. Default control is `md` (6 px) — never `2xl` blanket.
- Shadows are warm-tinted and low-spread. `flat` is a single 1 px hairline. `card` adds a 1 px hairline + 2 px drop. `elevated` is reserved for true elevation. No `shadow-glow`, no neon halos.

### 3.4 Motion

A single easing, three durations:

| Token | Easing | Duration | Use |
|:---|:---|:---|:---|
| `ease-out-expo` | `cubic-bezier(0.22, 1, 0.36, 1)` | 180 ms | Hover, color/border transitions. |
| `ease-out-expo` | `cubic-bezier(0.22, 1, 0.36, 1)` | 220 ms | Card, button, control transitions. |
| `ease-out-expo` | `cubic-bezier(0.22, 1, 0.36, 1)` | 320 ms | Page / section / sidebar width. |

- All hover transitions: 180–220 ms.
- All page / sidebar / section transitions: 320 ms.
- No `transition-all`. Each component declares exactly which properties it animates.
- Active scale on press: 0.985 (subtle, not 0.95).
- Focus ring: 2 px cream outer + 4 px palm outer — calm, accessible.

### 3.5 Patterns & backgrounds

- **Sand-grain wash** (fixed on `body`): two soft radial gradients (tan + palm) anchored to the top-right and bottom-left of the viewport. Reads as ambient warmth, not decoration.
- **Saudi pattern** (utility): a 1 px dot grid at 24 × 24 px with `rgba(17,49,74,0.05)`. Available for future empty-state backgrounds. Low contrast by design.
- **Skeleton**: brand-tinted `linear-gradient` + 1.8 s `shimmer` keyframe.
- **Dividers**: `.asa-divider` (warm tan) and `.asa-divider-ink` (cool ink). Use instead of stock `border-t border-slate-200`.

## 4. Component decisions

### 4.1 Sidebar (right-hand, fixed)

**Before**: white glass, 1 px slate border, `Building2` icon tile, accent gradient + glow.
**After**: warm surface, 1 px warm border, `BrandMark` (palm tile with two open-book arcs and a tan baseline rule), 3 px palm left-rule for the active item, no glass, no glow.

The active item reads "palm-50 / palm-700 text". The kufi-tracked ASCII "ARABIC · ARCHIVE" sits below the Arabic title as a small typographic mark.

### 4.2 Top bar

**Before**: 64 px tall, glass-blur, `LayoutDashboard` icon beside the title.
**After**: 72 px tall, warm surface 90% alpha, no glass. Title is a calm display-size heading. A vertical hairline separator divides the title from a small kufi "ARABIC · ARCHIVE" mark. The search input is a warm muted field that animates to a palm border on focus. The notification bell uses a tan dot instead of a red badge.

### 4.3 View-mode toggle (Browse)

**Before**: a single rounded surface with a translating "selected" highlight that faked a slider; the math was hard-coded for LTR and broke under RTL.
**After**: a real segmented control. Each option is a button; the active one paints the surface and uses the ink text color. No transforms, no LTR math.

### 4.4 Document card

**Before**: 1 px slate border, white surface, `hover:shadow-elevated`, `hover:border-brand-gold/40`. The hover added a `bg-gradient-to-r from-brand-navy-700 via-brand-gold to-brand-gold-600` underline that was visually loud.
**After**: `asa-surface` (warm surface + warm border + warm low-spread shadow). Hover lifts the card `-translate-y-0.5`, switches the border to a palm-200, and elevates the shadow. The bottom gradient is removed; the card now reads as a quiet architectural object.

### 4.5 Filter bar

**Before**: stock `bg-surface-muted` inputs with `focus:bg-white focus:border-brand-gold`.
**After**: same surface tokens but every focus state now lands on `bg-surface` + `border-palm`. The button cluster uses the new `Button` primitive. The "is fetching" indicator is a brand-tinted skeleton dot, not a stock pulsing dot.

### 4.6 Upload dropzone

**Before**: `border-2 border-dashed border-border-strong`, an absolutely-positioned `bg-brand-400/20 blur-2xl` halo behind the icon tile, and a `from-brand-500 to-brand-700` gradient on the icon.
**After**: calm `border-2 border-dashed border-border` on `bg-surface-muted`, the halo is gone, the icon tile is a solid palm square. The four "type pills" (PDF, DOCX, XLSX, PNG/JPG) sit below the prompt as quiet Pill tokens. The primary button uses the new solid-palm `Button`.

### 4.7 Document details — hero card

**Before**: a `bg-gradient-to-br from-brand-500 to-brand-700` icon tile with a glow.
**After**: a palm-50 tile with the ink-navy file icon, a 1 px hairline rail at the top of the card with a palm → tan → tan-600 gradient (a quiet architectural mark), and a calm display-size title. The download button uses the `Button` primary. A palm-tinted alert is reserved for `localDev.downloadStreamEnabled`.

### 4.8 AI summary card

**Before**: `border-r-4 border-blue-500` on a slate-50 surface.
**After**: a 3 px vertical palm-to-tan gradient on the start side, a tan-50 tile behind the Quote icon, and a `font-display` heading. No blue. The right rail is the entire card's identity, not a stock 4 px border.

### 4.9 Detail row

**Before**: icon in a `bg-brand-50` square, label in `text-ink-muted`.
**After**: icon in a `bg-palm-50` square (deeper brand), label in kufi (Noto Kufi Arabic) with 0.18 em tracking. The "data row" rhythm is now consistent across all metadata.

### 4.10 Empty state

**Before**: `bg-white` card with a `bg-brand-50` icon square.
**After**: a warm `asa-surface` card with a tan halo behind the icon (two nested circles, no glow), an Oud Brown icon, a `font-display` title, and an optional CTA. Reads as a moment of editorial calm, not a void.

### 4.11 Skeleton / loading

**Before**: `Loader2 animate-spin` spinner.
**After**: a brand-tinted `Skeleton` (warm linear gradient + 1.8 s `shimmer` keyframe). A `Loading` component composes a small "card with avatar + 2 lines" shape, matching the cards it replaces.

### 4.12 Subscription blocked

**Before**: a `bg-gradient-to-l from-danger-50 via-rose-50 to-white` hero with a gradient icon tile, then a `from-danger-500 to-danger-700` icon.
**After**: a single calm `asa-surface` with a 1 px status rail at the top. `GracePeriod` uses tan; `Expired` / `Suspended` use maroon. The icon tile is a single-toned square (`tan-50` or `maroon-50`) with a 1 px ring. Steps are listed with `bg-palm-50` numbered circles, no gradient.

### 4.13 Knowledge graph

**Before**: file-kind colours were `rose / blue / emerald / violet` (stock SaaS).
**After**: `maroon / navy / palm / oud` (brand). Category hub fill is now `Date Palm Green` instead of cool navy. Category bond edges are `Ink Navy` (calm). Tag bridge edges are `Diriyah Tan`. Label font is now the Saudi / IBM Plex stack.

## 5. Acceptance criteria coverage

| Criterion | How it's met |
|:---|:---|
| Premium, production-grade | Single token system, warm surfaces, restrained radii, kufi tracking, brand-tinted skeletons. |
| Arabic / Saudi / modern | Hijazi Cream + Date Palm + Diriyah Tan + Ink Navy; IBM Plex Sans Arabic; Noto Kufi Arabic for small labels; Saudi as the display face. |
| Not generic AI / SaaS | No glassmorphism, no purple/blue neon, no gradient CTAs, no glow halos, no `Loader2` spinner. |
| Typography & spacing feel intentional | Three display sizes, a kufi eyebrow + section label system, consistent 6/12/16/20 px gap rhythm, 1 px hairlines. |
| Motion is tasteful | One easing, three durations, no `transition-all`, no bounce. |
| Production-ready | `tsc` clean, all 28 frontend tests pass, `vite build` clean, every value comes from a token, no inline hex codes outside the graph reducers. |

## 6. What did **not** change

- Backend code (C# / EF / controllers / DTOs / middleware) — untouched.
- API contracts — untouched.
- Routing (`#/upload`, `#/archives`, `#/archives/:id`, `#/blocked/...`) — untouched.
- `useArchives` / `useUploadBatch` / `ApiClient` hooks — untouched.
- 28 frontend tests — untouched, all green.
- i18n copy — untouched.

## 7. Open visual questions for the next phase

- **A "Schools" / multi-tenant switcher** in the top bar would benefit from the new `asa-surface` + palm primary button system, plus a small Tan dot for the active tenant.
- **A dashboard page** is the natural home for the `display-xl` size and the sand-grain wash. The design system is ready for it.
- **Dark mode** is intentionally not yet designed. The current warm system does not have a 1:1 dark counterpart; that is a separate design exercise.
- **Print stylesheet** for the document details page would be a small, valuable follow-up.
