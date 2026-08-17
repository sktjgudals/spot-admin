/** Same web OAuth client the Flutter app sends as GOOGLE_SERVER_CLIENT_ID. */
export const DOPA_GOOGLE_WEB_CLIENT_ID =
  "109162230288-9644lmdagmid6oc5bqttoq2q9asnigji.apps.googleusercontent.com";

export function publicGoogleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || DOPA_GOOGLE_WEB_CLIENT_ID;
}

/** Apple Services ID. Empty until the same App ID has a web Services ID. */
export function publicAppleClientId(): string {
  return process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || "";
}
