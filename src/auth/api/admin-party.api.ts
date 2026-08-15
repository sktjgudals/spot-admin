import { adminFetchJson } from "@/auth/api/admin-http";

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
  applicationDeadline: string;
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
  applicationDeadline?: string;
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

export type PartyAdminScope = "business" | "super";

export async function listParties(
  businessId: string,
  scope: PartyAdminScope = "business",
): Promise<AdminParty[]> {
  const path = scope === "super"
    ? `/admin/v2/businesses/${encodeURIComponent(businessId)}/parties`
    : "/businesses/me/parties";
  const rows = await adminFetchJson<Partial<AdminParty>[]>(path);
  return rows.map((row) => normalizeParty(row, businessId));
}

export async function listPartyCategories(): Promise<PartyCategory[]> {
  const result = await adminFetchJson<{ categories: PartyCategory[] }>(
    "/party-categories",
  );
  return result.categories;
}

export async function getParty(
  partyId: string,
  scope: PartyAdminScope = "business",
): Promise<AdminParty> {
  const row = await adminFetchJson<Partial<AdminParty>>(
    scope === "super"
      ? `/admin/v2/parties/${encodeURIComponent(partyId)}`
      : `/businesses/me/parties/${encodeURIComponent(partyId)}`,
  );
  return normalizeParty(row, typeof row.businessId === "string" ? row.businessId : "");
}

export async function createParty(
  businessId: string,
  input: CreatePartyInput,
  scope: PartyAdminScope = "business",
): Promise<AdminParty> {
  const path = scope === "super"
    ? `/admin/v2/businesses/${encodeURIComponent(businessId)}/parties`
    : "/businesses/me/parties";
  const row = await adminFetchJson<Partial<AdminParty>>(path, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return normalizeParty(row, businessId);
}

export async function updateParty(
  partyId: string,
  input: UpdatePartyInput,
  scope: PartyAdminScope = "business",
): Promise<AdminParty> {
  const row = await adminFetchJson<Partial<AdminParty>>(
    scope === "super"
      ? `/admin/v2/parties/${encodeURIComponent(partyId)}`
      : `/businesses/me/parties/${encodeURIComponent(partyId)}`,
    {
    method: "PATCH",
    body: JSON.stringify(input),
    },
  );
  return normalizeParty(row, typeof row.businessId === "string" ? row.businessId : "");
}

export async function transitionParty(
  partyId: string,
  input: {
    toStatus: PartyOperationalStatus;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  },
  scope: PartyAdminScope = "business",
): Promise<AdminParty> {
  const prefix = scope === "super" ? "/admin/v2" : "";
  await adminFetchJson<unknown>(`${prefix}/parties/${encodeURIComponent(partyId)}/transitions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return getParty(partyId, scope);
}

export async function getPartyStatusHistory(
  partyId: string,
  scope: PartyAdminScope = "business",
): Promise<PartyStatusTransition[]> {
  const prefix = scope === "super" ? "/admin/v2" : "";
  return adminFetchJson<PartyStatusTransition[]>(
    `${prefix}/parties/${encodeURIComponent(partyId)}/status-history`,
  );
}

function normalizeParty(
  raw: Partial<AdminParty>,
  fallbackBusinessId: string,
): AdminParty {
  const startsAt = raw.startsAt ?? raw.date ?? new Date(0).toISOString();
  const endsAt = raw.endsAt ?? startsAt;
  return {
    id: raw.id ?? "",
    title: raw.title ?? "",
    description: raw.description ?? "",
    date: raw.date ?? startsAt,
    startsAt,
    endsAt,
    applicationDeadline: raw.applicationDeadline ?? startsAt,
    operationalStatus: raw.operationalStatus ?? "DRAFT",
    operationalVersion: raw.operationalVersion ?? 0,
    completedAt: raw.completedAt ?? null,
    cancelledAt: raw.cancelledAt ?? null,
    interestLimit: raw.interestLimit ?? 3,
    allowedTransitions: raw.allowedTransitions ?? [],
    canBusinessReview: raw.canBusinessReview ?? false,
    location: raw.location ?? "",
    maxCapacity: raw.maxCapacity ?? 0,
    currentCount: raw.currentCount ?? 0,
    pendingApplicationCount: raw.pendingApplicationCount ?? 0,
    approvedApplicationCount: raw.approvedApplicationCount ?? 0,
    isActive: raw.isActive ?? false,
    closedAt: raw.closedAt ?? null,
    coverImage: raw.coverImage ?? null,
    images: raw.images ?? [],
    priceMale: raw.priceMale ?? 0,
    priceFemale: raw.priceFemale ?? 0,
    admissionMode: raw.admissionMode ?? "APPROVAL",
    categoryId: raw.categoryId ?? null,
    placeName: raw.placeName ?? null,
    address: raw.address ?? null,
    placeLatitude: raw.placeLatitude ?? null,
    placeLongitude: raw.placeLongitude ?? null,
    placeKakaoId: raw.placeKakaoId ?? null,
    genderRatio: raw.genderRatio ?? null,
    maxMale: raw.maxMale ?? null,
    maxFemale: raw.maxFemale ?? null,
    minMale: raw.minMale ?? null,
    minFemale: raw.minFemale ?? null,
    minBirthYear: raw.minBirthYear ?? null,
    maxBirthYear: raw.maxBirthYear ?? null,
    inclusions: raw.inclusions ?? [],
    faqs: raw.faqs ?? [],
    businessId: raw.businessId ?? fallbackBusinessId,
    createdAt: raw.createdAt ?? startsAt,
    updatedAt: raw.updatedAt ?? startsAt,
  };
}

export const partyQueryKeys = {
  all: ["admin", "parties"] as const,
  categories: ["admin", "party-categories"] as const,
  list: (businessId: string) =>
    [...partyQueryKeys.all, "list", businessId] as const,
  detail: (partyId: string) =>
    [...partyQueryKeys.all, "detail", partyId] as const,
};
