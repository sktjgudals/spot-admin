/** 앱 BannerActionType wire 값과 동일 (UPPER_SNAKE). */
export const BANNER_ACTION_TYPES = [
  "NONE",
  "DEEPLINK",
  "WEB",
  "INSTAGRAM",
  "YOUTUBE",
  "PHONE",
  "EMAIL",
  "CUSTOM",
] as const;

export type BannerActionType = (typeof BANNER_ACTION_TYPES)[number];

export const BANNER_ACTION_LABELS: Record<BannerActionType, string> = {
  NONE: "없음",
  DEEPLINK: "앱 내부 이동",
  WEB: "외부 웹",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  PHONE: "전화",
  EMAIL: "이메일",
  CUSTOM: "커스텀 스킴",
};

export const BANNER_ACTION_PLACEHOLDERS: Record<BannerActionType, string> = {
  NONE: "",
  DEEPLINK: "majormap://party/15 또는 /parties/15",
  WEB: "https://majormap.net",
  INSTAGRAM: "https://www.instagram.com/majormap",
  YOUTUBE: "https://youtu.be/xxxxxxxx",
  PHONE: "tel:01012341234",
  EMAIL: "mailto:hello@example.com",
  CUSTOM: "kakaotalk://launch 또는 market://...",
};

export const BANNER_ACTION_HINTS: Record<BannerActionType, string> = {
  NONE: "탭해도 아무 동작 없음",
  DEEPLINK: "앱 내 파티·채팅·프로필 등으로 이동",
  WEB: "시스템 브라우저로 열림",
  INSTAGRAM: "앱 설치 시 Instagram, 미설치 시 웹",
  YOUTUBE: "앱 설치 시 YouTube, 미설치 시 웹",
  PHONE: "전화 앱 실행",
  EMAIL: "메일 앱 실행",
  CUSTOM: "카카오톡·스토어 등 임의 스킴 (앱 우선)",
};

const ALLOWED = new Set<string>(BANNER_ACTION_TYPES);

/** 서버/폼 입력 정규화. 알 수 없으면 null. */
export function normalizeBannerActionType(
  raw: unknown,
): BannerActionType | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "DEEP_LINK") return "DEEPLINK";
  if (upper === "TEL") return "PHONE";
  if (upper === "MAIL" || upper === "MAILTO") return "EMAIL";
  if (upper === "URL" || upper === "HTTP" || upper === "HTTPS") return "WEB";
  if (upper === "KAKAO" || upper === "SCHEME") return "CUSTOM";
  if (!ALLOWED.has(upper)) return null;
  return upper as BannerActionType;
}

/**
 * create/update 시 linkUrl·action 필드를 일관되게 맞춘다.
 * - actionType/actionValue 우선
 * - WEB/INSTAGRAM/YOUTUBE면 linkUrl에도 동기화 (레거시 소비자 호환)
 * - action 없이 linkUrl만 오면 linkUrl 유지, actionType 추론은 앱이 담당
 */
export function resolveBannerActionFields(input: {
  actionType?: unknown;
  actionValue?: unknown;
  linkUrl?: unknown;
}): {
  actionType: string | null;
  actionValue: string | null;
  linkUrl: string | null;
} {
  const explicitType = normalizeBannerActionType(input.actionType);
  const rawValue =
    typeof input.actionValue === "string" ? input.actionValue.trim() : "";
  const rawLink =
    typeof input.linkUrl === "string" ? input.linkUrl.trim() : "";

  if (explicitType === "NONE") {
    return { actionType: "NONE", actionValue: null, linkUrl: null };
  }

  if (explicitType) {
    const actionValue = rawValue || rawLink || null;
    const linkUrl =
      actionValue &&
      (explicitType === "WEB" ||
        explicitType === "INSTAGRAM" ||
        explicitType === "YOUTUBE")
        ? actionValue
        : rawLink || null;
    return {
      actionType: explicitType,
      actionValue,
      linkUrl,
    };
  }

  // 레거시: linkUrl만
  if (rawLink) {
    return {
      actionType: null,
      actionValue: null,
      linkUrl: rawLink,
    };
  }

  if (rawValue) {
    return {
      actionType: null,
      actionValue: rawValue,
      linkUrl: null,
    };
  }

  return { actionType: null, actionValue: null, linkUrl: null };
}
