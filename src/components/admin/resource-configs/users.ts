import type { ResourceConfig } from "./types";
import { statusAction, text } from "./helpers";

export const usersConfig: ResourceConfig = {
  key: "users",
  title: "사용자 관리",
  description: "계정 역할과 이용 상태를 관리합니다.",
  resource: "users",
  columns: [
    { key: "nickname", label: "이름" },
    { key: "email", label: "이메일" },
    { key: "role", label: "역할" },
    { key: "status", label: "상태" },
    { key: "createdAt", label: "가입일" },
  ],
  edit: {
    path: (row) => `/admin/v2/users/${encodeURIComponent(String(row.id))}`,
    fields: [
      text("nickname", "이름", true),
      { key: "role", label: "역할", options: ["USER", "ADMIN", "SUPER_ADMIN"] },
      { key: "status", label: "상태", options: ["ACTIVE", "SUSPENDED"] },
    ],
  },
  actions: [
    statusAction("정지", "ban", (row) => row.status === "SUSPENDED"),
    statusAction("정지 해제", "unban", (row) => row.status !== "SUSPENDED"),
  ],
};
