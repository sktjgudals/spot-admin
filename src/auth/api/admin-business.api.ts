import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";

export type BusinessKind = "INDIVIDUAL" | "COMPANY";
export type BusinessStatus =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "DISABLED";

export type AdminBusiness = {
  id: string;
  name: string;
  kind: BusinessKind;
  description: string | null;
  tagline: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  businessNumber: string | null;
  status: BusinessStatus;
  feeRateBps: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBusinessInput = {
  name: string;
  kind?: BusinessKind;
  description?: string;
  tagline?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  businessNumber?: string;
  feeRateBps?: number;
};

export type UpdateBusinessInput = Partial<CreateBusinessInput> & {
  status?: BusinessStatus;
};

export type ListBusinessesParams = {
  includeDeleted?: boolean;
  status?: BusinessStatus;
};

function listQuery(params?: ListBusinessesParams): string {
  const q = new URLSearchParams();
  if (params?.includeDeleted) q.set("includeDeleted", "true");
  if (params?.status) q.set("status", params.status);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listBusinesses(
  params?: ListBusinessesParams,
): Promise<AdminBusiness[]> {
  return adminFetchJson<AdminBusiness[]>(
    `${NestAdminApi.businesses()}${listQuery(params)}`,
  );
}

export async function getBusiness(
  id: string,
  opts?: { includeDeleted?: boolean },
): Promise<AdminBusiness> {
  const q = opts?.includeDeleted ? "?includeDeleted=true" : "";
  return adminFetchJson<AdminBusiness>(`${NestAdminApi.business(id)}${q}`);
}

export async function createBusiness(
  input: CreateBusinessInput,
): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.businesses(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBusiness(
  id: string,
  input: UpdateBusinessInput,
): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.business(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function softDeleteBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.business(id), {
    method: "DELETE",
  });
}

export async function disableBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.businessDisable(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function enableBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.businessEnable(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restoreBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(NestAdminApi.businessRestore(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export const businessQueryKeys = {
  all: ["admin", "businesses"] as const,
  list: (params?: ListBusinessesParams) =>
    [...businessQueryKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...businessQueryKeys.all, "detail", id] as const,
};
