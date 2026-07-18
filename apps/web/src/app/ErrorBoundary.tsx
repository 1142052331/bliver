import { Button, StatusView } from '@bliver/ui';
import { Component } from 'react';
import { useTranslation } from 'react-i18next';

import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

class ErrorBoundaryCore extends Component<
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
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function AppErrorBoundary({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation();
  const fallback = (
    <main
      className="app-shell__status-shell app-shell__status-shell--standalone"
      role="alert"
    >
      <StatusView
        action={
          <Button onClick={() => window.location.reload()}>
            {t('common.retry')}
          </Button>
        }
        body={t('errors.unexpectedBody')}
        title={t('errors.unexpectedTitle')}
      />
    </main>
  );

  return (
    <ErrorBoundaryCore fallback={fallback}>{children}</ErrorBoundaryCore>
  );
}
