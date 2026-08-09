import { adminFetchJson } from "@/auth/api/admin-http";
import { NestAdminApi } from "@/auth/model/admin-routes";

export type AdmissionMode = "INSTANT" | "APPROVAL";
export type PartyOperationalStatus =
  | "DRAFT"
  | "RECRUITING"
  | "CONFIRMED"
  | "CHECKIN_OPEN"
  | "LIVE"
  | "INTEREST_OPEN"
  | "INTEREST_CLOSED"
  | "MATCH_PENDING"
  | "MATCH_REVEALED"
  | "AFTER_PARTY"
  | "COMPLETED"
  | "CANCELLED";

export type AdminPartyInclusion = {
  id: string;
  label: string;
  sortOrder: number;
};

export type AdminPartyFaq = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

export type PartyCategory = {
  id: string;
  name: string;
  status: "FIXED" | "NORMAL";
  sortOrder: number;
  iconUrl: string | null;
};

export type AdminParty = {
  id: string;
  title: string;
  description: string;
  date: string;
  startsAt: string;
  endsAt: string;
  operationalStatus: PartyOperationalStatus;
  operationalVersion: number;
  completedAt: string | null;
  cancelledAt: string | null;
  interestLimit: number;
  allowedTransitions: PartyOperationalStatus[];
  canBusinessReview: boolean;
  location: string;
  maxCapacity: number;
  currentCount: number;
  pendingApplicationCount?: number;
  approvedApplicationCount?: number;
  isActive: boolean;
  closedAt: string | null;
  coverImage: string | null;
  images: string[];
  priceMale: number;
  priceFemale: number;
  admissionMode: AdmissionMode;
  categoryId: string | null;
  placeName: string | null;
  address: string | null;
  placeLatitude?: number | null;
  placeLongitude?: number | null;
  placeKakaoId?: string | null;
  genderRatio?: string | null;
  maxMale?: number | null;
  maxFemale?: number | null;
  minMale?: number | null;
  minFemale?: number | null;
  minBirthYear?: number | null;
  maxBirthYear?: number | null;
  inclusions: AdminPartyInclusion[];
  faqs: AdminPartyFaq[];
  businessId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyInput = {
  title: string;
  description: string;
  date: string;
  endsAt: string;
  location: string;
  maxCapacity: number;
  coverImage?: string;
  images?: string[];
  priceMale?: number;
  priceFemale?: number;
  admissionMode?: AdmissionMode;
  categoryId?: string;
  placeName?: string;
  address?: string;
  placeLatitude?: number;
  placeLongitude?: number;
  placeKakaoId?: string;
  interestLimit?: number;
  genderRatio?: string;
  maxMale?: number | null;
  maxFemale?: number | null;
  minMale?: number | null;
  minFemale?: number | null;
  minBirthYear?: number | null;
  maxBirthYear?: number | null;
  inclusions?: Array<{ label: string }>;
  faqs?: Array<{ question: string; answer: string }>;
};

export type UpdatePartyInput = Partial<CreatePartyInput>;

export type PartyStatusTransition = {
  id: string;
  partyId: string;
  fromStatus: PartyOperationalStatus;
  toStatus: PartyOperationalStatus;
  version: number;
  actorType: "USER" | "ADMIN_ACCOUNT" | "SYSTEM";
  reason: string | null;
  createdAt: string;
};

export async function listParties(businessId: string): Promise<AdminParty[]> {
  return adminFetchJson<AdminParty[]>(NestAdminApi.parties(businessId));
}

export async function listPartyCategories(): Promise<PartyCategory[]> {
  const result = await adminFetchJson<{ categories: PartyCategory[] }>(
    "/party-categories",
  );
  return result.categories;
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

export async function transitionParty(
  partyId: string,
  input: {
    toStatus: PartyOperationalStatus;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  },
): Promise<AdminParty> {
  return adminFetchJson<AdminParty>(NestAdminApi.partyTransitions(partyId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getPartyStatusHistory(
  partyId: string,
): Promise<PartyStatusTransition[]> {
  return adminFetchJson<PartyStatusTransition[]>(NestAdminApi.partyStatusHistory(partyId));
}

export const partyQueryKeys = {
  all: ["admin", "parties"] as const,
  categories: ["admin", "party-categories"] as const,
  list: (businessId: string) =>
    [...partyQueryKeys.all, "list", businessId] as const,
  detail: (partyId: string) =>
    [...partyQueryKeys.all, "detail", partyId] as const,
};
