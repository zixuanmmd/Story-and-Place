const ALLOWED_PATHS = new Set(["/", "/my-records", "/settings"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function hasAllowedQuery(url: URL) {
  if (url.pathname !== "/") return url.search === "";
  if (url.search === "") return true;
  return (
    url.searchParams.size === 1 &&
    url.searchParams.get("restoreDraft") === "1"
  );
}

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  currentOrigin: string,
): string {
  if (!candidate || CONTROL_CHARACTERS.test(candidate) || candidate.includes("\\")) {
    return "/";
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return "/";
  }

  if (
    CONTROL_CHARACTERS.test(decoded) ||
    decoded.includes("\\") ||
    !decoded.startsWith("/") ||
    decoded.startsWith("//")
  ) {
    return "/";
  }

  try {
    const origin = new URL(currentOrigin).origin;
    const parsed = new URL(decoded, `${origin}/`);
    if (
      parsed.origin !== origin ||
      !ALLOWED_PATHS.has(parsed.pathname) ||
      parsed.hash !== "" ||
      !hasAllowedQuery(parsed)
    ) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}
