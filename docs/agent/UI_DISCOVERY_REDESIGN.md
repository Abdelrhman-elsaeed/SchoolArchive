# UI_DISCOVERY_REDESIGN.md — Premium file-discovery experience (Phase 8.0)

This document records the product-level navigation and information
architecture upgrade applied on top of the 7.9 UI overhaul. The 7.9
pass was visually correct but treated the archive page as a single
view + a search box. 8.0 is a hybrid document-exploration experience:
a Smart Explorer as the default, with two premium secondary views
(Column Navigator + Local Graph) for the cases where they beat search.

The same dataset powers all three. No backend contract changed. No
route changed.

---

## 1. UX audit — the real problems in the previous archive

| # | Symptom (in the 7.9 archive page) | Why it hurt discovery | What the new system does |
|:--|:--|:--|:--|
| 1 | The filter inputs (category / year / month) were plain HTML fields. The user had to know *that* they could filter before they could browse. | Filter-as-text is invisible affordance. The archive "list" felt like a flat dump. | A **persistent metadata tree** sits in the left column with categories, years, file types, special cases, and tags — every node is a click that filters instantly. |
| 2 | The only "navigation" was the URL. There was no breadcrumb for the current context. | The user lost track of which filter set they were inside. | A **context bar** with the home anchor, every parent segment, and the active view label is always visible at the top of the workspace. |
| 3 | Filters were applied with a single "Reset" button. There was no way to remove one filter without clearing everything. | Adding a second filter meant losing the first if you miscounted. | **Filter pills** below the breadcrumb show every active filter as a tappable chip with an inline × button. One click removes one filter. |
| 4 | The "Graph" view was a peer of the list view at the top of the page. Choosing it removed every other affordance. | Graph is good for relationships and bad as a retrieval surface. People kept saying "I just want the file". | **Smart Explorer is the default**. Graph is now (a) accessible from the preview drawer as a *local* graph scoped to the selected document, and (b) still available as a legacy full-network view via the segmented control. |
| 5 | Opening a document always meant navigating to `/archives/{id}` and back. There was no in-place preview. | Two-click round trips for every "what is this file?" question. | A **preview drawer** slides in on the right. It shows title, type, summary, metadata, tags, confidence meter, related files, and quick actions (download / open / open local graph). Esc closes it. |
| 6 | There was no concept of a "view". The user had to rebuild the same filter set every time. | Filters were ephemeral. | **Saved views** (كل المستندات · الشهادات · التقارير · صور · ملفات 2026 · آخر المرفوع · يحتاج مراجعة · غير مصنف) are first-class pills directly under the breadcrumb. One click switches context. Custom views can be saved, renamed, and removed; they persist in `localStorage`. |
| 7 | The list was one mode (cards). For dense libraries, cards waste space. | Dense libraries need a list/compact mode for scanning. | The result area has a variant switcher (cards / list / compact) with the same item data. |
| 8 | The archive felt like a single-page form, not a workspace. | No structural anchor between the search inputs and the results. | A 3-column workspace: **left metadata tree · center results · right preview drawer**. Same data, three perspectives. |
| 9 | "Category click" was a tiny inline link inside each card. Easy to miss. | Click-affordance was sub-pixel. | Category buttons are now full-size buttons in both the metadata tree and the result row meta strip. |

---

## 2. The new information architecture

```
  ┌─ Top bar (existing) — title + breadcrumb + kufi kicker
  │
  ├─ BrowsePage shell
  │   ├─ Page header  — kufi kicker + display title + description + palm-tan rule
  │   ├─ View switcher (segmented) — الاستكشاف الذكي · الأعمدة · الشبكة
  │   │
  │   └─ Selected view
  │       │
  │       ├─ Smart Explorer (default)
  │       │   ├─ Command row
  │       │   │   ├─ ContextBar (home · parents · current view · active view chip)
  │       │   │   ├─ Search input · year · month selects
  │       │   │   ├─ SavedViewTabs (built-in + custom pills)
  │       │   │   └─ Active filter pills · clear-all · counter
  │       │   │
  │       │   ├─ Workspace
  │       │   │   ├─ Left: MetadataTree
  │       │   │   │   (categories · years · file types · special · tags)
  │       │   │   ├─ Center: Results
  │       │   │   │   (variant switcher · card/list/compact)
  │       │   │   └─ Right: PreviewDrawer (fixed-position, slides in)
  │       │   │
  │       │   └─ LocalGraphDrawer (fixed-position, slides in over preview)
  │       │
  │       ├─ Column Navigator (4-column metadata browse)
  │       │   └─ تصنيف → سنة → مستندات → معاينة
  │       │
  │       └─ Graph (legacy full-network view, still available)
```

