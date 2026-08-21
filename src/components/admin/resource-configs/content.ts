import type { ResourceConfig } from "./types";
import { number, text } from "./helpers";

export const couponsConfig: ResourceConfig = {
  key: "coupons",
  title: "쿠폰 관리",
  description: "플랫폼 공통 쿠폰을 발행하고 금액을 관리합니다.",
  resource: "coupons",
  columns: [
    { key: "title", label: "이름" },
    { key: "campaignId", label: "캠페인" },
    { key: "discountAmount", label: "할인액" },
    { key: "validDays", label: "유효일" },
    { key: "kind", label: "종류" },
    { key: "isActive", label: "활성" },
  ],
  create: {
    label: "쿠폰 추가",
    path: "/admin/v2/coupons",
    fields: [
      text("campaignId", "캠페인 ID", true),
      text("title", "쿠폰명", true),
      { key: "description", label: "설명", type: "textarea" },
      number("discountAmount", "할인액"),
      number("minimumOrderAmount", "최소 주문액"),
      number("maximumDiscountAmount", "최대 할인액"),
      number("validDays", "유효일", 30),
      { key: "kind", label: "종류", options: ["CLAIMABLE", "SYSTEM"], defaultValue: "CLAIMABLE" },
    ],
  },
  edit: {
    path: (row) => `/admin/v2/coupons/${encodeURIComponent(String(row.id))}`,
    fields: [
      number("discountAmount", "할인액"),
      number("minimumOrderAmount", "최소 주문액"),
      number("maximumDiscountAmount", "최대 할인액"),
    ],
  },
  actions: [
    {
      label: "비활성화",
      path: (row) => `/admin/v2/coupons/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
      hidden: (row) => row.isActive === false,
    },
  ],
};

export const inquiriesConfig: ResourceConfig = {
  key: "inquiries",
  title: "문의 관리",
  description: "웹사이트로 접수된 문의를 확인하고 처리합니다.",
  resource: "inquiries",
  columns: [
    { key: "name", label: "이름" },
    { key: "contact", label: "연락처" },
    { key: "message", label: "문의 내용" },
    { key: "status", label: "상태" },
    { key: "createdAt", label: "접수일" },
  ],
  actions: [
    {
      label: "처리 완료",
      path: (row) => `/admin/v2/inquiries/${encodeURIComponent(String(row.id))}/resolve`,
      hidden: (row) => row.status === "RESOLVED",
    },
  ],
};

export const notificationsConfig: ResourceConfig = {
  key: "notifications",
  title: "알림 캠페인",
  description: "전체·사용자·파티·업체 대상 알림을 예약하거나 즉시 발송합니다.",
  resource: "notification-campaigns",
  columns: [
    { key: "title", label: "제목" },
    { key: "audience", label: "대상" },
    { key: "status", label: "상태" },
    { key: "targetCount", label: "대상 수" },
    { key: "deliveredCount", label: "성공" },
    { key: "createdAt", label: "생성일" },
  ],
  create: {
    label: "캠페인 만들기",
    path: "/admin/v2/notifications/campaigns",
    fields: [
      text("title", "제목", true),
      { key: "body", label: "내용", type: "textarea", required: true },
      { key: "audience", label: "대상", options: ["ALL", "USER", "PARTY", "BUSINESS"], defaultValue: "ALL" },
      text("audienceId", "대상 ID"),
      text("clickAction", "클릭 액션"),
      { key: "scheduledAt", label: "예약 시각", type: "datetime" },
      { key: "sendNow", label: "즉시 발송", type: "boolean" },
    ],
  },
  actions: [
    {
      label: "지금 발송",
      path: (row) => `/admin/v2/notifications/campaigns/${encodeURIComponent(String(row.id))}/send`,
      hidden: (row) => !["DRAFT", "QUEUED", "FAILED"].includes(String(row.status)),
    },
    {
      label: "취소",
      path: (row) => `/admin/v2/notifications/campaigns/${encodeURIComponent(String(row.id))}/cancel`,
      destructive: true,
      hidden: (row) => !["DRAFT", "QUEUED", "FAILED"].includes(String(row.status)),
    },
  ],
};

export const bannersConfig: ResourceConfig = {
  key: "banners",
  title: "배너 관리",
  description: "앱 메인 배너의 이미지, 노출 순서와 액션을 관리합니다.",
  resource: "banners",
  columns: [
    { key: "title", label: "제목" },
    { key: "imageUrl", label: "이미지" },
    { key: "actionType", label: "액션" },
    { key: "sortOrder", label: "순서" },
    { key: "isActive", label: "활성" },
  ],
  create: {
    label: "배너 추가",
    path: "/admin/v2/banners",
    fields: [
      text("title", "제목", true),
      text("imageUrl", "이미지 URL", true),
      {
        key: "actionType",
        label: "액션",
        options: ["NONE", "DEEPLINK", "WEB", "INSTAGRAM", "YOUTUBE", "PHONE", "EMAIL", "CUSTOM"],
        defaultValue: "NONE",
      },
      text("actionValue", "액션 값"),
      text("linkUrl", "링크 URL"),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean", defaultValue: true },
    ],
  },
  edit: {
    path: (row) => `/admin/v2/banners/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("title", "제목", true),
      text("imageUrl", "이미지 URL", true),
      { key: "actionType", label: "액션", options: ["NONE", "DEEPLINK", "WEB", "CUSTOM"] },
      text("actionValue", "액션 값"),
      text("linkUrl", "링크 URL"),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean" },
    ],
  },
  actions: [
    {
      label: "삭제",
      path: (row) => `/admin/v2/banners/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
    },
  ],
};

export const categoriesConfig: ResourceConfig = {
  key: "categories",
  title: "파티 카테고리",
  description: "파티 분류와 앱 노출 순서를 관리합니다.",
  resource: "party-categories",
  columns: [
    { key: "name", label: "이름" },
    { key: "status", label: "상태" },
    { key: "sortOrder", label: "순서" },
    { key: "iconUrl", label: "아이콘" },
  ],
  create: {
    label: "카테고리 추가",
    path: "/admin/v2/party-categories",
    fields: [
      text("name", "이름", true),
      { key: "status", label: "상태", options: ["ACTIVE", "FIXED", "HIDDEN"], defaultValue: "ACTIVE" },
      number("sortOrder", "순서"),
      text("iconUrl", "아이콘 URL"),
    ],
  },
  edit: {
    path: (row) => `/admin/v2/party-categories/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("name", "이름", true),
      { key: "status", label: "상태", options: ["ACTIVE", "FIXED", "HIDDEN"] },
      number("sortOrder", "순서"),
      text("iconUrl", "아이콘 URL"),
    ],
  },
  actions: [
    {
      label: "숨김",
      path: (row) => `/admin/v2/party-categories/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
      hidden: (row) => row.status === "HIDDEN",
    },
  ],
};

export const runtimeConfig: ResourceConfig = {
  key: "config",
  title: "런타임 설정",
  description: "운영 설정을 변경합니다. 모든 변경은 감사 로그에 기록됩니다.",
  resource: "config",
  columns: [
    { key: "key", label: "키" },
    { key: "value", label: "값" },
    { key: "description", label: "설명" },
    { key: "updatedBy", label: "수정자" },
    { key: "updatedAt", label: "수정일" },
  ],
  create: {
    label: "설정 추가",
    path: (values) => `/admin/v2/config/${encodeURIComponent(String(values.key))}`,
    fields: [
      text("key", "키", true),
      text("value", "값", true),
      { key: "description", label: "설명", type: "textarea" },
    ],
  },
  edit: {
    path: (row) => `/admin/v2/config/${encodeURIComponent(String(row.key))}`,
    fields: [
      text("value", "값", true),
      { key: "description", label: "설명", type: "textarea" },
    ],
  },
};
