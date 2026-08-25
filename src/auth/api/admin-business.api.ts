import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";

export type BusinessKind = "INDIVIDUAL" | "COMPANY";
export type BusinessStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";

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

export type BusinessAdminCandidate = {
  id: string;
  email: string | null;
  nickname: string;
  profileImage: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE";
  assignedBusinessId: string | null;
};

export type BusinessAdminAssignment = {
  userId: string;
  email: string | null;
  nickname: string;
  role: "BUSINESS_ADMIN";
  businessId: string;
  businessName: string;
  relationshipId: string;
  assignedAt: string;
  alreadyAssigned: boolean;
};

export type CommerceProfileStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type CommercePaymentMode = "TEST" | "LIVE";
export type CommerceRuntimeMode = "DISABLED" | CommercePaymentMode;
export type CommerceSalesModel = "DIRECT" | "PAYOUT_AGENCY";

export type BusinessCommerceProfile = {
  businessId: string;
  status: CommerceProfileStatus;
  paymentMode: CommercePaymentMode;
  salesModel: CommerceSalesModel;
  maxAmount: number;
  salesUrl: string;
  refundUrl: string;
  approvedByUserId: string | null;
  approvedAt: number | null;
  pausedByUserId: string | null;
  pausedAt: number | null;
  pauseReason: string | null;
  updatedByUserId: string;
  createdAt: number;
  updatedAt: number;
};

export type BusinessCommerceReadiness = {
  businessId: string;
  businessName: string;
  businessActive: boolean;
  businessDisclosureComplete: boolean;
  refundPolicyPublished: boolean;
  payoutSellerStatus: string | null;
  payoutSellerApproved: boolean;
  payoutAccountReady: boolean;
  oldestUnresolvedPayoutAt: number | null;
};

export type BusinessCommerceRuntime = {
  environment: string;
  paymentMode: CommercePaymentMode | null;
  paymentKeysValid: boolean;
  paymentKeyReasonCode: string | null;
  payoutMode: CommerceRuntimeMode;
  contractMaxAmount: number | null;
  newPaymentsEnabled: boolean;
  externalHostPaymentsEnabled: boolean;
};

export type BusinessCommerceOverview = {
  profile: BusinessCommerceProfile | null;
  readiness: BusinessCommerceReadiness;
  missingRequirements: string[];
  /** Exact server-side activation gate. Optional only for rolling deployment compatibility. */
  activationBlockers?: string[];
  runtime: BusinessCommerceRuntime;
  auditId?: string;
};

export type UpdateBusinessCommerceInput = {
  paymentMode: CommercePaymentMode;
  salesModel: CommerceSalesModel;
  maxAmount: number;
  salesUrl: string;
  refundUrl: string;
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
  const response = await adminFetchJson<
    AdminBusiness[] | { items: AdminBusiness[] }
  >(`${AdminApi.businesses()}${listQuery(params)}`);
  return Array.isArray(response) ? response : response.items;
}

export async function getBusiness(
  id: string,
  opts?: { includeDeleted?: boolean },
): Promise<AdminBusiness> {
  const q = opts?.includeDeleted ? "?includeDeleted=true" : "";
  const response = await adminFetchJson<
    AdminBusiness | { resource: AdminBusiness }
  >(`${AdminApi.business(id)}${q}`);
  return "resource" in response ? response.resource : response;
}

export async function createBusiness(
  input: CreateBusinessInput,
): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.businesses(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBusiness(
  id: string,
  input: UpdateBusinessInput,
): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.business(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function softDeleteBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.business(id), {
    method: "DELETE",
  });
}

export async function disableBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.businessDisable(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function enableBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.businessEnable(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function restoreBusiness(id: string): Promise<AdminBusiness> {
  return adminFetchJson<AdminBusiness>(AdminApi.businessRestore(id), {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getBusinessCommerce(
  id: string,
): Promise<BusinessCommerceOverview> {
  return adminFetchJson<BusinessCommerceOverview>(
    AdminApi.businessCommerce(id),
  );
}

export async function updateBusinessCommerce(
  id: string,
  input: UpdateBusinessCommerceInput,
): Promise<BusinessCommerceOverview> {
  return adminFetchJson<BusinessCommerceOverview>(
    AdminApi.businessCommerce(id),
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function activateBusinessCommerce(
  id: string,
): Promise<BusinessCommerceOverview> {
  return adminFetchJson<BusinessCommerceOverview>(
    AdminApi.businessCommerceActivate(id),
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function pauseBusinessCommerce(
  id: string,
  reason: string,
): Promise<BusinessCommerceOverview> {
  return adminFetchJson<BusinessCommerceOverview>(
    AdminApi.businessCommercePause(id),
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function searchBusinessAdminCandidates(query: string): Promise<{
  items: BusinessAdminCandidate[];
  nextCursor: string | null;
  asOf: string;
}> {
  const params = new URLSearchParams({ q: query.trim(), limit: "20" });
  return adminFetchJson(
    AdminApi.businessOperatorCandidates() + `?${params.toString()}`,
  );
}

export async function assignBusinessAdmin(
  businessId: string,
  userId: string,
): Promise<{ assignment: BusinessAdminAssignment; auditId: string }> {
  return adminFetchJson(AdminApi.businessOperators(businessId), {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export const businessQueryKeys = {
  all: ["admin", "businesses"] as const,
  list: (params?: ListBusinessesParams) =>
    [...businessQueryKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...businessQueryKeys.all, "detail", id] as const,
  commerce: (id: string) =>
    [...businessQueryKeys.all, "detail", id, "commerce"] as const,
  operatorCandidates: (query: string) =>
    [...businessQueryKeys.all, "operator-candidates", query] as const,
};
