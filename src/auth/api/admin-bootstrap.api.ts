import { adminFetchJson } from "@/auth/api/admin-http";

/**
 * Nest Auth v2 — first SUPER_ADMIN bootstrap.
 * @see spot-backend AdminBootstrapController
 *   GET  /auth/v2/admin/bootstrap/status
 *   POST /auth/v2/admin/bootstrap/request
 *   POST /auth/v2/admin/bootstrap/verify
 *   POST /auth/v2/admin/bootstrap/complete
 */

export type BootstrapStatus = {
  completed: boolean;
  /** false 이면 가입 UI 마감. 기본 true (추가 SUPER_ADMIN 허용) */
  open?: boolean;
};

export type BootstrapRequestResult = {
  email: string;
  expiresAt: string;
  /** Only when Nest AUTH_BOOTSTRAP_DEV_CODE_ENABLED + development */
  devCode?: string;
};

export type BootstrapVerifyResult = {
  email: string;
  setupToken: string;
  expiresAt: string;
};

export type BootstrapCompleteResult = {
  adminId: string;
  email: string;
  role: string;
  accessToken: string;
  refreshToken?: string;
  sessionId: string;
};

export async function fetchBootstrapStatus(): Promise<BootstrapStatus> {
  return adminFetchJson<BootstrapStatus>("/auth/v2/admin/bootstrap/status", {
    method: "GET",
    skipAuthRefresh: true,
  });
}

export async function requestBootstrapCode(
  email: string,
): Promise<BootstrapRequestResult> {
  return adminFetchJson<BootstrapRequestResult>(
    "/auth/v2/admin/bootstrap/request",
    {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuthRefresh: true,
    },
  );
}

export async function verifyBootstrapCode(input: {
  email: string;
  code: string;
}): Promise<BootstrapVerifyResult> {
  return adminFetchJson<BootstrapVerifyResult>(
    "/auth/v2/admin/bootstrap/verify",
    {
      method: "POST",
      body: JSON.stringify(input),
      skipAuthRefresh: true,
    },
  );
}

export async function completeBootstrap(input: {
  setupToken: string;
  password: string;
  name: string;
  deviceName?: string;
}): Promise<BootstrapCompleteResult> {
  return adminFetchJson<BootstrapCompleteResult>(
    "/auth/v2/admin/bootstrap/complete",
    {
      method: "POST",
      body: JSON.stringify({
        setupToken: input.setupToken,
        password: input.password,
        name: input.name,
        deviceName: input.deviceName ?? "admin-web-signup",
      }),
      skipAuthRefresh: true,
    },
  );
}
