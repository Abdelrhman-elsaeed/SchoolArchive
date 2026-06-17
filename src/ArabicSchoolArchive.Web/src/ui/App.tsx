import { useEffect, useState } from "react";
import {
  Upload,
  Archive,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { DevSettingsPanel } from "./components/DevSettingsPanel";
import { BrowsePage } from "./pages/BrowsePage";
import { DocumentDetailsPage } from "./pages/DocumentDetailsPage";
import { SubscriptionBlockedPage, type BlockReason } from "./pages/SubscriptionBlockedPage";
import { UploadPage } from "./pages/UploadPage";
import { Alert, BrandMark } from "./components";
import { useDevBypass } from "../config/DevBypassContext";

type Route =
  | { kind: "upload" }
  | { kind: "browse" }
  | { kind: "details"; documentId: string }
  | { kind: "blocked"; reason: BlockReason; message?: string }
  | { kind: "notFound" };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "").trim();
  if (clean === "" || clean === "/") return { kind: "upload" };
  if (clean === "upload") return { kind: "upload" };
  if (clean === "archives" || clean === "archives/") return { kind: "browse" };
  const detailsMatch = clean.match(/^archives\/([0-9a-fA-F-]{36})$/);
  if (detailsMatch) {
    return { kind: "details", documentId: detailsMatch[1] };
  }
  if (clean === "blocked/expired") return { kind: "blocked", reason: "Expired" };
  if (clean === "blocked/suspended") return { kind: "blocked", reason: "Suspended" };
  if (clean === "blocked/grace") return { kind: "blocked", reason: "GracePeriod" };
  return { kind: "notFound" };
}

const NAV_ITEMS: Array<{
  id: Route["kind"];
  hash: string;
  label: string;
  description: string;
  icon: typeof Upload;
}> = [
  {
    id: "upload",
    hash: "#/upload",
    label: "رفع المستندات",
    description: "أرشفة ملف جديد",
    icon: Upload,
  },
  {
    id: "browse",
    hash: "#/archives",
    label: "الأرشيف",
    description: "استعراض المستندات",
    icon: Archive,
  },
];

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <div className="flex min-h-screen flex-row bg-canvas text-ink">
      <Sidebar
        open={sidebarOpen}
        activeId={route.kind}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          route={route}
        />
        <main
          id="main"
          className="flex-1 overflow-x-hidden px-4 py-7 sm:px-6 lg:px-10 animate-fade-in"
        >
          <div className="mx-auto w-full max-w-[1240px]">
            <RouteView route={route} />
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Sidebar
 *  - Deep Date Palm Green (so the chrome does not merge with cream).
 *  - Tan left-rule for the active item.
 *  - Strong typographic mark at the top.
 *  - Collapsed state keeps a focused icon-only column.
 * ──────────────────────────────────────────────────────────────────── */

