import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "https://admin.dopa.ing"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("admin middleware", () => {
  it("sends a signed-in login visitor to /app so role home can resolve", () => {
    const res = middleware(request("/login", { spot_admin_rt: "refresh" }));
    expect(res.headers.get("location")).toBe("https://admin.dopa.ing/app");
  });

  it("does not send BUSINESS_ADMIN to the super-admin dashboard from /login", () => {
    const res = middleware(request("/login", { spot_admin_sid: "sid" }));
    expect(res.headers.get("location")).not.toContain("/super-admin/dashboard");
  });

  it("sends a signed-out /app request to /login", () => {
    const res = middleware(request("/app/parties"));
    expect(res.headers.get("location")).toBe("https://admin.dopa.ing/login");
  });

  it("lets a signed-in operator reach /app/parties", () => {
    const res = middleware(request("/app/parties", { spot_admin_rt: "refresh" }));
    expect(res.headers.get("location")).toBeNull();
  });
});
