"use client";

import type { ComponentProps, SyntheticEvent } from "react";
import { dopaMediaUrl } from "@/lib/dopa-media-url";

type DopaMediaImageProps = Omit<ComponentProps<"img">, "src" | "alt"> & {
  src: string;
  alt: string;
  transformWidth: number;
};

/**
 * Display-sized DOPA media with a one-step original fallback.
 *
 * Unknown runtime hosts are preserved by dopaMediaUrl. If the trusted Worker
 * transform is temporarily unavailable, the same image element retries the
 * original object without triggering a React render loop.
 */
export function DopaMediaImage({
  src,
  alt,
  transformWidth,
  loading = "lazy",
  decoding = "async",
  onError,
  ...props
}: DopaMediaImageProps) {
  const transformedSrc = dopaMediaUrl(src, { width: transformWidth });

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (transformedSrc !== src && image.getAttribute("src") !== src) {
      image.src = src;
    }
    onError?.(event);
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element -- runtime R2 URL with a Worker transform and original fallback.
    <img
      {...props}
      src={transformedSrc}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
}