function Sidebar({
  open,
  activeId,
  onToggle,
}: {
  open: boolean;
  activeId: Route["kind"];
  onToggle: () => void;
}): JSX.Element {
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-l border-palm-700 bg-palm text-white transition-[width] duration-320 ease-out-expo md:flex ${
        open ? "w-[272px]" : "w-[84px]"
      }`}
    >
      <div className="flex h-[88px] items-center gap-3.5 border-b border-palm-700 px-4">
        <BrandMark size="lg" variant="palm" />
        {open && (
          <div className="flex min-w-0 flex-col gap-0.5 animate-fade-in-soft">
            <span className="truncate font-display text-[17px] font-bold leading-tight">
              الأرشيف المدرسي
            </span>
            <span className="font-kufi text-[10.5px] uppercase leading-tight tracking-[0.24em] text-tan-200/85">
              Arabic · Archive
            </span>
          </div>
        )}
      </div>

      <nav
        className="flex flex-1 flex-col gap-1.5 p-3"
        aria-label="التنقل الرئيسي"
      >
        {open && (
          <div className="px-2 pb-1 pt-1">
            <div className="font-kufi text-[10px] uppercase tracking-[0.22em] text-tan-200/80">
              القائمة
            </div>
          </div>
        )}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            activeId === item.id ||
            (item.id === "browse" && activeId === "details");
          return (
            <a
              key={item.id}
              href={item.hash}
              className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] font-semibold transition-colors duration-180 ease-out-expo ${
                active
                  ? "bg-palm-700 text-white"
                  : "text-tan-100 hover:bg-palm-700/60 hover:text-white"
              } ${open ? "" : "justify-center"}`}
              title={!open ? item.label : undefined}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-2 start-0 w-[3px] rounded-full bg-tan transition-opacity duration-180 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon
                className={`h-[18px] w-[18px] shrink-0 transition-colors duration-180 ${
                  active ? "text-tan" : "text-tan-200/80 group-hover:text-tan-100"
                }`}
                aria-hidden="true"
              />
              {open && (
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-display">{item.label}</span>
                  <span className="truncate text-[10.5px] font-normal text-tan-200/80">
                    {item.description}
                  </span>
                </span>
              )}
            </a>
          );
        })}

        {open && (
          <div className="mt-4 rounded-md border border-palm-700 bg-palm-700/60 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-tan" aria-hidden="true" />
              <span className="font-kufi text-[10px] uppercase tracking-[0.18em] text-tan-200">
                تخزين آمن
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-tan-100/90">
              جميع المستندات مشفّرة أثناء النقل ومحفوظة في تخزين سحابي
              متوافق مع الأنظمة السعودية.
            </p>
          </div>
        )}
      </nav>

      <div className="border-t border-palm-700 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "طي القائمة" : "فتح القائمة"}
          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[12.5px] font-semibold text-tan-100 transition-colors duration-180 ease-out-expo hover:bg-palm-700/60 hover:text-white ${
            open ? "" : "justify-center"
          }`}
        >
          {open ? (
            <>
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              <span>طي القائمة</span>
            </>
          ) : (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Top bar
 *  - Sticky, cream-soft, with a tan baseline rule.
 *  - Title + kufi subtitle on the right; search + actions on the left.
 *  - Tenant badge is solid palm with a clear hit target.
 * ──────────────────────────────────────────────────────────────────── */

function TopBar({
  sidebarOpen,
  onToggleSidebar,
  route,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  route: Route;
}): JSX.Element {
  const { config } = useDevBypass();
  const { title, kicker, crumbs } = describeRoute(route);

  return (
    <header className="sticky top-0 z-30 flex h-[76px] flex-col gap-3 border-b border-border bg-cream-soft/90 backdrop-blur-sm px-4 py-3 sm:px-6 lg:px-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "طي القائمة" : "فتح القائمة"}
          className="hidden h-10 w-10 items-center justify-center rounded-md border border-border bg-paper text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink md:inline-flex"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-4.5 w-4.5" aria-hidden="true" />
          ) : (
            <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden="true" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            {crumbs.length > 0 && (
              <div className="hidden items-center gap-1.5 text-[11.5px] text-ink-soft sm:flex">
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <span key={i} className="flex items-center gap-1.5">
                      {c.href && !last ? (
                        <a
                          href={c.href}
                          className="transition-colors duration-180 ease-out-expo hover:text-ink"
                        >
                          {c.label}
                        </a>
                      ) : (
                        <span className={last ? "font-semibold text-ink" : ""}>
                          {c.label}
                        </span>
                      )}
                      {!last && (
                        <span aria-hidden="true" className="text-ink-soft">
                          /
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <h1 className="truncate font-display text-[16px] font-bold text-ink-strong sm:text-[17px]">
                {title}
              </h1>
              {kicker && (
                <span
                  className="hidden h-5 items-center rounded-sm border border-tan-200 bg-tan-50 px-2 font-kufi text-[10px] uppercase tracking-[0.18em] text-tan-700 sm:inline-flex"
                >
                  {kicker}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="hidden flex-1 max-w-md md:flex">
          <label className="group relative flex h-10 w-full items-center rounded-md border border-border bg-paper pe-3 ps-3 transition-colors duration-180 ease-out-expo hover:border-border-strong focus-within:border-palm focus-within:shadow-focus">
            <Search
              className="pointer-events-none me-2 h-4 w-4 text-ink-soft transition-colors duration-180 group-focus-within:text-palm"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="بحث سريع في الأرشيف…"
              className="h-full w-full min-w-0 bg-transparent pe-1 text-[13.5px] text-ink placeholder:text-ink-soft focus:outline-none"
              aria-label="بحث سريع"
            />
          </label>
        </div>

        <button
          type="button"
          aria-label="إشعارات"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-paper text-ink-muted transition-colors duration-180 ease-out-expo hover:bg-cream-soft hover:text-ink"
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
          <span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-maroon" />
        </button>

        <button
          type="button"
          className="flex h-10 items-center gap-2.5 rounded-md border border-border bg-paper pe-3 ps-1.5 transition-colors duration-180 ease-out-expo hover:border-border-strong"
          aria-label="حساب المدرسة"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-palm font-display text-[12px] font-bold text-white">
            م
          </span>
          <div className="hidden flex-col leading-tight sm:flex">
            <span className="text-[12px] font-semibold text-ink-strong">
              المدرسة
            </span>
            <span
              className="font-mono text-[10px] text-ink-soft ltr-mono tnum"
              dir="ltr"
            >
              {config.schoolId.slice(0, 8)}
            </span>
          </div>
          <ChevronDown className="hidden h-3.5 w-3.5 text-ink-soft sm:inline" aria-hidden="true" />
        </button>
      </div>

      <div
        aria-hidden="true"
        className="-mx-4 -mb-3 h-px bg-gradient-to-l from-transparent via-tan-300 to-transparent sm:-mx-6 lg:-mx-10"
      />
    </header>
  );
}

function Footer(): JSX.Element {
  return (
    <footer className="border-t border-border bg-cream-soft">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col items-stretch gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
        <small className="font-display text-[12px] text-ink-soft">
          © الأرشيف المدرسي العربي —{" "}
          <span className="text-ink-muted">واجهة إدارية للمرحلة 8.0</span>
        </small>
        <DevSettingsPanel />
      </div>
    </footer>
  );
}

function RouteView({ route }: { route: Route }): JSX.Element {
  if (route.kind === "upload") return <UploadPage />;
  if (route.kind === "browse") return <BrowsePage />;
  if (route.kind === "details")
    return <DocumentDetailsPage documentId={route.documentId} />;
  if (route.kind === "blocked") {
    return (
      <SubscriptionBlockedPage reason={route.reason} message={route.message} />
    );
  }
  return (
    <section className="flex flex-col gap-5">
      <Alert variant="info" title="الصفحة غير موجودة">
        الرابط المطلوب غير معروف.
      </Alert>
      <a
        href="#/upload"
        className="inline-flex w-fit items-center gap-2 self-start rounded-md border border-palm bg-palm px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-palm transition-colors duration-180 ease-out-expo hover:bg-palm-600"
      >
        العودة إلى صفحة الرفع
      </a>
    </section>
  );
}

function describeRoute(route: Route): {
  title: string;
  kicker?: string;
  crumbs: Array<{ label: string; href?: string }>;
} {
  if (route.kind === "upload")
    return {
      title: "رفع المستندات",
      kicker: "بوابة الإيداع",
      crumbs: [
        { label: "الرئيسية", href: "#/upload" },
        { label: "رفع المستندات" },
      ],
    };
  if (route.kind === "browse")
    return {
      title: "الأرشيف",
      kicker: "مكتبة المدرسة",
      crumbs: [
        { label: "الرئيسية", href: "#/upload" },
        { label: "الأرشيف" },
      ],
    };
  if (route.kind === "details")
    return {
      title: "تفاصيل المستند",
      crumbs: [
        { label: "الرئيسية", href: "#/upload" },
        { label: "الأرشيف", href: "#/archives" },
        { label: "تفاصيل المستند" },
      ],
    };
  if (route.kind === "blocked") {
    if (route.reason === "Expired")
      return {
        title: "اشتراك منتهي",
        kicker: "تنبيه",
        crumbs: [
          { label: "الرئيسية", href: "#/upload" },
          { label: "اشتراك منتهي" },
        ],
      };
    if (route.reason === "Suspended")
      return {
        title: "اشتراك موقوف",
        kicker: "تنبيه",
        crumbs: [
          { label: "الرئيسية", href: "#/upload" },
          { label: "اشتراك موقوف" },
        ],
      };
    if (route.reason === "GracePeriod")
      return {
        title: "مهلة التجديد",
        kicker: "تنبيه",
        crumbs: [
          { label: "الرئيسية", href: "#/upload" },
          { label: "مهلة التجديد" },
        ],
      };
  }
  return {
    title: "الأرشيف المدرسي",
    crumbs: [{ label: "الرئيسية", href: "#/upload" }],
  };
}
