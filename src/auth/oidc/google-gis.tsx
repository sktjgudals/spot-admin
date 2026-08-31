"use client";

import { useEffect, useRef } from "react";

type GoogleIdConfig = {
  client_id: string;
  callback: (response: { credential: string }) => void;
  ux_mode?: "popup" | "redirect";
  auto_select?: boolean;
};

type GoogleAccountsId = {
  initialize: (config: GoogleIdConfig) => void;
  renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisLoader: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts.id) return Promise.resolve();
  if (gisLoader) return gisLoader;
  gisLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google 로그인을 불러오지 못했습니다.")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google 로그인을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return gisLoader;
}

export function GoogleSignInButton({
  clientId,
  disabled,
  onCredential,
}: {
  clientId: string;
  disabled?: boolean;
  onCredential: (idToken: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    void loadGoogleIdentityServices()
      .then(() => {
        const host = hostRef.current;
        const api = window.google?.accounts.id;
        if (cancelled || host === null || api === undefined) return;
        api.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredential(response.credential);
          },
          ux_mode: "popup",
          auto_select: false,
        });

        let renderedWidth = 0;
        const renderAtAvailableWidth = () => {
          const availableWidth = Math.floor(
            host.clientWidth || host.getBoundingClientRect().width || 320,
          );
          const width = Math.max(1, Math.min(320, availableWidth));
          if (width === renderedWidth) return;
          renderedWidth = width;
          host.replaceChildren();
          api.renderButton(host, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            width,
            locale: "ko",
          });
        };

        renderAtAvailableWidth();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(renderAtAvailableWidth);
          resizeObserver.observe(host);
        }
      })
      .catch(() => {
        // The login page surfaces the failure when the operator clicks and we
        // cannot obtain a credential. Avoid a toast on every mount.
      });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [clientId, onCredential]);

  return (
    <div
      ref={hostRef}
      data-testid="google-signin"
      inert={disabled ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      className={`w-full max-w-[320px]${disabled ? " pointer-events-none opacity-50" : ""}`}
    />
  );
}
