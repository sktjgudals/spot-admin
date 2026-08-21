import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";

export type AdminDashboardSummary = {
  asOf: string;
  users: { total: number; blocked: number };
  businesses: { total: number; pending: number };
  parties: { total: number };
};

export function fetchAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  return adminFetchJson<AdminDashboardSummary>(AdminApi.dashboard(), {
    method: "GET",
  });
}
