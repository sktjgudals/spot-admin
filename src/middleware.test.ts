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

  it("lets a signed-out operator reach /login even while a stale cookie lingers", () => {
    // The API leaves a rejected refresh cookie behind on older deployments, and
    // the browser keeps it until it expires. Without this escape hatch the
    // bounce is endless: the app says "signed out", the edge says "signed in".
    const res = middleware(
      request("/login?signedOut=1", { spot_admin_rt: "stale", spot_admin_sid: "stale" }),
    );
    expect(res.headers.get("location")).toBeNull();
  });

  it("sends a signed-out /app request to /login", () => {
    const res = middleware(request("/app/parties"));
    expect(res.headers.get("location")).toBe("https://admin.dopa.ing/login");
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("lets a signed-in operator reach /app/parties", () => {
    const res = middleware(request("/app/parties", { spot_admin_rt: "refresh" }));
    expect(res.headers.get("location")).toBeNull();
  });
});
