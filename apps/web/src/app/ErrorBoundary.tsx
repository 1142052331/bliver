import { Component } from 'react';

import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // The API logger owns server diagnostics; the shell only contains the failure.
    void _error;
    void _info;
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return <main role="alert">Something went wrong. Please try again.</main>;
    }

    return this.props.children;
  }
}
