export const queryKeys = {
  banners: ["banners"] as const,
  partyCategories: ["partyCategories"] as const,
  reviewTagCategories: ["reviewTagCategories"] as const,
  reviewTags: ["reviewTags"] as const,
  coupons: ["coupons"] as const,
  inquiries: ["inquiries"] as const,
  config: ["config"] as const,
  businessForms: ["businessForms"] as const,
  businessProfile: ["businessProfile"] as const,
  chatRooms: ["chatRooms"] as const,
  chatMessages: (roomId: string) => ["chatMessages", roomId] as const,
};
