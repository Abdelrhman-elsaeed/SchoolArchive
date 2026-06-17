// Knowledge Graph view for the Arabic School Archive.
//
// Architecture
// ------------
// The graph is split into small, single-purpose modules under `./graph/`:
//
//   types.ts        — central type definitions
//   styles.ts       — design tokens, color/sizing, sigma reducers
//   buildGraph.ts   — turn `ArchiveItem[]` into `{nodes, links}`
//   layout.ts       — ForceAtlas2 layout (sync + worker mode)
//   interaction.ts  — focus/neighbor/touching-edge policies
//   labels.ts       — label visibility policy
//   renderer.ts     — owns the Sigma instance, exposes an imperative API
//   GraphView.tsx   — this file; the React orchestrator
//
// The orchestrator owns three pieces of state:
//   - the data signature (drives re-layout + re-fit)
//   - the interaction state (hovered/selected node, focus mode)
//   - the pinned category (a hint to the rest of the app)
//
// All visual work happens in the sigma `nodeReducer` / `edgeReducer`
// functions in `styles.ts`, called once per state change. Sigma then
// renders to WebGL on every frame. This separation keeps React
// out of the per-frame hot loop and gives us a single, well-defined
// place to tune the visual policy.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, FileText, Maximize2, Minimize2, Network, Sparkles, Tag } from "lucide-react";
import type { ArchiveItem } from "../../api/contracts";
import { buildGraph, computeStats } from "./graph/buildGraph.ts";
import { GraphRenderer } from "./graph/renderer.ts";
import {
  buildGraphology,
  runLayoutAsync,
  type AsyncLayoutHandle,
} from "./graph/layout.ts";
import type { GraphData, GraphStats as GraphStatsT } from "./graph/types.ts";
import { CAMERA } from "./graph/styles.ts";

interface GraphViewProps {
  items: ArchiveItem[];
  onDocumentOpen: (documentId: string) => void;
  onCategoryFilter: (category: string) => void;
  selectedCategory?: string | null;
}

