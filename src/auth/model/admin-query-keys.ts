export type PartyAdminScope = "business" | "super";

/** Single query-key factory so the same resource cannot be fetched under aliases. */
export const adminQueryKeys = {
  dashboard: ["admin", "dashboard", "summary"] as const,
  mail: {
    all: ["admin", "mail"] as const,
    mailbox: ["admin", "mail", "mailbox"] as const,
    list: (params: Record<string, unknown>) =>
      ["admin", "mail", "list", params] as const,
    detail: (id: string) => ["admin", "mail", "detail", id] as const,
  },
  parties: {
    all: ["admin", "parties"] as const,
    categories: ["admin", "party-categories"] as const,
    list: (businessId: string, scope: PartyAdminScope = "business") =>
      ["admin", "parties", "list", businessId, scope] as const,
    detail: (partyId: string) => ["admin", "parties", "detail", partyId] as const,
    statusHistory: (partyId: string) =>
      ["admin", "parties", "detail", partyId, "status-history"] as const,
  },
  reports: {
    all: ["admin", "reports"] as const,
    list: (status: string) => ["admin", "reports", "list", status] as const,
    detail: (reportId: string) =>
      ["admin", "reports", "detail", reportId] as const,
  },
  insights: (partyId?: string) =>
    ["admin", "insights", partyId && partyId.length > 0 ? partyId : "all"] as const,
  mailOutbox: {
    all: ["admin", "mail-outbox"] as const,
    list: (params: Record<string, unknown> = {}) =>
      ["admin", "mail-outbox", "list", params] as const,
  },
} as const;
