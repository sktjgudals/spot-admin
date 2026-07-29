import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import {
  approveRefundPolicyRequest,
  getRefundPolicyRequest,
  listRefundPolicyRequests,
  rejectRefundPolicyRequest,
} from "@/auth/api/admin-refund-policy.api";

describe("admin-refund-policy.api", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
    vi.mocked(adminFetchJson).mockResolvedValue({});
  });

  it("대기 중 신청 목록을 Admin JWT 경로에서 조회한다", async () => {
    await listRefundPolicyRequests();

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/refund-policy-change-requests?status=PENDING",
    );
  });

  it("전체 이력과 신청 상세를 조회한다", async () => {
    await listRefundPolicyRequests("ALL");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/refund-policy-change-requests",
    );

    await getRefundPolicyRequest("request 1");
    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/refund-policy-change-requests/request%201",
    );
  });

  it("승인 사유를 정리해 승인 API로 보낸다", async () => {
    await approveRefundPolicyRequest("r1", "  검토 완료  ");

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/refund-policy-change-requests/r1/approve",
      {
        method: "POST",
        body: JSON.stringify({ reason: "검토 완료" }),
      },
    );
  });

  it("거절 사유를 정리해 필수 사유 API로 보낸다", async () => {
    await rejectRefundPolicyRequest("r1", "  기준 재검토 필요  ");

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/admin/v2/refund-policy-change-requests/r1/reject",
      {
        method: "POST",
        body: JSON.stringify({ reason: "기준 재검토 필요" }),
      },
    );
  });
});