export function GraphView({
  items,
  onDocumentOpen,
  onCategoryFilter,
  selectedCategory,
}: GraphViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const layoutHandleRef = useRef<AsyncLayoutHandle | null>(null);
  const dataSignatureRef = useRef<string>("");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pinnedCategory, setPinnedCategory] = useState<string | null>(null);
  const [hasFit, setHasFit] = useState<boolean>(false);
  const [focusModeEnabled, setFocusModeEnabled] = useState<boolean>(false);
  const [layoutTick, setLayoutTick] = useState<number>(0);

  // Build the raw graph dataset (memoized on the items array).
  const data: GraphData = useMemo(() => buildGraph(items), [items]);

  // Cheap stats for the toolbar.
  const stats: GraphStatsT = useMemo(() => computeStats(data), [data]);

  // Identity signature for the dataset — used to detect "data changed".
  const dataSignature = useMemo(
    () => `${data.nodes.length}:${data.links.length}`,
    [data.nodes.length, data.links.length]
  );

  // Sync external pinned category → local state.
  useEffect(() => {
    setPinnedCategory(selectedCategory ?? null);
  }, [selectedCategory]);

  /* ─── Mount the renderer once ───────────────────────────────────────── */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const renderer = new GraphRenderer({ container: el });
    rendererRef.current = renderer;
    setZoom(renderer.getZoom());

    // Wire sigma events to React state.
    const sigma = renderer.getSigma();
    const onEnterNode = (payload: { node: string }): void => {
      setHoveredNodeId(payload.node);
    };
    const onLeaveNode = (): void => {
      setHoveredNodeId(null);
    };
    const onClickNode = (payload: { node: string }): void => {
      setSelectedNodeId(payload.node);
      // Read node attrs to drive callbacks.
      const graph = renderer.getGraph();
      if (!graph.hasNode(payload.node)) return;
      const attrs = graph.getNodeAttributes(payload.node);
      if (attrs.kind === "category") {
        setPinnedCategory(attrs.label);
        onCategoryFilter(attrs.label);
        return;
      }
      if (attrs.documentId) {
        onDocumentOpen(attrs.documentId);
      }
    };
    const onClickStage = (): void => {
      setSelectedNodeId(null);
    };
    const onCameraUpdate = (): void => {
      setZoom(renderer.getZoom());
    };

    sigma.on("enterNode", onEnterNode);
    sigma.on("leaveNode", onLeaveNode);
    sigma.on("clickNode", onClickNode);
    sigma.on("clickStage", onClickStage);
    const cam = sigma.getCamera();
    cam.on("updated", onCameraUpdate);

    return () => {
      try {
        sigma.off("enterNode", onEnterNode);
        sigma.off("leaveNode", onLeaveNode);
        sigma.off("clickNode", onClickNode);
        sigma.off("clickStage", onClickStage);
        cam.off("updated", onCameraUpdate);
      } catch {
        /* noop */
      }
      renderer.destroy();
      rendererRef.current = null;
      if (layoutHandleRef.current) {
        layoutHandleRef.current.stop();
        layoutHandleRef.current = null;
      }
    };
    // onDocumentOpen / onCategoryFilter are stable in practice, but
    // we still want the latest closure. We re-mount only when the
    // container changes (which it doesn't, in normal use).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Reload data when the dataset changes ───────────────────────────── */

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    // Stop any in-flight layout.
    if (layoutHandleRef.current) {
      layoutHandleRef.current.stop();
      layoutHandleRef.current = null;
    }

    if (data.nodes.length === 0) {
      renderer.setGraph(
        buildGraphology({ nodes: [], links: [] })
      );
      dataSignatureRef.current = dataSignature;
      return;
    }

    // Stage A: Build graph synchronously and assign seeded positions.
    const graph = buildGraphology(data);
    
    // Render immediately with seeded positions before FA2 starts.
    renderer.setGraph(graph);
    dataSignatureRef.current = dataSignature;
    renderer.fitToView(0); // instant fit to seeds

    let cancelled = false;
    let isLayoutRunning = true;
    
    // Setup a refresh loop so the FA2 updates are animated smoothly.
    const refreshLoop = () => {
      if (cancelled) return;
      if (isLayoutRunning) {
        renderer.getSigma().refresh();
        requestAnimationFrame(refreshLoop);
      }
    };
    refreshLoop();

    setHasFit(false);
    setLayoutTick((t) => t + 1);

    // Stage B: Run FA2 (worker if available) and animate camera fit when stable.
    (async (): Promise<void> => {
      try {
        const handle = await runLayoutAsync(graph, 260);
        if (cancelled) {
          handle.stop();
          return;
        }
        layoutHandleRef.current = handle;
        
        await handle.done;
        if (cancelled) return;
        
        isLayoutRunning = false;
        renderer.getSigma().refresh(); // final refresh

        if (!hasFit) {
          renderer.fitToView(CAMERA.initialFitDurationMs);
          setHasFit(true);
        }
      } catch (err) {
        isLayoutRunning = false;
        // eslint-disable-next-line no-console
        console.warn("[GraphView] layout failed, falling back to seeds", err);
        renderer.getSigma().refresh();
        if (!hasFit && !cancelled) {
          renderer.fitToView(CAMERA.initialFitDurationMs);
          setHasFit(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      isLayoutRunning = false;
    };
    // We deliberately depend only on the data signature so the same
    // dataset reloading the same instance does not retrigger a
    // (potentially expensive) layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature]);

  /* ─── Sync React state → renderer state ──────────────────────────────── */

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setState({
      hoveredNodeId,
      selectedNodeId,
      focusModeEnabled,
    });
  }, [hoveredNodeId, selectedNodeId, focusModeEnabled]);

  /* ─── Resize observer ───────────────────────────────────────────────── */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      try {
        renderer.getSigma().resize();
      } catch {
        /* noop */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ─── Handlers for the controls ─────────────────────────────────────── */

  const handleZoomIn = useCallback((): void => {
    rendererRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback((): void => {
    rendererRef.current?.zoomOut();
  }, []);

  const handleRecenter = useCallback((): void => {
    rendererRef.current?.recenter();
  }, []);

  const clearPin = useCallback((): void => {
    setPinnedCategory(null);
    onCategoryFilter("");
  }, [onCategoryFilter]);

  const toggleFocusMode = useCallback((): void => {
    setFocusModeEnabled((v) => !v);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-accent text-white shadow-navy">
            <Network className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-brand-navy-700">
              الشبكة المعرفية الذكية
            </h2>
            <p className="text-xs text-ink-muted">
              استكشف المستندات بصرياً عبر التصنيفات والوسوم المشتركة
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface-warm px-3 py-1.5 font-semibold text-brand-navy-700">
            <FileText className="h-3.5 w-3.5 text-brand-gold-600" aria-hidden="true" />
            {stats.documents} مستند
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface-warm px-3 py-1.5 font-semibold text-brand-navy-700">
            <Filter className="h-3.5 w-3.5 text-brand-gold-600" aria-hidden="true" />
            {stats.categories} تصنيف
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface-warm px-3 py-1.5 font-semibold text-brand-navy-700">
            <Tag className="h-3.5 w-3.5 text-brand-gold-600" aria-hidden="true" />
            {stats.tagBridges} جسر دلالي
          </span>
          {pinnedCategory && (
            <button
              type="button"
              onClick={clearPin}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/30 bg-brand-gold-50 px-3 py-1.5 font-semibold text-brand-gold-700 transition-all hover:bg-brand-gold-100 active:scale-95"
              title="إلغاء تصفية التصنيف"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              مُثبَّت: {pinnedCategory}
            </button>
          )}
        </div>
      </div>

      <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div
          ref={containerRef}
          className="h-full w-full"
          data-layout-tick={layoutTick}
        />
        {data.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-ink-muted">
            <Network className="h-10 w-10 text-brand-navy-200" aria-hidden="true" />
            <p className="font-display font-semibold text-brand-navy-700">
              لا توجد مستندات لعرضها في الشبكة
            </p>
            <p className="text-xs text-ink-muted">
              قم بتوسيع الفلاتر لعرض المزيد من النتائج.
            </p>
          </div>
        )}

        <GraphControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRecenter={handleRecenter}
          onToggleFocusMode={toggleFocusMode}
          focusModeEnabled={focusModeEnabled}
          zoom={zoom}
        />
        <Legend />
      </div>
    </div>
  );
}

function GraphControls({
  onZoomIn,
  onZoomOut,
  onRecenter,
  onToggleFocusMode,
  focusModeEnabled,
  zoom,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onToggleFocusMode: () => void;
  focusModeEnabled: boolean;
  zoom: number;
}): JSX.Element {
  return (
    <div className="pointer-events-auto absolute end-3 top-3 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-soft backdrop-blur-sm">
      <button
        type="button"
        onClick={onZoomIn}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-navy-700 transition hover:bg-brand-navy-50 active:scale-95"
        aria-label="تكبير"
        title="تكبير"
      >
        <span className="font-display text-base font-bold leading-none">+</span>
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-navy-700 transition hover:bg-brand-navy-50 active:scale-95"
        aria-label="تصغير"
        title="تصغير"
      >
        <Minimize2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="my-0.5 h-px bg-slate-200" />
      <button
        type="button"
        onClick={onRecenter}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-navy-700 transition hover:bg-brand-navy-50 active:scale-95"
        aria-label="إعادة توسيط"
        title="إعادة توسيط الشبكة"
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="my-0.5 h-px bg-slate-200" />
      <button
        type="button"
        onClick={onToggleFocusMode}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95 ${
          focusModeEnabled
            ? "bg-brand-gold-50 text-brand-gold-700 ring-1 ring-brand-gold/40"
            : "text-brand-navy-700 hover:bg-brand-navy-50"
        }`}
        aria-label={focusModeEnabled ? "إيقاف وضع التركيز" : "تشغيل وضع التركيز"}
        title={focusModeEnabled ? "إيقاف وضع التركيز" : "تشغيل وضع التركيز"}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mt-0.5 text-center font-mono text-[10px] text-ink-soft">
        {zoom.toFixed(2)}×
      </div>
    </div>
  );
}

function Legend(): JSX.Element {
  return (
    <div className="pointer-events-none absolute bottom-3 start-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11px] text-ink-muted shadow-soft backdrop-blur-sm">
      <div className="mb-1 font-display font-semibold text-brand-navy-700">
        دليل الألوان
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-brand-navy-700 ring-2 ring-brand-gold" />
          تصنيف
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#e11d48]" />
          PDF
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
          Word
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#059669]" />
          Excel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />
          صورة
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-5"
            style={{
              backgroundImage:
                "linear-gradient(90deg, #a3865b 50%, transparent 50%)",
              backgroundSize: "6px 1px",
              backgroundRepeat: "repeat-x",
            }}
          />
          ربط بالوسوم
        </span>
      </div>
    </div>
  );
}
