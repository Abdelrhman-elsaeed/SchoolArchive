import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface GraphErrorBoundaryProps {
  children: ReactNode;
}

interface GraphErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class GraphErrorBoundary extends Component<GraphErrorBoundaryProps, GraphErrorBoundaryState> {
  constructor(props: GraphErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): GraphErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "خطأ غير معروف في عرض الشبكة",
    };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    try {
      // eslint-disable-next-line no-console
      console.error("[GraphView] caught error:", error, info.componentStack);
    } catch {
      /* noop */
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: "" });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="asa-card flex h-[560px] w-full flex-col items-center justify-center gap-3 p-6 text-center animate-fade-in">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-maroon-50 border border-maroon-200 text-maroon-500">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-[17px] font-bold text-ink-strong">
              تعذّر عرض الشبكة المعرفية
            </p>
            <p className="mt-1.5 text-[14px] text-ink-muted">
              حدث خطأ أثناء تجهيز البيانات. يمكنك إعادة المحاولة أو العودة إلى عرض القائمة.
            </p>
            {this.state.message && (
              <p className="mt-2 font-mono text-[11px] text-ink-soft ltr-mono" dir="ltr">
                {this.state.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-palm bg-palm px-4 py-2 font-display text-[13.5px] font-semibold text-white shadow-palm transition-colors duration-180 ease-out-expo hover:bg-palm-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
