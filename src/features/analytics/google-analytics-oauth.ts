export const ANALYTICS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";

const GOOGLE_IDENTITY_SERVICES_SRC = "https://accounts.google.com/gsi/client";
const GIS_LOAD_TIMEOUT_MS = 10_000;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type GoogleClientConfigError = {
  type?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrides: {
    prompt: "consent";
    scope: string;
    include_granted_scopes: false;
  }) => void;
};

type GoogleOauth2Api = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    include_granted_scopes: false;
    callback: (response: GoogleTokenResponse) => void;
    error_callback: (error: GoogleClientConfigError) => void;
  }) => GoogleTokenClient;
};

type GoogleAnalyticsWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: GoogleOauth2Api;
    };
  };
};

export type GoogleAnalyticsOAuthErrorKind =
  | "cancelled"
  | "popup"
  | "scope"
  | "configuration"
  | "unavailable";

export class GoogleAnalyticsOAuthError extends Error {
  constructor(
    readonly kind: GoogleAnalyticsOAuthErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAnalyticsOAuthError";
  }
}

export type GoogleAnalyticsTokenGrant = {
  accessToken: string;
  expiresInSeconds: number;
};

let gisLoader: Promise<void> | null = null;

function oauth2Api(): GoogleOauth2Api | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as GoogleAnalyticsWindow).google?.accounts?.oauth2;
}

export function loadGoogleAnalyticsIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (oauth2Api()) return Promise.resolve();
  if (gisLoader) return gisLoader;

  gisLoader = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: GoogleAnalyticsOAuthError) => {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      if (error) {
        gisLoader = null;
        reject(error);
      } else {
        resolve();
      }
    };

    const poll = window.setInterval(() => {
      if (oauth2Api()) finish();
    }, 50);
    const timeout = window.setTimeout(() => {
      finish(
        new GoogleAnalyticsOAuthError(
          "unavailable",
          "Google Analytics 연결 모듈을 불러오지 못했습니다.",
        ),
      );
    }, GIS_LOAD_TIMEOUT_MS);

    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`,
    );
    if (!script) {
      script = document.createElement("script");
      script.src = GOOGLE_IDENTITY_SERVICES_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener(
      "error",
      () =>
        finish(
          new GoogleAnalyticsOAuthError(
            "unavailable",
            "Google Analytics 연결 모듈을 불러오지 못했습니다.",
          ),
        ),
      { once: true },
    );
  });

  return gisLoader;
}

function mapClientError(error: GoogleClientConfigError): GoogleAnalyticsOAuthError {
  if (error.type === "popup_closed") {
    return new GoogleAnalyticsOAuthError(
      "cancelled",
      "Google Analytics 연결 창이 닫혔습니다.",
    );
  }
  if (error.type === "popup_failed_to_open") {
    return new GoogleAnalyticsOAuthError(
      "popup",
      "팝업이 차단되어 Google Analytics를 연결하지 못했습니다.",
    );
  }
  return new GoogleAnalyticsOAuthError(
    "unavailable",
    "Google Analytics 권한 요청을 완료하지 못했습니다.",
  );
}

export async function requestGoogleAnalyticsToken(
  clientId: string,
): Promise<GoogleAnalyticsTokenGrant> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    throw new GoogleAnalyticsOAuthError(
      "configuration",
      "Google OAuth 클라이언트가 설정되지 않았습니다.",
    );
  }

  await loadGoogleAnalyticsIdentityServices();
  const oauth2 = oauth2Api();
  if (!oauth2) {
    throw new GoogleAnalyticsOAuthError(
      "unavailable",
      "Google Analytics 연결 모듈을 사용할 수 없습니다.",
    );
  }

  return new Promise<GoogleAnalyticsTokenGrant>((resolve, reject) => {
    let settled = false;
    const rejectOnce = (error: GoogleAnalyticsOAuthError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const tokenClient = oauth2.initTokenClient({
      client_id: normalizedClientId,
      scope: ANALYTICS_READONLY_SCOPE,
      include_granted_scopes: false,
      callback: (response) => {
        if (settled) return;
        if (response.error) {
          rejectOnce(
            new GoogleAnalyticsOAuthError(
              response.error === "access_denied" ? "cancelled" : "unavailable",
              "Google Analytics 읽기 권한이 승인되지 않았습니다.",
            ),
          );
          return;
        }

        const approvedScopes = new Set((response.scope ?? "").split(/\s+/).filter(Boolean));
        if (!approvedScopes.has(ANALYTICS_READONLY_SCOPE)) {
          rejectOnce(
            new GoogleAnalyticsOAuthError(
              "scope",
              "Google Analytics 읽기 권한이 포함되지 않았습니다.",
            ),
          );
          return;
        }

        const accessToken = response.access_token?.trim() ?? "";
        const expiresInSeconds = response.expires_in ?? 0;
        if (!accessToken || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
          rejectOnce(
            new GoogleAnalyticsOAuthError(
              "unavailable",
              "Google Analytics 연결 응답이 올바르지 않습니다.",
            ),
          );
          return;
        }

        settled = true;
        resolve({ accessToken, expiresInSeconds });
      },
      error_callback: (error) => rejectOnce(mapClientError(error)),
    });

    tokenClient.requestAccessToken({
      prompt: "consent",
      scope: ANALYTICS_READONLY_SCOPE,
      include_granted_scopes: false,
    });
  });
}

export function __resetGoogleAnalyticsOAuthForTests(): void {
  gisLoader = null;
}
