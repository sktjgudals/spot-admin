"use client";

import {
  Component,
  Suspense,
  createElement,
  lazy,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { captureClientException } from "@/lib/client-observability";

type RetryableLazyOptions = {
  loading: ReactNode;
  errorTitle: string;
  errorDescription?: string;
  retryLabel?: string;
};

type LazyLoadErrorBoundaryProps = {
  children: ReactNode;
  errorTitle: string;
  errorDescription: string;
  retryLabel: string;
  onRetry: () => void;
};

type LazyLoadErrorBoundaryState = {
  error: unknown;
};

class LazyImportError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "The lazy module could not be imported.",
    );
    this.name = "LazyImportError";
    this.originalError = originalError;
  }
}

class LazyLoadErrorBoundary extends Component<
  LazyLoadErrorBoundaryProps,
  LazyLoadErrorBoundaryState
> {
  state: LazyLoadErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): LazyLoadErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (error instanceof LazyImportError) captureClientException(error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    if (!(this.state.error instanceof LazyImportError)) throw this.state.error;

    return (
      <div
        className="grid min-h-48 place-items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        role="alert"
      >
        <div className="space-y-1">
          <p className="font-medium text-destructive">{this.props.errorTitle}</p>
          <p className="text-sm text-muted-foreground">
            {this.props.errorDescription}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={this.props.onRetry}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {this.props.retryLabel}
        </Button>
      </div>
    );
  }
}

/**
 * Keeps expensive role/feature chunks split while making a rejected import
 * recoverable. A new React.lazy payload is created for each explicit retry;
 * resetting only an error boundary would otherwise reuse React's cached
 * rejected promise forever.
 */
export function createRetryableLazyComponent<Props extends object>(
  loader: () => Promise<{ default: ComponentType<Props> }>,
  options: RetryableLazyOptions,
): ComponentType<Props> {
  const loadComponent = () =>
    Promise.resolve()
      .then(loader)
      .catch((error: unknown) => {
        throw new LazyImportError(error);
      });

  function RetryableLazyComponent(props: Props) {
    const [loadState, setLoadState] = useState(() => ({
      attempt: 0,
      component: lazy(loadComponent),
    }));
    const LazyComponent = loadState.component;

    return (
      <LazyLoadErrorBoundary
        key={loadState.attempt}
        errorTitle={options.errorTitle}
        errorDescription={
          options.errorDescription ??
          "네트워크 연결을 확인한 뒤 다시 불러와 주세요."
        }
        retryLabel={options.retryLabel ?? "다시 시도"}
        onRetry={() =>
          setLoadState((current) => ({
            attempt: current.attempt + 1,
            component: lazy(loadComponent),
          }))
        }
      >
        <Suspense fallback={options.loading}>
          {createElement(LazyComponent, props)}
        </Suspense>
      </LazyLoadErrorBoundary>
    );
  }

  RetryableLazyComponent.displayName = "RetryableLazyComponent";
  return RetryableLazyComponent;
}
