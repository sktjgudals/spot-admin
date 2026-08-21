const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const PATH_PATTERN =
  /(?:file:\/\/|\/Users\/|\/home\/|\/app\/|\\\\)[^\s)]+/g;

function maskLine(line: string): string {
  const withoutSecrets = line.replace(JWT_PATTERN, "[token]");
  if (!/^\s*at\s+/.test(withoutSecrets)) {
    return withoutSecrets.replace(PATH_PATTERN, "[path]");
  }
  const withoutLocation = withoutSecrets
    .replace(/\s*\((?:file:\/\/|https?:\/\/|\/|\\\\)[^)]*\)\s*$/, "")
    .replace(/\s+(?:file:\/\/|\/Users\/|\/home\/|\/app\/|\\\\)[^\s]+:\d+(?::\d+)?\s*$/, "");
  return withoutLocation.replace(PATH_PATTERN, "[path]");
}

/** Drop source paths, home directories, and JWTs before Slack sees an error. */
export function maskSlackText(value: string, max = 2500): string {
  return value.split("\n").map(maskLine).join("\n").slice(0, max);
}
