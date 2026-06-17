import { useState } from "react";
import {
  Check,
  Bookmark,
  Trash2,
  Sparkles,
  Award,
  ScrollText,
  Image as ImageIcon,
  CalendarClock,
  AlertTriangle,
  FileQuestion,
  Clock,
  Plus,
  Pencil,
} from "lucide-react";
import { BUILTIN_VIEWS, type ActiveView, type SavedView } from "./savedViews";

const ICONS_FOR: Record<string, typeof Check> = {
  certificates: Award,
  reports: ScrollText,
  images: ImageIcon,
  "current-year": CalendarClock,
  "needs-review": AlertTriangle,
  unclassified: FileQuestion,
  recent: Clock,
  all: Sparkles,
};

interface SavedViewTabsProps {
  activeId: string;
  onApply: (view: ActiveView | SavedView) => void;
  custom: SavedView[];
  onRemoveCustom: (id: string) => void;
  onRenameCustom: (id: string, label: string) => void;
  onSaveCurrent: () => void;
  canSave: boolean;
}

export function SavedViewTabs({
  activeId,
  onApply,
  custom,
  onRemoveCustom,
  onRenameCustom,
  onSaveCurrent,
  canSave,
}: SavedViewTabsProps): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="المشاهد المحفوظة"
    >
      {BUILTIN_VIEWS.map((v) => (
        <SavedViewPill
          key={v.id}
          view={v}
          active={activeId === v.id}
          icon={ICONS_FOR[v.id] ?? Sparkles}
          onClick={() => onApply(v)}
        />
      ))}
      {custom.length > 0 && (
        <span
          aria-hidden="true"
          className="mx-1 inline-block h-5 w-px bg-border"
        />
      )}
      {custom.map((v) =>
        editingId === v.id ? (
          <RenamePill
            key={v.id}
            initial={v.label}
            onCommit={(label) => {
              onRenameCustom(v.id, label);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            active={activeId === v.id}
            onClick={() => onApply(v)}
          />
        ) : (
          <SavedViewPill
            key={v.id}
            view={v}
            active={activeId === v.id}
            icon={Bookmark}
            onClick={() => onApply(v)}
            trailing={
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(v.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-sm opacity-60 transition-opacity duration-180 ease-out-expo hover:bg-paper hover:opacity-100"
                  title="إعادة تسمية"
                  aria-label="إعادة تسمية"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustom(v.id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-sm opacity-60 transition-opacity duration-180 ease-out-expo hover:bg-maroon-50 hover:text-maroon-600 hover:opacity-100"
                  title="حذف"
                  aria-label="حذف"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            }
          />
        )
      )}
      {canSave && (
        <button
          type="button"
          onClick={onSaveCurrent}
          className="group inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-transparent px-2.5 text-[12px] font-semibold text-ink-muted transition-all duration-180 ease-out-expo hover:border-palm hover:bg-palm-50 hover:text-palm-700"
          title="حفظ المشهد الحالي"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>حفظ المشهد</span>
        </button>
      )}
    </div>
  );
}

interface SavedViewPillProps {
  view: ActiveView | SavedView;
  active: boolean;
  icon: typeof Sparkles;
  onClick: () => void;
  trailing?: JSX.Element;
}

function SavedViewPill({
  view,
  active,
  icon: Icon,
  onClick,
  trailing,
}: SavedViewPillProps): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={"description" in view ? (view.description || view.label) : view.label}
      className={`group inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-semibold transition-all duration-180 ease-out-expo active:scale-[0.985] ${
        active
          ? "border-palm-200 bg-palm-50 text-palm-700 shadow-xs"
          : "border-border bg-paper text-ink-muted hover:border-border-strong hover:text-ink"
      }`}
    >
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          active ? "text-palm-600" : "text-ink-soft group-hover:text-ink-muted"
        }`}
        aria-hidden="true"
      />
      <span className="truncate">{view.label}</span>
      {active && (
        <Check
          className="h-3 w-3 shrink-0 text-palm-600"
          aria-hidden="true"
        />
      )}
      {trailing}
    </button>
  );
}

function RenamePill({
  initial,
  onCommit,
  onCancel,
  active,
  onClick,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <span
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[12.5px] font-semibold transition-all duration-180 ease-out-expo ${
        active
          ? "border-palm-200 bg-palm-50 text-palm-700"
          : "border-border bg-paper text-ink-muted"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5"
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="truncate">{initial}</span>
      </button>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value.trim() || initial)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(value.trim() || initial);
          if (e.key === "Escape") onCancel();
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-6 w-32 rounded-sm border border-border bg-paper px-1.5 text-[12.5px] text-ink focus:border-palm focus:outline-none focus:shadow-focus"
        aria-label="اسم المشهد"
      />
    </span>
  );
}
