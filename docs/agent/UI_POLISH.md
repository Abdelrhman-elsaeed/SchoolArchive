# UI_POLISH.md — Targeted UI polish pass (Phase 7.10)

This document records the small, focused UI cleanup applied on top of
Phase 7.9. The 7.9 overhaul shipped the right tokens and structure
but left a few micro-issues that the team flagged on screenshots —
most notably a `⌘ K` hint badge in the search field, a redundant
"كل عملية رفع مرتبطة بهوية المدرسة فقط." line, a misaligned
year filter, and a sidebar brand block that read as too small.
This pass removes the noise and rebalances the affected surfaces.
No token changes. No new patterns. No new components.

---

## 1. Exact files changed

| File | Why |
|:---|:---|
| `src/ui/App.tsx` | Removed the `⌘ K` hint badge; rebalanced the sidebar brand block (88 px row, 40 px mark, 17 px title, 10.5 px kufi subtitle, larger gap). |
| `src/ui/components/Select.tsx` | Added `forceLtr` prop, fixed `pe-9` padding, centered the visible text. |
| `src/ui/pages/BrowsePage.tsx` | Widened year/month selects to `w-40` and forced LTR on the year select. |
| `src/ui/pages/UploadPage.tsx` | Removed the redundant third item in the Privacy & Security card; trimmed the page description; fixed the empty `0 من 0` stat; forced LTR direction on all numeric badges (workflow steps, results index, file-list count). |
| `src/ui/pages/SubscriptionBlockedPage.tsx` | Forced LTR on the numbered steps for visual consistency. |
| `docs/agent/UI_POLISH.md` | This document. |
| `docs/agent/PROGRESS.md` | Phase 7.10 entry. |

## 2. Texts / elements removed

| Location | Text | Why it was removed |
|:---|:---|:---|
| Top-bar search (`App.tsx`) | The `⌘ K` keyboard-shortcut hint badge | Internal-only hint. Not actionable for end users. The keyboard shortcut itself is not wired. |
| Upload Privacy & Security card (`UploadPage.tsx`) | "كل عملية رفع مرتبطة بهوية المدرسة فقط." | Redundant — the file-upload workflow is implicitly per-tenant; the first two items (TLS, at-rest encryption) carry the meaningful security message. |
| Upload page description | The trailing clause "بالاعتماد على نموذج الذكاء الاصطناعي." | The "تصنيف ذكي" workflow step in the sidebar already covers this. |
| Empty-state `PageStat` "صالحة للأرشفة" | The literal `0 من 0` | Replaced with `—` when no files are picked, so the stat doesn't read as broken. |

## 3. Spacing / alignment fixes

| Region | Before | After |
|:---|:---|:---|
| Top-bar search field | `h-10` with a 24 px hint chip on the right (`pe-3`) | `h-10` with a clean `pe-3` and a `pe-1` on the input, no right-side chip. The icon and the input are flush; the field is visually lighter. |
| Archive filter row — Year / Month select | `w-36` (144 px), text-align left/right inherited, no LTR override. With a 4-digit value (e.g. `2026`), the text floated off-center. | `w-40` (160 px) for both Year and Month. Year select is `forceLtr`, so the value always reads left-to-right. The visible text is now `text-center` between the leading icon and the trailing chevron. |
| Privacy & Security card after copy removal | Two list items left in a 3-item rhythm. | Two list items left in a 2-item rhythm — no awkward gap, the card just reads as a shorter, more confident list. |
| Empty stat values | Literal `0` / `0 من 0`. | `0` and `—` so the strip never reads as broken or as "0 of 0 results". |

## 4. Branding adjustments (sidebar)

| Dimension | Before | After |
|:---|:---|:---|
| Row height | `h-[76px]` | `h-[88px]` — taller row, more breathing room. |
| Mark | `<BrandMark size="md" />` (36 px) | `<BrandMark size="lg" />` (40 px) — bigger anchor for the brand. |
| Gap between mark and text | `gap-3` (12 px) | `gap-3.5` (14 px) — slightly more space. |
| Arabic title | `text-[15px] / font-bold / leading-tight` | `text-[17px] / font-bold / leading-tight` — larger and more confident. |
| English subtitle | `text-[10px] / tracking-[0.22em]` (with `·` separator) | `text-[10.5px] / tracking-[0.24em]` with cleaner casing (`Arabic · Archive`, no decorative middle dot). |
| Title/subtitle stack | `flex-col leading-tight` | `flex-col gap-0.5` — explicit, controlled gap. |
| Subtitle color | `text-tan-200` (full opacity) | `text-tan-200/85` — slightly softer, supports the title as the primary mark. |

The result: the brand block is now a real top-of-shell anchor, not
a tiny mark buried in a 76 px band.

## 5. Other small refinements

- Forced LTR direction on all numeric badges (`<span dir="ltr">`) so
  step numbers, file-list counts, and result indices always read
  left-to-right regardless of the surrounding RTL context.
- Centered the visible text inside the year/month `<select>` so the
  value sits between the leading icon and the trailing chevron.
- The `Lift` motion is preserved; no animation changes.

## 6. Before / after summary

| Aspect | Before | After |
|:---|:---|:---|
| Top-bar search | Hint chip visible on the right. | Clean input, no decorative chip. |
| Filter row — Year / Month | Year select too narrow, value off-center. | 160 px wide, value centered, numeric value reads LTR. |
| Upload Privacy card | 3 items, third one redundant. | 2 items, intentional rhythm. |
| Sidebar brand block | 36 px mark, 15 px title, 76 px row. | 40 px mark, 17 px title, 88 px row, cleaner kufi subtitle. |
| Upload page description | "…بالاعتماد على نموذج الذكاء الاصطناعي." | Trimmed to the essential action. |
| Empty `PageStat` values | `0 من 0`. | `—`. |
| Numeric badges | Inherited RTL rendering. | Forced LTR, consistent digit direction. |

## 7. Verification

- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- `npm run test` — 28/28 frontend tests still pass; no test was modified.
- `npx vite build` — clean production build (37.19 kB CSS / 7.45 kB gzipped; 482.38 kB JS / 132.46 kB gzipped).
- `npx vite preview` + `curl http://127.0.0.1:4174/` — HTTP 200.
