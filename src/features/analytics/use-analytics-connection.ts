"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { analyticsQueryKeys } from "./analytics-query-keys";
import {
  clearAnalyticsAccessToken,
  setAnalyticsAccessToken,
  type AnalyticsTokenSnapshot,
} from "./analytics-token-store";
import {
  GoogleAnalyticsOAuthError,
  loadGoogleAnalyticsIdentityServices,
  requestGoogleAnalyticsToken,
} from "./google-analytics-oauth";
import { useAnalyticsToken } from "./use-analytics-token";

export type AnalyticsConnection = {
  token: AnalyticsTokenSnapshot;
  connecting: boolean;
  connectionError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

/**
 * GA 연결 하나를 여러 화면이 나눠 쓴다.
 *
 * 언마운트할 때 토큰을 버리지 않는다. 분석 화면과 사용자 상세 화면을 오갈
 * 때마다 Google 동의 창이 다시 뜨면, 운영자는 조사를 멈추고 팝업을 처리한다.
 * 토큰의 수명은 관리자 세션이 쥐고 있다(analytics-token-store).
 */
export function useAnalyticsConnection({
  googleClientId,
  enabled,
}: {
  googleClientId: string;
  enabled: boolean;
}): AnalyticsConnection {
  const queryClient = useQueryClient();
  const token = useAnalyticsToken();
  const mountedRef = useRef(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (enabled && googleClientId.trim()) {
      void loadGoogleAnalyticsIdentityServices().catch(() => undefined);
    }
  }, [enabled, googleClientId]);

  useEffect(() => {
    if (token.status !== "connected") {
      void queryClient.cancelQueries({ queryKey: analyticsQueryKeys.all }).then(() => {
        queryClient.removeQueries({ queryKey: analyticsQueryKeys.all });
      });
    }
  }, [queryClient, token.status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const grant = await requestGoogleAnalyticsToken(googleClientId);
      // A grant that lands after the screen is gone is not this screen's to keep.
      if (!mountedRef.current) return;
      setAnalyticsAccessToken(grant);
    } catch (reason) {
      if (!mountedRef.current) return;
      setConnectionError(
        reason instanceof GoogleAnalyticsOAuthError
          ? reason.message
          : "Google Analytics 연결을 완료하지 못했습니다.",
      );
    } finally {
      if (mountedRef.current) setConnecting(false);
    }
  }, [googleClientId]);

  const disconnect = useCallback((): void => {
    clearAnalyticsAccessToken("disconnected");
    queryClient.removeQueries({ queryKey: analyticsQueryKeys.all });
  }, [queryClient]);

  return { token, connecting, connectionError, connect, disconnect };
}
