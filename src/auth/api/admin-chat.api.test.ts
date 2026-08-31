import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/api/admin-http", () => ({
  adminFetchJson: vi.fn(),
}));

import { adminFetchJson } from "@/auth/api/admin-http";
import { listBusinessOperatorMessages } from "./admin-chat.api";

describe("admin chat API", () => {
  beforeEach(() => {
    vi.mocked(adminFetchJson).mockReset();
    vi.mocked(adminFetchJson).mockResolvedValue({ messages: [], hasMore: false });
  });

  it("requests older history with a bounded beforeSeq cursor", async () => {
    await listBusinessOperatorMessages("room/a", { beforeSeq: 42, limit: 50 });

    expect(adminFetchJson).toHaveBeenCalledWith(
      "/chat/operator/rooms/room%2Fa/messages?limit=50&beforeSeq=42",
    );
  });
});
