import { AdminAuthError } from "@/auth/model/admin-auth.errors";

/** React Query retries 5xx/network twice. Client and auth errors fail immediately. */
export function shouldRetryAdminQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof AdminAuthError) {
    if (error.permanent) return false;
    if (typeof error.status === "number" && error.status >= 400 && error.status < 500) {
      return false;
    }
  }
  return failureCount < 2;
}
