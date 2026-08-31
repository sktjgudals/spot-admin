type SecurityEnvironment = "development" | "test" | "production";

type SecurityHeadersOptions = {
  environment?: SecurityEnvironment;
  apiOrigins?: Array<string | undefined>;
  chatWebSocketUrl?: string;
};

const PRODUCTION_CONNECT_SOURCES = [
  "'self'",
  "https://api.dopa.ing",
  "https://dopa-backend.ceoofspot.workers.dev",
  "https://dopa-backend-staging.ceoofspot.workers.dev",
  "wss://api.dopa.ing",
  "wss://dopa-backend-staging.ceoofspot.workers.dev",
  "https://*.ingest.sentry.io",
  "https://*.sentry.io",
  "https://accounts.google.com",
  "https://appleid.apple.com",
  "https://analyticsdata.googleapis.com",
] as const;

function parseOrigin(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

function configuredConnectSources({
  environment,
  apiOrigins = [],
  chatWebSocketUrl,
}: Required<Pick<SecurityHeadersOptions, "environment">> &
  Omit<SecurityHeadersOptions, "environment">): string[] {
  const candidates = [
    ...apiOrigins.map(parseOrigin),
    parseOrigin(chatWebSocketUrl),
  ].filter((url): url is URL => url !== null);

  if (environment === "development") {
    return [
      ...candidates
        .filter(isLoopback)
        .filter((url) =>
          ["http:", "https:", "ws:", "wss:"].includes(url.protocol),
        )
        .map((url) => url.origin),
      // Turbopack HMR follows whichever loopback hostname/port starts dev.
      "ws://localhost:*",
      "ws://127.0.0.1:*",
    ];
  }

  return candidates
    .filter((url) => ["https:", "wss:"].includes(url.protocol))
    .map((url) => url.origin);
}

export function createContentSecurityPolicy(
  options: SecurityHeadersOptions = {},
): string {
  const environment = options.environment ?? "production";
  const connectSources = Array.from(
    new Set([
      ...PRODUCTION_CONNECT_SOURCES,
      ...configuredConnectSources({ ...options, environment }),
    ]),
  );

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://appleid.cdn-apple.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://accounts.google.com https://appleid.apple.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob: https://media.dopa.ing https://media-staging.dopa.ing",
    ...(environment === "development" ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function createSecurityHeaders(
  options: SecurityHeadersOptions = {},
): Record<string, string> {
  const environment = options.environment ?? "production";
  return {
    "Content-Security-Policy": createContentSecurityPolicy({
      ...options,
      environment,
    }),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(environment === "development"
      ? {}
      : {
          "Strict-Transport-Security":
            "max-age=31536000; includeSubDomains",
        }),
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  };
}

/** Production policy mirrored by `public/_headers`. */
export const CONTENT_SECURITY_POLICY = createContentSecurityPolicy();

/** Production headers mirrored by `public/_headers`. */
export const SECURITY_HEADERS = createSecurityHeaders();

/** Runtime/build policy, including exact local transports only in development. */
export const RUNTIME_SECURITY_HEADERS = createSecurityHeaders({
  environment:
    process.env.NODE_ENV === "development" ? "development" : "production",
  apiOrigins: [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_API_FALLBACK_URL,
  ],
  chatWebSocketUrl: process.env.NEXT_PUBLIC_CHAT_WS_URL,
});
