import { adminFetchJson } from "@/auth/api/admin-http";
import { uuidV7 } from "@/lib/uuid-v7";

export type PendingApplication = {
  applicationId: string;
  userId: string;
  nickname: string;
  profileImage?: string | null;
  averageRating?: number | null;
  appliedAt: string;
  gender?: "MALE" | "FEMALE" | null;
  birthYear?: number | null;
};

export type OperatorPartyDetail = {
  id: string;
  title: string;
  location: string;
  date: string;
  startsAt: string;
  pendingApplications: PendingApplication[];
};

export type CheckInParticipant = {
  userId: string;
  nickname: string;
  profileImage: string | null;
  checkedIn: boolean;
  lastEventType: string | null;
  lastEventAt: string | null;
  lastMethod: string | null;
  gender?: "MALE" | "FEMALE" | null;
  birthYear?: number | null;
};

export type CheckInStatus = {
  partyId: string;
  confirmedCount: number;
  checkedInCount: number;
  checkedOutCount: number;
  noShowCount: number;
  notCheckedInCount: number;
  truncated: boolean;
  participants: CheckInParticipant[];
};

export function getOperatorPartyDetail(partyId: string) {
  return adminFetchJson<OperatorPartyDetail>(`/parties/${encodeURIComponent(partyId)}`);
}

export function reviewPartyApplication(input: {
  partyId: string;
  applicationId: string;
  status: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  return adminFetchJson<{ success?: boolean; message?: string; status?: string }>(
    "/parties/applications/status",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function getCheckInStatus(partyId: string) {
  return adminFetchJson<CheckInStatus>(
    `/parties/${encodeURIComponent(partyId)}/check-in/status`,
  );
}

export function checkInManually(partyId: string, userId: string) {
  return adminFetchJson<{ ok?: boolean; checkedIn?: boolean }>(
    `/parties/${encodeURIComponent(partyId)}/check-in/manual`,
    {
      method: "POST",
      body: JSON.stringify({
        userId,
        // Each deliberate check-in action needs a fresh key. Reusing a
        // participant-scoped key would replay the first response forever.
        idempotencyKey: `admin-web:${uuidV7()}`,
      }),
    },
  );
}

export type QrCheckInResult = {
  replay?: boolean;
  userId?: string;
  type?: string;
  checkedIn?: boolean;
};

export function checkInByQr(partyId: string, token: string) {
  return adminFetchJson<QrCheckInResult>(
    `/parties/${encodeURIComponent(partyId)}/check-in/qr`,
    {
      method: "POST",
      body: JSON.stringify({
        token,
        idempotencyKey: `admin-web-qr:${uuidV7()}`,
      }),
    },
  );
}

export const businessOperatorQueryKeys = {
  party: (partyId: string) => ["business-operator", "party", partyId] as const,
  checkIn: (partyId: string) => ["business-operator", "check-in", partyId] as const,
};
