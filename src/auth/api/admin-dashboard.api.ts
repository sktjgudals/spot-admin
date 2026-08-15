import { adminFetchJson } from "@/auth/api/admin-http";

export type AdminDashboardSummary = {
  asOf: string;
  users: { total: number; blocked: number };
  businesses: { total: number; pending: number };
  parties: { total: number };
};

export function fetchAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  return adminFetchJson<AdminDashboardSummary>("/admin/v2/dashboard/summary", {
    method: "GET",
  });
}
