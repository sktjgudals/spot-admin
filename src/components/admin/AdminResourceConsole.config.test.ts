import { describe, expect, it } from "vitest";
import { getResourceConfig, resourceConfigs } from "@/components/admin/AdminResourceConsole";

describe("business role request resource config", () => {
  it("connects the admin list and review actions to the backend contract", () => {
    const config = resourceConfigs["business-role-requests"];
    expect(config).toMatchObject({
      key: "business-role-requests",
      resource: "business-role-requests",
      title: "업체 권한 신청",
    });

    const pending = { id: "request-1", status: "PENDING" };
    expect(config.actions?.map((action) => action.label)).toEqual(["승인", "거절"]);
    expect(config.actions?.[0]?.path(pending)).toBe(
      "/admin/v2/business-role-requests/request-1/approve",
    );
    expect(config.actions?.[0]?.hidden?.(pending)).toBe(false);
    expect(config.actions?.[0]?.hidden?.({ ...pending, status: "APPROVED" })).toBe(true);
  });

  it("does not treat prototype keys as resource configs", () => {
    expect(getResourceConfig("constructor")).toBeUndefined();
    expect(getResourceConfig("users")?.key).toBe("users");
  });

  it("declares only backend-supported status filters", () => {
    expect(resourceConfigs.users.statusOptions).toEqual([
      { value: "ACTIVE", label: "정상" },
      { value: "SUSPENDED", label: "정지" },
    ]);
    expect(resourceConfigs["business-role-requests"].statusOptions?.map((item) => item.value)).toEqual([
      "PENDING",
      "APPROVED",
      "REJECTED",
    ]);
  });

  it("uploads banner images, exposes the schedule and keeps action options in sync", () => {
    const banners = resourceConfigs.banners;
    const create = banners.create?.fields ?? [];
    const edit = banners.edit?.fields ?? [];

    expect(create.map((field) => field.key)).toEqual([
      "title", "imageUrl", "actionType", "actionValue", "linkUrl", "sortOrder", "isActive", "startsAt", "endsAt",
    ]);
    expect(edit.map((field) => field.key)).toEqual(create.map((field) => field.key));

    const image = create.find((field) => field.key === "imageUrl");
    expect(image).toMatchObject({
      type: "image",
      required: true,
      upload: {
        url: "/admin/v2/media/upload-url",
        hint: "jpeg/png/webp · 최대 10MB · 권장 1600×900 (16:9)",
        preview: "wide",
      },
    });

    const options = ["NONE", "DEEPLINK", "WEB", "INSTAGRAM", "YOUTUBE", "PHONE", "EMAIL", "CUSTOM"];
    expect(create.find((field) => field.key === "actionType")?.options).toEqual(options);
    expect(edit.find((field) => field.key === "actionType")?.options).toEqual(options);

    expect(create.find((field) => field.key === "startsAt")).toMatchObject({ label: "노출 시작", type: "datetime" });
    expect(edit.find((field) => field.key === "endsAt")).toMatchObject({ label: "노출 종료", type: "datetime" });
  });
});
