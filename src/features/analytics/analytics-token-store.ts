import {
  getAdminSessionGeneration,
  subscribeAccessToken,
} from "@/auth/store/admin-auth.store";

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

/**
 * 이 토큰은 화면이 아니라 관리자 세션에 묶인다.
 *
 * 예전에는 /super-admin/analytics를 벗어나면 토큰을 버렸다. 그래서 사용자 상세
 * 화면처럼 GA를 곁들여 쓰는 화면마다 다시 Google 동의 창을 띄워야 했다. 지금은
 * 탭이 살아 있는 동안 유지하되, 다른 관리자로 바뀌면 버린다 — 앞사람의 Google
 * 권한으로 뒷사람이 보고서를 읽는 일이 없어야 한다. 세션이 바뀐 직후의 다음
 * 읽기(getAnalyticsAccessToken/getAnalyticsTokenSnapshot) 또는 구독 시점에
 * 정리되고, 분석 화면이 하나라도 마운트되어 있는 동안에는 즉시 정리된다.
 */
let boundAdminGeneration: number | null = null;
let unsubscribeAdminSession: (() => void) | null = null;

function adminSessionChanged(): boolean {
  return (
    boundAdminGeneration !== null &&
    boundAdminGeneration !== getAdminSessionGeneration()
  );
}

/**
 * 관리자 세션이 바뀌었으면 토큰을 정리한다.
 *
 * `getAnalyticsAccessToken`만 이 검사를 하면 부족하다. `getAnalyticsTokenSnapshot`
 * (useAnalyticsToken이 useSyncExternalStore로 읽는 값)이 검사하지 않으면, 구독자가
 * 없는 동안 세션이 바뀌었을 때 뒤늦게 마운트한 화면이 여전히 "connected"와 낡은
 * generation을 읽는다 — react-query 캐시가 staleTime 안에 있으면 그 값으로 오래된
 * 보고서를 그대로 보여주면서 getAnalyticsAccessToken을 한 번도 호출하지 않을 수
 * 있다. 그래서 읽기·구독 두 경로 모두에서 이 함수를 호출한다.
 */
function reconcileAdminSession(): void {
  if (adminSessionChanged()) {
    clearAnalyticsAccessToken("disconnected");
  }
}

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
  boundAdminGeneration = getAdminSessionGeneration();
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
  boundAdminGeneration = null;
  transition(reason, null);
}

/** Access tokens never leave this module except for the immediate API request. */
export function getAnalyticsAccessToken(): string | null {
  reconcileAdminSession();
  if (
    snapshot.status === "connected" &&
    snapshot.expiresAt !== null &&
    snapshot.expiresAt <= Date.now()
  ) {
    clearAnalyticsAccessToken("expired");
  }
  return accessToken;
}

export function getAnalyticsTokenSnapshot(): AnalyticsTokenSnapshot {
  reconcileAdminSession();
  return snapshot;
}

export function subscribeAnalyticsToken(listener: () => void): () => void {
  if (listeners.size === 0 && unsubscribeAdminSession === null) {
    reconcileAdminSession();
    unsubscribeAdminSession = subscribeAccessToken(() => {
      if (adminSessionChanged()) clearAnalyticsAccessToken("disconnected");
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeAdminSession?.();
      unsubscribeAdminSession = null;
    }
  };
}

export function __resetAnalyticsTokenForTests(): void {
  cancelExpiryTimer();
  accessToken = null;
  boundAdminGeneration = null;
  unsubscribeAdminSession?.();
  unsubscribeAdminSession = null;
  listeners.clear();
  snapshot = {
    status: "disconnected",
    expiresAt: null,
    generation: 0,
  };
}

