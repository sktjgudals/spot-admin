type SentryClientModule = typeof import("@sentry/nextjs");
type RouterTransitionArgs = Parameters<
  SentryClientModule["captureRouterTransitionStart"]
>;

const hasPublicDsn = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
let sentryClientPromise: Promise<SentryClientModule | null> | null = null;

function loadSentryClient(): Promise<SentryClientModule | null> {
  if (!hasPublicDsn) return Promise.resolve(null);
  if (!sentryClientPromise) {
    sentryClientPromise = Promise.all([
      import("@sentry/nextjs"),
      import("../../sentry.client.config"),
    ]).then(([sentry]) => sentry);
  }
  return sentryClientPromise;
}

/** Start observability after the critical admin shell has evaluated. */
export function preloadClientObservability(): void {
  void loadSentryClient();
}

export function captureClientException(error: unknown): void {
  void loadSentryClient().then((sentry) => sentry?.captureException(error));
}

/** Queue the transition until Sentry's deferred client chunk is ready. */
export function captureClientRouterTransition(
  ...args: RouterTransitionArgs
): void {
  void loadSentryClient().then((sentry) =>
    sentry?.captureRouterTransitionStart(...args),
  );
}
