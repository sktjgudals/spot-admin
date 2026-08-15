import { adminFetchJson } from "@/auth/api/admin-http";
import { AdminApi } from "@/auth/model/admin-routes";

export type BusinessUserReviewTag = {
  id: string;
  label: string;
  polarity: "POSITIVE" | "CAUTION";
  sortOrder: number;
  isActive?: boolean;
};

export type ReviewableMember = {
  applicationId: string;
  userId: string;
  nickname: string;
  profileImage: string | null;
  attendance: "ATTENDED" | "NO_SHOW";
  review: null | {
    id: string;
    score: number;
    memo: string | null;
    tagIds: string[];
    editableUntil: string;
    canEdit: boolean;
    updatedAt: string;
  };
};

export type ReviewableMembersResponse = {
  party: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    operationalStatus: "COMPLETED";
  };
  members: ReviewableMember[];
};

export type BusinessUserReview = {
  id: string;
  score: number;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  editableUntil: string;
  source: {
    businessId: string;
    businessName: string;
    partyId: string;
    partyTitle: string;
    startsAt: string;
    endsAt: string;
  };
  tags: BusinessUserReviewTag[];
};

export type BusinessUserReviewHistory = {
  summary: { averageScore: number | null; reviewCount: number };
  recent: BusinessUserReview[];
  data: BusinessUserReview[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function listBusinessUserReviewTags() {
  return adminFetchJson<BusinessUserReviewTag[]>(AdminApi.businessUserReviewTags());
}

export function getReviewableMembers(partyId: string) {
  return adminFetchJson<ReviewableMembersResponse>(AdminApi.reviewableMembers(partyId));
}

export function createBusinessUserReview(
  partyId: string,
  targetUserId: string,
  input: { score: number; tagIds: string[]; memo?: string },
) {
  return adminFetchJson<BusinessUserReview>(
    AdminApi.businessUserReview(partyId, targetUserId),
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateBusinessUserReview(
  partyId: string,
  targetUserId: string,
  input: { score?: number; tagIds?: string[]; memo?: string | null },
) {
  return adminFetchJson<BusinessUserReview>(
    AdminApi.businessUserReview(partyId, targetUserId),
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function getApplicationBusinessUserReviews(applicationId: string, cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return adminFetchJson<BusinessUserReviewHistory>(
    `${AdminApi.applicationUserReviews(applicationId)}${query}`,
  );
}

export function listAllBusinessUserReviewTags() {
  return adminFetchJson<Required<BusinessUserReviewTag>[]>(
    AdminApi.superBusinessUserReviewTags(),
  );
}

export function createBusinessUserReviewTag(input: {
  label: string;
  polarity: "POSITIVE" | "CAUTION";
  sortOrder: number;
  isActive: boolean;
}) {
  return adminFetchJson<Required<BusinessUserReviewTag>>(
    AdminApi.superBusinessUserReviewTags(),
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateBusinessUserReviewTag(
  tagId: string,
  input: Partial<{
    label: string;
    polarity: "POSITIVE" | "CAUTION";
    sortOrder: number;
    isActive: boolean;
  }>,
) {
  return adminFetchJson<Required<BusinessUserReviewTag>>(
    AdminApi.superBusinessUserReviewTag(tagId),
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function moderateBusinessUserReview(
  reviewId: string,
  input: {
    reason: string;
    hidden?: boolean;
    score?: number;
    tagIds?: string[];
    memo?: string | null;
  },
) {
  return adminFetchJson<BusinessUserReview>(
    AdminApi.superBusinessUserReview(reviewId),
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export const businessUserReviewQueryKeys = {
  tags: ["admin", "business-user-review-tags"] as const,
  members: (partyId: string) => ["admin", "party-reviewable-members", partyId] as const,
  history: (applicationId: string) => ["admin", "application-user-reviews", applicationId] as const,
  superTags: ["admin", "super", "business-user-review-tags"] as const,
};
