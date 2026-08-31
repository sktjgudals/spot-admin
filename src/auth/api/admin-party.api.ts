import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";
import { adminQueryKeys, type PartyAdminScope } from "@/auth/model/admin-query-keys";

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
  status: "FIXED" | "ACTIVE" | "HIDDEN";
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

export type OperatorPartyLifecycle = "ALL" | "PENDING" | "OPEN" | "CLOSED";

export type AdminPartyPage = {
  items: AdminParty[];
  /** Opaque backend cursor. Pass it back verbatim and never parse it. */
  nextCursor: string | null;
};

export type { PartyAdminScope };

export async function listParties(
  businessId: string,
  scope: PartyAdminScope = "business",
): Promise<AdminParty[]> {
  const path = scope === "super" ? AdminApi.parties(businessId) : AdminApi.myParties();
  const rows = await adminFetchJson<Partial<AdminParty>[]>(path);
  return rows.map((row) => normalizeParty(row, businessId));
}

/**
 * Cursor-paged BUSINESS_ADMIN home list.
 *
 * The legacy `/businesses/me/parties` response is a bare array capped at 200
 * for shipped clients. The dedicated operator endpoint is the scalable list
 * contract and keeps the precise status on each row while accepting a coarse
 * lifecycle bucket for the home tabs.
 */
export async function listOperatorPartyPage(
  businessId: string,
  params: {
    lifecycle?: OperatorPartyLifecycle;
    limit?: number;
    cursor?: string;
  } = {},
): Promise<AdminPartyPage> {
  const query = new URLSearchParams();
  query.set("lifecycle", params.lifecycle ?? "ALL");
  query.set("limit", String(params.limit ?? 50));
  if (params.cursor) query.set("cursor", params.cursor);

  const page = await adminFetchJson<{
    items: Partial<AdminParty>[];
    nextCursor: string | null;
  }>(`/businesses/me/operator-parties?${query.toString()}`);

  return {
    items: page.items.map((row) => normalizeParty(row, businessId)),
    nextCursor: page.nextCursor,
  };
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
    scope === "super" ? AdminApi.party(partyId) : AdminApi.myParty(partyId),
  );
  return normalizeParty(row, typeof row.businessId === "string" ? row.businessId : "");
}

export async function createParty(
  businessId: string,
  input: CreatePartyInput,
  scope: PartyAdminScope = "business",
): Promise<AdminParty> {
  const path = scope === "super" ? AdminApi.parties(businessId) : AdminApi.myParties();
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
    scope === "super" ? AdminApi.party(partyId) : AdminApi.myParty(partyId),
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
  await adminFetchJson<unknown>(AdminApi.partyTransitions(partyId, scope), {
    method: "POST",
    body: JSON.stringify(input),
  });
  return getParty(partyId, scope);
}

export async function getPartyStatusHistory(
  partyId: string,
  scope: PartyAdminScope = "business",
): Promise<PartyStatusTransition[]> {
  return adminFetchJson<PartyStatusTransition[]>(
    AdminApi.partyStatusHistory(partyId, scope),
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

export const partyQueryKeys = adminQueryKeys.parties;
