"use client";

import { useAdminAuthContext } from "@/auth/provider/AdminAuthProvider";

export function useAdminAuth() {
  return useAdminAuthContext();
}
