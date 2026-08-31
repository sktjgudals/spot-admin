const TRUSTED_DOPA_MEDIA_HOSTS = new Set([
  "media.dopa.ing",
  "media-staging.dopa.ing",
  "media.test.dopa.ing",
]);

const MIN_TRANSFORM_WIDTH = 80;
const MAX_TRANSFORM_WIDTH = 1_600;
const TRANSFORM_WIDTH_STEP = 80;

/** Build the canonical DOPA Worker thumbnail URL for a display-sized image. */
export function dopaMediaUrl(
  url: string,
  { width }: { readonly width: number },
): string {
  const snappedWidth = snapTransformWidth(width);
  if (snappedWidth === null) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (
    parsed.protocol !== "https:" ||
    !TRUSTED_DOPA_MEDIA_HOSTS.has(parsed.hostname) ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return url;
  }

  if (
    parsed.pathname.startsWith("/t/") ||
    parsed.pathname.startsWith("/cdn-cgi/image/")
  ) {
    return url;
  }

  const sourcePath = parsed.pathname.startsWith("/")
    ? parsed.pathname.slice(1)
    : parsed.pathname;
  if (sourcePath === "") return url;

  const options = `width=${snappedWidth},quality=72,format=webp,fit=scale-down`;
  parsed.pathname = `/t/${options}/${sourcePath}`;
  return parsed.toString();
}

function snapTransformWidth(width: number): number | null {
  if (!Number.isSafeInteger(width) || width <= 0) return null;
  if (width <= MIN_TRANSFORM_WIDTH) return MIN_TRANSFORM_WIDTH;
  if (width >= MAX_TRANSFORM_WIDTH) return MAX_TRANSFORM_WIDTH;
  return (
    Math.floor((width + TRANSFORM_WIDTH_STEP / 2 - 1) / TRANSFORM_WIDTH_STEP) *
    TRANSFORM_WIDTH_STEP
  );
}
