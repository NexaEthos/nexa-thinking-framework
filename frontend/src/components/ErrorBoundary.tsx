import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container" style={{ justifyContent: "center", alignItems: "center" }}>
          <div className="panel" style={{ maxWidth: "480px", margin: "2rem" }}>
            <div className="panel-body" style={{ textAlign: "center", padding: "2.5rem" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>😔</div>
              <h2 style={{ margin: "0 0 0.5rem", color: "var(--gray-800)" }}>
                Something went wrong
              </h2>
              <p
                style={{ color: "var(--gray-600)", marginBottom: "1.5rem", fontSize: "0.9375rem" }}
              >
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <p style={{ color: "var(--gray-500)", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                Please try again or refresh the page if the problem persists.
              </p>
              <button onClick={this.handleRetry} className="btn btn-primary">
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