The same `useArchiveContext()` hook powers the Smart Explorer and the
Column Navigator. The graph view falls back to its previous shape so
nothing regresses.

---

## 3. Why Smart Explorer is the default

The brief's priority order is explicit:

> 1) Smart Explorer View
> 2) Saved Views + Filter Pills + Breadcrumb
> 3) Preview Drawer
> 4) Column Navigator View
> 5) Local Graph / Relations Drawer

The reasoning is the same as the brief's:

- Search alone is not enough for a large document library. Most
  queries are exploratory ("what do we have for 2026?", "show me the
  certificates", "the categories I haven't looked at yet"), not
  key-lookup.
- Metadata navigation is faster than search when the user knows the
  shape of the library (year, type, category, tag) but not the
  specific filename.
- Graph is great for relationships but terrible for retrieval at
  scale. It must be a contextual tool, not a default surface.
- Column navigation is excellent for fast hierarchical browsing when
  the user knows exactly which classification they want to walk down.

Smart Explorer is the *combination* of search + metadata tree +
saved views + filter pills + preview drawer. It is the only view
that supports both retrieval ("I know the file name") and exploration
("let me browse by category") without forcing the user to switch
context. Putting it as the default is the correct product call.

---

## 4. How the metadata tree / pills / breadcrumb / preview drawer work together

The four pieces form a single, observable loop:

1. The **metadata tree** on the left is the *source of truth* for what
   the user can filter on. Each row shows a live count.
2. The **breadcrumb** at the top mirrors the tree state in plain
   language ("الأرشيف › الشهادات › 2026") with every parent
   clickable. The active view is shown as a current segment.
3. **Filter pills** below the breadcrumb show the same filter set as
   the breadcrumb but as removable chips. The pill list and the
   breadcrumb are kept in sync via `useArchiveContext()` — removing a
   pill removes the corresponding breadcrumb segment and vice versa.
4. The **preview drawer** opens when the user clicks a result. It
   shows: title, type pill, year pill, summary, full metadata table,
   tag chips, confidence meter, related files, and quick actions
   (download / open / open local graph).
5. From the preview, the user can **open the local graph**, which
   slides the drawer sideways and replaces the preview with a
   scoped network: the selected document, its category hub, its year
   hub, and up to 14 related documents (scored by same-category +
   same-year + shared tags). The local graph is small, fast, and
   useful — never a 200-node blob.
6. At any point the user can **save the current filter set** as a
   custom saved view (the "حفظ المشهد" pill at the right end of the
   saved-view row). Custom views persist in `localStorage` under
   `asa.savedViews.v1`.

The interaction loop is observable in both directions:

- Click a tree node → filters update → pills appear → breadcrumb
  updates → results re-fetch (debounced) → preview clears.
- Click a pill × → that single filter clears → tree deselects that
  node → breadcrumb shortens → results re-fetch.
- Switch a saved view → all filters snap to the view's snapshot →
  the breadcrumb's current segment becomes the view label.

---

## 5. How Column Navigator works

The Column Navigator is a 4-column browsing view. It is a metadata-
driven polish of the classic "column view" (think macOS Finder or
VS Code's breadcrumb drill-down):

- **Column 1 — التصنيف**: every category in the archive with a count.
- **Column 2 — السنة**: the years present inside the selected
  category. Empty until a category is chosen.
- **Column 3 — المستندات**: the documents inside (category × year).
  Empty until both are chosen.
- **Column 4 — المعاينة**: a compact preview of the selected
  document — title, pills, summary, metadata table, tags, confidence
  meter, and a primary CTA to open the full page.

The grouping follows the real archive metadata (category → year →
documents → preview). It is not a clone of Finder — there is no
folder/file metaphor. The transitions are `animate-fade-in` with a
40 ms stagger per column so the eye reads left-to-right without
feeling jumpy. Dimmed columns are used to express "this is blocked
on the previous choice" without removing the affordance.

The Column Navigator is not the default because it forces the user to
navigate top-down. It is the secondary view for the case "I want to
walk a single classification tree to a specific file without typing."

---

## 6. How Local Graph was scoped to stay useful and not noisy

The full-network graph view in 7.9 pulled every document in the
list slice and tried to fit them in WebGL. At 200 documents it was
readable; at 800 it became a hairball. The new policy:

- **Local Graph is the default graph surface.** It is shown in a
  side drawer scoped to the *currently selected document*.
- The seed node is the selected document. The drawer shows up to 14
  neighbors, scored by:
  - same category = 3
  - same year = 2
  - shared tag = 1
- Two compact hubs are always added: the category hub and the year
  hub. This gives the user visual anchors.
- The drawer renders a **stats strip** (documents / hubs / bridges)
  and a **tag chip strip** for the seed's tags so the user can click
  through to a tag-only filter.
- The full network view is still available via the segmented control
  (third option: "الشبكة"). It is no longer the default retrieval
  surface; it remains a tool for exploring the whole archive.

The result: graph is contextual. Opening it from the preview drawer
means "I already know which file I'm looking at — show me its
neighborhood." That is the right question for a graph, and it is the
question that justifies the WebGL cost.

---

## 7. Exact files added / changed

### New (this phase)

| File | Purpose |
|:--|:--|
| `src/api/facets.ts` | Pure dependency-free facet builder (`buildFacets`, `getMonthNameAr`, `fileTypeLabel`). The single source of truth for category / year / month / file-type / tag tallies. Unit-testable from `node --test`. |
| `src/api/hooks/useArchiveFacets.ts` | React-Query wrapper around `buildFacets`. Re-exports the pure helpers so existing import sites don't move. |
| `src/ui/archive/savedViews.ts` | Built-in saved views (الشهادات · التقارير · صور · ملفات 2026 · آخر المرفوع · يحتاج مراجعة · غير مصنف), `useSavedViews()` hook (custom views in `localStorage`), and `filtersEqual()`. |
| `src/ui/archive/useArchiveContext.ts` | The single source of truth for the archive workspace: `nameQuery`, `category`, `year`, `month`, `fileType`, `needsReview`, `unclassifiedOnly`, `layout`, `selectedDocumentId`, `graphOpenFor`. Provides setters, `clearAll`, `removeFilter`, `applyView`, and an active-view auto-derivation. |
| `src/ui/archive/FilterPills.tsx` | Removable filter chips with tone-coded palettes (palm / tan / ink / oud / maroon). |
| `src/ui/archive/ContextBar.tsx` | Premium breadcrumb — home anchor, clickable parents, current segment, right-side meta slot. |
| `src/ui/archive/MetadataTree.tsx` | The left-column navigation tree. Categories · years · file types · special cases (needs review / unclassified) · tags. Each node shows a live count and toggles the corresponding filter on click. |
| `src/ui/archive/SavedViewTabs.tsx` | The pill row under the breadcrumb. Built-in + custom views. Save-current, rename, remove. Calm and prominent. |
| `src/ui/archive/DocumentRow.tsx` | Three variants (card · row · compact) over the same `ArchiveItem` data. Used by the Smart Explorer and the legacy list view. |
| `src/ui/archive/PreviewDrawer.tsx` | The right-side preview drawer. Title · pills · quick actions · summary · metadata table · tags · confidence meter · related files · "open document" footer. Esc-to-close. |
| `src/ui/archive/LocalGraphDrawer.tsx` | The contextual graph drawer. Scoped to the selected document with category + year hubs and up to 14 scored neighbors. |
| `src/ui/archive/SmartExplorerView.tsx` | The default view. Composes ContextBar + command row + saved-view pills + filter pills + metadata tree + results grid + preview drawer + local graph drawer. |
| `src/ui/archive/ColumnNavigatorView.tsx` | The 4-column metadata-driven browsing view. |
| `tests/archiveDiscovery.test.ts` | 9 new tests covering `buildFacets`, `BUILTIN_VIEWS`, `viewById`, `filtersEqual`, `getMonthNameAr`. |

### Modified (this phase)

| File | Why |
|:--|:--|
| `src/ui/pages/BrowsePage.tsx` | Rebuilt to host the three views (Smart Explorer · Column Navigator · Graph) behind a segmented control. Page header rebuilt with a real kicker + display title + description. Default view is **Smart Explorer**. The Graph option remains available. |
| `src/ui/components/UploadQueueItem.tsx` | Removed unused `TagIcon` import. |
| `src/ui/components/UploadQueuePanel.tsx` | Removed unused imports (`getStatusMeta`, `Tag`, `UploadItemStatus`). |
| `src/ui/components/UploadCurrentActivity.tsx` | Removed unused `FileText` import. |
| `src/ui/components/UploadBatchSummary.tsx` | Removed unused `Tag` import; cleaned up `SummaryCard` props. |
| `src/ui/pages/UploadPage.tsx` | Removed unused dead code (`getStatusMeta`, `fileIcon`, `fileTone`, duplicate imports). |
| `src/ui/upload/statusMeta.ts` | Fixed a wrong relative import path. |
| `src/api/hooks/useUploadQueue.ts` | Added the missing `currentId: string \| null` field to the `State` interface and `initialState`. (The reducer and selectors were already using it.) |

No route was added or changed. The archive still lives at
`#/archives`. The document detail page is still at
`#/archives/{id}`. No backend contract changed.

---

## 8. Before / after — the discovery flow

### Before (7.9 archive)

1. User opens `#/archives`.
2. Sees a search field, a category input, year and month selects.
3. **Has to type** to retrieve anything. Search is the only practical
   entry point.
4. Once a filter is set, there is no way to remove just one filter
   — only "إعادة التعيين" clears them all.
5. To inspect a document, the user has to click the card and
   navigate to `/archives/{id}`. To compare two documents, they have
   to remember each id and use the back button.
6. There is no notion of a saved filter set. The user retypes the
   same query every session.
7. The graph view sits at the top of the page alongside the list. It
   is full-archive scope and gets noisy fast.

### After (8.0 archive)

1. User opens `#/archives`. Default view is **Smart Explorer**.
2. They immediately see:
   - a **metadata tree** on the left (categories with counts)
   - **saved-view pills** (الشهادات · التقارير · صور · ملفات 2026 · إلخ)
   - a **breadcrumb** showing the current context
   - a **result grid** with cards (or list / compact)
3. To browse, they click any tree node or any saved-view pill. The
   results filter immediately. The filter appears as a removable
   pill. The breadcrumb updates. No typing required.
4. To inspect, they click a result. A **preview drawer** slides in
   from the right with summary, metadata, tags, confidence meter,
   related files, and quick actions. Esc closes it.
5. From the preview, they can **open the local graph** for that
   document. The graph shows the document, its category hub, its year
   hub, and up to 14 related documents. It is small and fast.
6. They can **save the current filter set** as a custom view with
   one click. The custom view lives in `localStorage` and survives
   reloads. They can rename or delete it from the pill row itself.
7. For dense scanning, they switch to **Column Navigator** via the
   segmented control and walk category → year → documents → preview.
8. For the full-network exploration, the **Graph** option is still
   there as a secondary view.

### Quantitative wins

- A user who knows *only* the category of the file (e.g. "الشهادات")
  reaches it in **1 click** (saved-view pill) or **2 clicks**
  (metadata tree → category), with **0 keystrokes**. Previously it
  was: open the archive → type the category name into the category
  input → press Enter. 4+ interactions.
- A user who knows the file name still has the same search input,
  but the result is now: result card → preview drawer → click
  "open" to go to the detail page. Previously: result card →
  navigate to `/archives/{id}` → back. The preview drawer eliminates
  one round trip.
- The graph view is **scoped to ≤ 15 nodes** by default (selected
  document + up to 14 neighbors). The previous full-network view
  could balloon to 200+ nodes and become unreadable.
- All 37 unit tests pass (was 28). New `archiveDiscovery.test.ts`
  suite locks the contracts of `buildFacets`, `viewById`,
  `filtersEqual`, and `getMonthNameAr`.

### Acceptance criteria

| Criterion | How it's met |
|:--|:--|
| Users can reach files significantly faster than before | Saved views are 1-click entry points. The metadata tree is a 1-click entry point per node. Search remains a single keystroke if the user knows the name. |
| Archive navigation feels premium, structured, and intelligent | 3-column workspace with metadata tree + results + preview. Calm motion (180–260 ms, `ease-out-expo`). Strong typographic hierarchy. No flashy gimmicks. |
| Search is no longer the only practical entry point | Saved views, metadata tree, and the Column Navigator are first-class entry points. Search is one option among several. |
| Metadata navigation is clear and useful | The metadata tree shows live counts per node. Selecting a node immediately filters results and appears as a pill + breadcrumb segment. |
| Preview reduces extra clicks | Preview drawer shows summary, metadata, tags, confidence, related files, and quick actions without leaving the workspace. |
| Column view feels elegant and fast | 4 columns, staggered fade-in (40 ms per column), dimmed-downstream-columns pattern, breadcrumb at the top. |
| Local graph adds contextual intelligence without becoming clutter | The local graph is bound to the selected document. ≤ 15 nodes, two hubs, scored neighbors. No more 200-node hairball. |
| Production-grade | `tsc -b --noEmit` clean · `vite build` clean · 37/37 tests pass · bundle 567 kB JS / 152 kB gz (was 566 kB / 152 kB gz — same bundle, new views). |

---

## 9. Open follow-ups

- The `useArchiveContext()` hook is currently local to the
  `SmartExplorerView`. Hoisting it to a context provider in
  `App.tsx` would let the upload page pre-select a category after a
  successful upload (a natural next step).
- Column Navigator could be promoted to a peer of the Browse page
  (e.g. `#/archives/columns`) so deep-linkable URLs preserve the
  selected column. Currently it is a view-mode in `BrowsePage`.
- The local graph's neighbor scoring is heuristic. A future
  iteration could include upload-time proximity or uploaded-by-user
  similarity as additional signals.
- The saved views store currently persists only in `localStorage`.
  A small server-side persistence layer would let saved views follow
  the user across devices.
