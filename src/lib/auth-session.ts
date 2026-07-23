import type { QueryClient } from "@tanstack/react-query";

/**
 * Clears client query cache and hard-navigates so Router Cache
 * cannot keep the previous account's payload.
 * Auth v2 logout is handled by AdminAuthProvider — this is a shared helper.
 */
export async function clearSessionAndRedirect(options: {
  /** Optional server logout hook (Auth v2 provider usually calls Nest first) */
  signOut?: (options?: { redirect?: boolean }) => Promise<unknown>;
  queryClient: QueryClient;
  assign?: (url: string) => void;
  href?: string;
}): Promise<void> {
  const {
    signOut,
    queryClient,
    assign = (url) => {
      window.location.assign(url);
    },
    href = "/login",
  } = options;

  if (signOut) {
    try {
      await signOut({ redirect: false });
    } catch {
      /* still clear local */
    }
  }
  queryClient.clear();
  assign(href);
}

/**
 * Drop any previous account's client cache before entering a new session.
 */
export function clearQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
}
