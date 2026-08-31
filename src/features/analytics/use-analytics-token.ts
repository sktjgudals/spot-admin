"use client";

import { useSyncExternalStore } from "react";
import {
  getAnalyticsTokenSnapshot,
  subscribeAnalyticsToken,
  type AnalyticsTokenSnapshot,
} from "./analytics-token-store";

const SERVER_SNAPSHOT: AnalyticsTokenSnapshot = {
  status: "disconnected",
  expiresAt: null,
  generation: 0,
};

export function useAnalyticsToken(): AnalyticsTokenSnapshot {
  return useSyncExternalStore(
    subscribeAnalyticsToken,
    getAnalyticsTokenSnapshot,
    () => SERVER_SNAPSHOT,
  );
}
