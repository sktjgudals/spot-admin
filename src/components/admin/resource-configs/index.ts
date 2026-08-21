import { businessRoleRequestsConfig } from "./business";
import {
  bannersConfig,
  categoriesConfig,
  couponsConfig,
  inquiriesConfig,
  notificationsConfig,
  runtimeConfig,
} from "./content";
import {
  paymentsConfig,
  refundPolicyRequestsConfig,
  refundsConfig,
} from "./payments";
import { reviewTagCategoriesConfig, reviewTagsConfig } from "./reviews";
import type { ResourceConfig } from "./types";
import { usersConfig } from "./users";

export type { Action, ActionFields, Field, ResourceConfig } from "./types";

export function getResourceConfig(section: string): ResourceConfig | undefined {
  return Object.hasOwn(resourceConfigs, section)
    ? resourceConfigs[section]
    : undefined;
}

export const resourceConfigs: Record<string, ResourceConfig> = {
  users: usersConfig,
  "business-role-requests": businessRoleRequestsConfig,
  "refund-policy-requests": refundPolicyRequestsConfig,
  coupons: couponsConfig,
  inquiries: inquiriesConfig,
  payments: paymentsConfig,
  refunds: refundsConfig,
  notifications: notificationsConfig,
  banners: bannersConfig,
  categories: categoriesConfig,
  "review-tag-categories": reviewTagCategoriesConfig,
  "review-tags": reviewTagsConfig,
  config: runtimeConfig,
};
