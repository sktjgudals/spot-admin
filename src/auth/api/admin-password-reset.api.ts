import { adminFetchJson } from "@/auth/api/admin-http";

/**
 * Nest Auth v2 — admin password reset (3-step).
 * @see spot-backend AdminPasswordResetController
 *   POST /auth/v2/admin/password-reset/request
 *   POST /auth/v2/admin/password-reset/verify
 *   POST /auth/v2/admin/password-reset/complete
 */

export type PasswordResetRequestResult = {
  message: string;
  expiresAt: string;
  /** Only when AUTH_PASSWORD_RESET_DEV_CODE_ENABLED + development */
  devCode?: string;
};

export type PasswordResetVerifyResult = {
  setupToken: string;
  expiresAt: string;
};

export type PasswordResetCompleteResult = {
  message: string;
  adminId: string;
};

export async function requestPasswordReset(
  email: string,
): Promise<PasswordResetRequestResult> {
  return adminFetchJson<PasswordResetRequestResult>(
    "/auth/v2/admin/password-reset/request",
    {
      method: "POST",
      body: JSON.stringify({ email }),
      skipAuthRefresh: true,
    },
  );
}

export async function verifyPasswordResetCode(input: {
  email: string;
  code: string;
}): Promise<PasswordResetVerifyResult> {
  return adminFetchJson<PasswordResetVerifyResult>(
    "/auth/v2/admin/password-reset/verify",
    {
      method: "POST",
      body: JSON.stringify(input),
      skipAuthRefresh: true,
    },
  );
}

export async function completePasswordReset(input: {
  setupToken: string;
  password: string;
}): Promise<PasswordResetCompleteResult> {
  return adminFetchJson<PasswordResetCompleteResult>(
    "/auth/v2/admin/password-reset/complete",
    {
      method: "POST",
      body: JSON.stringify(input),
      skipAuthRefresh: true,
    },
  );
}
