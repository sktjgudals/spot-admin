import type { ResourceConfig } from "./types";
import { number, text } from "./helpers";

/**
 * Report reasons the app renders.
 *
 * `code` is only on the create form. It is what a report row stores, so
 * editing one silently reinterprets every report ever filed under it — retire
 * the reason and add a new one instead. That is also why the destructive
 * action deactivates rather than deletes.
 *
 * `targetKinds` is a comma-separated list (`USER, REVIEW_POST, PARTY`). The
 * API rejects an unknown kind, so a typo fails loudly rather than quietly
 * hiding the reason from every screen.
 */
export const reportReasonsConfig: ResourceConfig = {
  key: "report-reasons",
  title: "신고 사유",
  description:
    "앱의 신고 화면에 뜨는 사유입니다. 대상은 USER, BUSINESS, CONVERSATION, MESSAGE, REVIEW_POST, PARTY 중에서 쉼표로 구분해 적습니다.",
  resource: "report-reasons",
  columns: [
    { key: "label", label: "사유" },
    { key: "code", label: "코드" },
    { key: "targetKinds", label: "대상" },
    { key: "sortOrder", label: "순서" },
    { key: "requiresNote", label: "상세입력 필수" },
    { key: "isActive", label: "활성" },
  ],
  create: {
    label: "사유 추가",
    path: "/admin/v2/report-reasons",
    fields: [
      text("code", "코드 (예: HARASSMENT · 만든 뒤에는 못 바꿉니다)", true),
      text("label", "사유", true),
      text("description", "설명"),
      text("targetKinds", "대상 (쉼표 구분)", true),
      number("sortOrder", "순서"),
      { key: "requiresNote", label: "상세입력 필수", type: "boolean", defaultValue: false },
      { key: "isActive", label: "활성", type: "boolean", defaultValue: true },
    ],
  },
  edit: {
    path: (row) => `/admin/v2/report-reasons/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("label", "사유", true),
      text("description", "설명"),
      text("targetKinds", "대상 (쉼표 구분)", true),
      number("sortOrder", "순서"),
      { key: "requiresNote", label: "상세입력 필수", type: "boolean" },
      { key: "isActive", label: "활성", type: "boolean" },
    ],
  },
  actions: [
    {
      label: "비활성화",
      path: (row) => `/admin/v2/report-reasons/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
      hidden: (row) => row.isActive === false,
    },
  ],
};
