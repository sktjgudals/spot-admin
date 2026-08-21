import { describe, expect, it } from "vitest";
import { maskSlackText } from "./slack-mask";

describe("maskSlackText", () => {
  it("keeps the error message and strips stack locations", () => {
    const masked = maskSlackText(
      [
        "Error: boom",
        "    at submitRefund (/Users/shm/spot-admin/src/console.ts:41:7)",
        "    at /app/worker.js:10:2",
      ].join("\n"),
    );
    expect(masked).toContain("Error: boom");
    expect(masked).toContain("at submitRefund");
    expect(masked).not.toContain("/Users/shm");
    expect(masked).not.toContain("/app/worker.js");
  });

  it("redacts JWTs and filesystem paths in free text", () => {
    const masked = maskSlackText(
      "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaabbbbbbbbcccccccc.ddddddddeeeeeeeeffffffff path /home/ubuntu/secret.ts",
    );
    expect(masked).toContain("[token]");
    expect(masked).toContain("[path]");
    expect(masked).not.toContain("eyJ");
    expect(masked).not.toContain("/home/ubuntu");
  });
});
