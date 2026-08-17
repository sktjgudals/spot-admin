"use client";

type AppleAuthConfig = {
  clientId: string;
  scope: string;
  redirectURI: string;
  usePopup: boolean;
  nonce: string;
};

type AppleSignInResult = {
  authorization?: { id_token?: string };
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: AppleAuthConfig) => void;
        signIn: () => Promise<AppleSignInResult>;
      };
    };
  }
}

const APPLE_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

let appleLoader: Promise<void> | null = null;

function loadAppleSignIn(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.AppleID?.auth) return Promise.resolve();
  if (appleLoader) return appleLoader;
  appleLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Apple 로그인을 불러오지 못했습니다.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = APPLE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Apple 로그인을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return appleLoader;
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function preloadAppleSignIn(): Promise<void> {
  return loadAppleSignIn();
}

export async function requestAppleIdToken(clientId: string): Promise<{
  idToken: string;
  nonce: string;
}> {
  await loadAppleSignIn();
  const api = window.AppleID?.auth;
  if (api === undefined) {
    throw new Error("Apple 로그인을 불러오지 못했습니다.");
  }
  const nonce = randomNonce();
  api.init({
    clientId,
    scope: "name email",
    redirectURI: `${window.location.origin}/login`,
    usePopup: true,
    nonce,
  });
  const result = await api.signIn();
  const idToken = result.authorization?.id_token;
  if (!idToken) {
    throw new Error("Apple 로그인에 실패했습니다.");
  }
  return { idToken, nonce };
}
