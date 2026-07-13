import type { QueryClient } from "@tanstack/react-query";

/**
 * Clears client query cache and hard-navigates so Next.js Router Cache
 * cannot keep the previous account's RSC payload.
 */
export async function clearSessionAndRedirect(options: {
  // next-auth signOut is overloaded; accept a loose callable for DI/tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signOut: (options?: any) => Promise<unknown>;
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

  await signOut({ redirect: false });
  queryClient.clear();
  assign(href);
}

/**
 * Drop any previous account's client cache before entering a new session.
 */
export function clearQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
}
