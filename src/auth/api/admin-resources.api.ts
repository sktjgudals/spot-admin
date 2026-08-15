import { adminFetchJson, type AdminFetchInit } from "@/auth/api/admin-http";

export type AdminResource = Record<string, unknown> & { id: string };

export type AdminResourcePage<T extends AdminResource = AdminResource> = {
  items: T[];
  nextCursor: string | null;
  asOf: string;
};

export async function listAdminResources(
  resource: string,
  params: { q?: string; status?: string; cursor?: string; limit?: number } = {},
): Promise<AdminResourcePage> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.cursor) query.set("cursor", params.cursor);
  query.set("limit", String(params.limit ?? 50));
  return adminFetchJson<AdminResourcePage>(
    `/admin/v2/${resource}?${query.toString()}`,
  );
}

export function mutateAdminResource<T = AdminResource>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
): Promise<T> {
  const init: AdminFetchInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  return adminFetchJson<T>(path, init);
}
