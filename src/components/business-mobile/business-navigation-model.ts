export const BUSINESS_NAVIGATION_ITEMS = [
  { href: "/app/parties", label: "홈", icon: "home" },
  { href: "/app/insights", label: "인사이트", icon: "insights" },
  { href: "/app/chat", label: "채팅", icon: "chat" },
  { href: "/app/mail", label: "메일", icon: "mail" },
  { href: "/app/reviews", label: "리뷰", icon: "reviews" },
  { href: "/app/my", label: "마이", icon: "profile" },
] as const;

export type BusinessNavigationIcon =
  (typeof BUSINESS_NAVIGATION_ITEMS)[number]["icon"];
