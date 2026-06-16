import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Chart error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 bg-orbit-panel p-6 text-center">
            <p className="text-sm text-orbit-secondary">Chart failed to render</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-2 rounded bg-white px-3 py-1.5 text-xs font-semibold text-black"
            >
              Retry
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
