import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugError } from "../utils/debugLog";

type Props = {
  children: ReactNode;
  /** Khi lỗi — thường đóng printJob / modal */
  onError?: (error: Error) => void;
  fallback?: ReactNode;
};

type State = { error: Error | null };

/**
 * Bắt lỗi render (vd. portal print insertBefore) để Ops không bị vỡ cả cây.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    debugError("ui:error-boundary", error, info.componentStack);
    this.props.onError?.(error);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
        role="alertdialog"
        aria-labelledby="app-error-boundary-title"
      >
        <div className="w-full max-w-md rounded-2xl border border-ui-border bg-ui-surface p-5 shadow-md">
          <h2 id="app-error-boundary-title" className="text-base font-semibold text-ui-text">
            Lỗi giao diện tạm thời
          </h2>
          <p className="mt-2 text-sm text-ui-text-muted">
            {this.state.error.message || "Không thể hiển thị phần này."} Ops vẫn dùng được —
            đóng cửa sổ này rồi thử lại.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-full bg-apple-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }
}
