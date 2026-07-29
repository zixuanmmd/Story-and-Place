const ALLOWED_PATHS = new Set([
  "/",
  "/my-records",
  "/settings",
  "/groups",
  "/groups/new",
  "/groups/invitations",
  "/feed",
  "/timeline",
  "/routes",
  "/routes/new",
  "/entry-invitations",
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UUID_PATH_VALUE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_VALUE = new RegExp(`^${UUID_PATH_VALUE}$`, "i");
const GROUP_PATH = new RegExp(
  "^/groups/[a-z0-9]+(?:-[a-z0-9]+)*(?:/(?:settings|members|timeline))?$",
);
const USER_PATH = new RegExp(`^/users/${UUID_PATH_VALUE}(?:/timeline)?$`, "i");
const STORY_ROUTE_PATH = /^\/routes\/[a-f0-9]{20}(?:\/edit)?$/;
const TAG_PATH = /^\/tags\/[a-f0-9]{20}$/;

function hasAllowedQuery(url: URL) {
  if (url.pathname !== "/") return url.search === "";
  if (url.search === "") return true;

  if (
    url.searchParams.size === 1 &&
    url.searchParams.get("restoreDraft") === "1"
  ) {
    return true;
  }

  const entryId = url.searchParams.get("entry");
  if (
    entryId &&
    UUID_VALUE.test(entryId) &&
    (url.searchParams.size === 1 ||
      (url.searchParams.size === 2 &&
        url.searchParams.get("edit") === "1"))
  ) {
    return true;
  }

  const groupId = url.searchParams.get("group");
  return (
    url.searchParams.size === 1 &&
    groupId !== null &&
    UUID_VALUE.test(groupId)
  );
}

function hasAllowedPath(url: URL) {
  return (
    ALLOWED_PATHS.has(url.pathname) ||
    GROUP_PATH.test(url.pathname) ||
    USER_PATH.test(url.pathname) ||
    STORY_ROUTE_PATH.test(url.pathname) ||
    TAG_PATH.test(url.pathname)
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
      !hasAllowedPath(parsed) ||
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

export function getAuthPageHref(
  destination: "/login" | "/register",
  nextCandidate: string | null | undefined,
  currentOrigin: string,
  email?: string,
) {
  const params = new URLSearchParams();
  if (nextCandidate) {
    params.set(
      "next",
      getSafeRedirectPath(nextCandidate, currentOrigin),
    );
  }
  if (destination === "/login" && email) {
    params.set("email", email);
  }
  const query = params.toString();
  return query ? `${destination}?${query}` : destination;
}
