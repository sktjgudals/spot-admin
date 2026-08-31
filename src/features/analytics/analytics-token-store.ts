export type AnalyticsTokenStatus = "disconnected" | "connected" | "expired";

export type AnalyticsTokenSnapshot = {
  status: AnalyticsTokenStatus;
  expiresAt: number | null;
  generation: number;
};

type AnalyticsTokenGrant = {
  accessToken: string;
  expiresInSeconds: number;
};

const listeners = new Set<() => void>();
let accessToken: string | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let snapshot: AnalyticsTokenSnapshot = {
  status: "disconnected",
  expiresAt: null,
  generation: 0,
};

function notify(): void {
  listeners.forEach((listener) => listener());
}

function cancelExpiryTimer(): void {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function transition(status: AnalyticsTokenStatus, expiresAt: number | null): void {
  snapshot = {
    status,
    expiresAt,
    generation: snapshot.generation + 1,
  };
  notify();
}

export function setAnalyticsAccessToken(grant: AnalyticsTokenGrant): void {
  const token = grant.accessToken.trim();
  if (!token) throw new Error("Google Analytics access token is empty.");
  if (!Number.isFinite(grant.expiresInSeconds) || grant.expiresInSeconds <= 0) {
    throw new Error("Google Analytics access token expiry is invalid.");
  }

  cancelExpiryTimer();
  accessToken = token;
  const expiresAt = Date.now() + Math.floor(grant.expiresInSeconds * 1_000);
  transition("connected", expiresAt);
  expiryTimer = setTimeout(() => {
    accessToken = null;
    expiryTimer = null;
    transition("expired", null);
  }, Math.max(0, expiresAt - Date.now()));
}

export function clearAnalyticsAccessToken(
  reason: Exclude<AnalyticsTokenStatus, "connected"> = "disconnected",
): void {
  cancelExpiryTimer();
  accessToken = null;
  transition(reason, null);
}

/** Access tokens never leave this module except for the immediate API request. */
export function getAnalyticsAccessToken(): string | null {
  if (snapshot.status === "connected" && snapshot.expiresAt !== null && snapshot.expiresAt <= Date.now()) {
    clearAnalyticsAccessToken("expired");
  }
  return accessToken;
}

export function getAnalyticsTokenSnapshot(): AnalyticsTokenSnapshot {
  return snapshot;
}

export function subscribeAnalyticsToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function __resetAnalyticsTokenForTests(): void {
  cancelExpiryTimer();
  accessToken = null;
  listeners.clear();
  snapshot = {
    status: "disconnected",
    expiresAt: null,
    generation: 0,
  };
}

