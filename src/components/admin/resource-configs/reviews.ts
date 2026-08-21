import type { ResourceConfig } from "./types";
import { number, text } from "./helpers";

export const reviewTagCategoriesConfig: ResourceConfig = {
  key: "review-tag-categories",
  title: "리뷰 태그 그룹",
  description: "리뷰 태그 그룹을 관리합니다.",
  resource: "review-tag-categories",
  columns: [
    { key: "name", label: "이름" },
    { key: "sortOrder", label: "순서" },
  ],
  create: {
    label: "그룹 추가",
    path: "/admin/v2/review-tag-categories",
    fields: [text("name", "이름", true), number("sortOrder", "순서")],
  },
  edit: {
    path: (row) => `/admin/v2/review-tag-categories/${encodeURIComponent(String(row.id))}`,
    fields: [text("name", "이름", true), number("sortOrder", "순서")],
  },
  actions: [
    {
      label: "삭제",
      path: (row) => `/admin/v2/review-tag-categories/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
    },
  ],
};

export const reviewTagsConfig: ResourceConfig = {
  key: "review-tags",
  title: "리뷰 태그",
  description: "사용자 리뷰에 표시되는 태그를 관리합니다.",
  resource: "review-tags",
  columns: [
    { key: "category", label: "그룹" },
    { key: "label", label: "태그" },
    { key: "sortOrder", label: "순서" },
    { key: "isActive", label: "활성" },
  ],
  create: {
    label: "태그 추가",
    path: "/admin/v2/review-tags",
    fields: [
      text("categoryId", "그룹 ID", true),
      text("label", "태그", true),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean", defaultValue: true },
    ],
  },
  edit: {
    path: (row) => `/admin/v2/review-tags/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("categoryId", "그룹 ID", true),
      text("label", "태그", true),
      number("sortOrder", "순서"),
      { key: "isActive", label: "활성", type: "boolean" },
    ],
  },
  actions: [
    {
      label: "비활성화",
      path: (row) => `/admin/v2/review-tags/${encodeURIComponent(String(row.id))}`,
      method: "DELETE",
      destructive: true,
      hidden: (row) => row.isActive === false,
    },
  ],
};
