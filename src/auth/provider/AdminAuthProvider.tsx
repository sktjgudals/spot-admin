"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminMe,
  loginWithPassword,
  logoutSession,
} from "@/auth/api/admin-auth.api";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/auth/store/admin-auth.store";
import {
  ensureAccessToken,
  refreshAccessToken,
  assertRefreshFailedUnauthorized,
} from "@/auth/refresh/refresh-single-flight";
import {
  homePathForRole,
  toAdminProfile,
  type AdminAuthState,
  type AdminProfile,
  type AdminWebRole,
} from "@/auth/model/admin-auth.types";
import {
  AdminAuthError,
  isNetworkError,
} from "@/auth/model/admin-auth.errors";

type AdminAuthContextValue = AdminAuthState & {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AdminWebRole>;
  logout: () => Promise<void>;
  retryBoot: () => Promise<void>;
  /** Home path for current role */
  homePath: string | null;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const initial: AdminAuthState = {
  status: "booting",
  accessToken: null,
  admin: null,
  bootError: null,
};

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AdminAuthState>(initial);

  const applyAuthenticated = useCallback(
    (accessToken: string, admin: AdminProfile) => {
      setAccessToken(accessToken);
      setState({
        status: "authenticated",
        accessToken,
        admin,
        bootError: null,
      });
    },
    [],
  );

  const applyUnauthenticated = useCallback(() => {
    clearAccessToken();
    setState({
      status: "unauthenticated",
      accessToken: null,
      admin: null,
      bootError: null,
    });
  }, []);

  const boot = useCallback(async () => {
    setState((s) => ({ ...s, status: "booting", bootError: null }));
    try {
      const token = await ensureAccessToken();
      const me = await fetchAdminMe();
      const profile = toAdminProfile(me);
      if (!profile) {
        applyUnauthenticated();
        return;
      }
      applyAuthenticated(token, profile);
    } catch (err) {
      if (assertRefreshFailedUnauthorized(err) || isUnauthorized(err)) {
        applyUnauthenticated();
        return;
      }
      if (isNetworkError(err) || isServerError(err)) {
        // Do not treat as session expiry
        setState({
          status: "degraded",
          accessToken: getAccessToken(),
          admin: null,
          bootError:
            err instanceof AdminAuthError
              ? err.message
              : "일시적인 오류가 발생했습니다. 다시 시도하세요.",
        });
        return;
      }
      applyUnauthenticated();
    }
  }, [applyAuthenticated, applyUnauthenticated]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const login = useCallback(
    async (email: string, password: string, rememberMe = false) => {
      const res = await loginWithPassword({ email, password, rememberMe });
      setAccessToken(res.accessToken);
      const me = await fetchAdminMe();
      const profile = toAdminProfile(me) ?? toAdminProfile(res.admin);
      if (!profile) {
        clearAccessToken();
        throw new AdminAuthError(
          "UNSUPPORTED_ROLE",
          "이 역할은 Admin Web에서 지원하지 않습니다",
          { permanent: true },
        );
      }
      queryClient.clear();
      applyAuthenticated(res.accessToken, profile);
      return profile.role;
    },
    [applyAuthenticated, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch (err) {
      // Still clear local state; log server failure
      console.error("[AdminAuth] logout API failed", err);
    } finally {
      clearAccessToken();
      queryClient.clear();
      setState({
        status: "unauthenticated",
        accessToken: null,
        admin: null,
        bootError: null,
      });
    }
  }, [queryClient]);

  const value = useMemo<AdminAuthContextValue>(() => {
    const homePath = state.admin ? homePathForRole(state.admin.role) : null;
    return {
      ...state,
      login,
      logout,
      retryBoot: boot,
      homePath,
    };
  }, [state, login, logout, boot]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

function isUnauthorized(err: unknown): boolean {
  return (
    err instanceof AdminAuthError &&
    (err.status === 401 || err.status === 403 || err.code === "UNAUTHORIZED")
  );
}

function isServerError(err: unknown): boolean {
  return (
    err instanceof AdminAuthError &&
    typeof err.status === "number" &&
    err.status >= 500
  );
}

export function useAdminAuthContext(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuthContext must be used within AdminAuthProvider");
  }
  return ctx;
}

/** Optional for components outside provider during tests */
export function useAdminAuthContextOptional(): AdminAuthContextValue | null {
  return useContext(AdminAuthContext);
}

// re-export refresh for interceptor tests
export { refreshAccessToken };
