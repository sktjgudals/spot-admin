export class AdminAuthError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly permanent: boolean;

  constructor(
    code: string,
    message: string,
    opts?: { status?: number | null; permanent?: boolean },
  ) {
    super(message);
    this.name = "AdminAuthError";
    this.code = code;
    this.status = opts?.status ?? null;
    this.permanent = opts?.permanent ?? false;
  }
}

export function isUnauthorizedError(err: unknown): boolean {
  return (
    err instanceof AdminAuthError &&
    (err.status === 401 || err.code === "UNAUTHORIZED")
  );
}

export function isNetworkError(err: unknown): boolean {
  return err instanceof AdminAuthError && err.code === "NETWORK_ERROR";
}
