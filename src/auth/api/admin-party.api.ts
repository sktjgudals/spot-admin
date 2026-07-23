import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";

export type AdmissionMode = "INSTANT" | "APPROVAL";

export type AdminParty = {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  maxCapacity: number;
  currentCount: number;
  isActive: boolean;
  closedAt: string | null;
  coverImage: string | null;
  priceMale: number;
  priceFemale: number;
  admissionMode: AdmissionMode;
  categoryId: string | null;
  placeName: string | null;
  address: string | null;
  businessId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyInput = {
  title: string;
  description: string;
  date: string;
  location: string;
  maxCapacity: number;
  coverImage?: string;
  priceMale?: number;
  priceFemale?: number;
  admissionMode?: AdmissionMode;
  categoryId?: string;
  placeName?: string;
  address?: string;
};

export type UpdatePartyInput = Partial<CreatePartyInput> & {
  isActive?: boolean;
};

export async function listParties(businessId: string): Promise<AdminParty[]> {
  return adminFetchJson<AdminParty[]>(NestAdminApi.parties(businessId));
}

export async function getParty(partyId: string): Promise<AdminParty> {
  return adminFetchJson<AdminParty>(NestAdminApi.party(partyId));
}

export async function createParty(
  businessId: string,
  input: CreatePartyInput,
): Promise<AdminParty> {
  return adminFetchJson<AdminParty>(NestAdminApi.parties(businessId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateParty(
  partyId: string,
  input: UpdatePartyInput,
): Promise<AdminParty> {
  return adminFetchJson<AdminParty>(NestAdminApi.party(partyId), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Soft-close (isActive=false). */
export async function softCloseParty(partyId: string): Promise<AdminParty> {
  return adminFetchJson<AdminParty>(NestAdminApi.party(partyId), {
    method: "DELETE",
  });
}

export const partyQueryKeys = {
  all: ["admin", "parties"] as const,
  list: (businessId: string) =>
    [...partyQueryKeys.all, "list", businessId] as const,
  detail: (partyId: string) =>
    [...partyQueryKeys.all, "detail", partyId] as const,
};
