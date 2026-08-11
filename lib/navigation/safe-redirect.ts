import { parseStoryTemplateId } from "@/lib/templates/story-templates";

const ALLOWED_PATHS = new Set([
  "/",
  "/my-records",
  "/settings",
  "/groups",
  "/groups/new",
  "/groups/invitations",
  "/feed",
  "/explore",
  "/search",
  "/timeline",
  "/routes",
  "/routes/new",
  "/entry-invitations",
  "/tags",
  "/onboarding",
  "/onboarding/complete",
]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UUID_PATH_VALUE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_VALUE = new RegExp(`^${UUID_PATH_VALUE}$`, "i");
const GROUP_PATH = new RegExp(
  "^/groups/[a-z0-9]+(?:-[a-z0-9]+)*(?:/(?:settings|members|timeline))?$",
);
const USERNAME_PATH_VALUE =
  "(?=[a-z0-9-]{3,48}(?:/|$))[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const USER_PATH = new RegExp(
  `^/users/(?:${UUID_PATH_VALUE}|${USERNAME_PATH_VALUE})(?:/timeline)?$`,
  "i",
);
const STORY_ROUTE_PATH = /^\/routes\/[a-f0-9]{20}(?:\/edit)?$/;
const TAG_PATH = /^\/tags\/[a-f0-9]{20}$/;
const EMOTION_PATH = /^\/emotions\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ENTRY_PATH = new RegExp(`^/entries/${UUID_PATH_VALUE}$`, "i");

function hasAllowedSearchQuery(url: URL) {
  const allowedKeys = new Set([
    "q", "from", "to", "place", "tag", "emotion", "author", "types",
  ]);
  if (![...url.searchParams.keys()].every((key) => allowedKeys.has(key))) {
    return false;
  }
  if (![...allowedKeys].every((key) => url.searchParams.getAll(key).length <= 1)) {
    return false;
  }
  const query = url.searchParams.get("q");
  if (query !== null && (query.trim().length < 2 || query.trim().length > 100)) {
    return false;
  }
  for (const key of ["place", "tag", "emotion"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && (value.trim().length < 1 || value.trim().length > 100)) {
      return false;
    }
  }
  for (const key of ["from", "to"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null && (!/^\d{1,4}$/.test(value) || Number(value) < 1)) {
      return false;
    }
  }
  const author = url.searchParams.get("author");
  if (author !== null && !UUID_VALUE.test(author)) return false;
  const types = url.searchParams.get("types");
  if (types !== null) {
    const values = types.split(",");
    const allowedTypes = new Set(["entry", "profile", "route", "tag", "emotion"]);
    if (!values.length || values.some((value) => !allowedTypes.has(value))) return false;
  }
  return true;
}

function hasAllowedQuery(url: URL) {
  if (url.pathname === "/search") return hasAllowedSearchQuery(url);
  if (url.pathname === "/onboarding/complete") {
    const entryId = url.searchParams.get("entry");
    return url.searchParams.size === 1 && entryId !== null && UUID_VALUE.test(entryId);
  }
  if (url.pathname !== "/") return url.search === "";
  if (url.search === "") return true;

  if (url.searchParams.get("onboarding") === "1") {
    const allowedKeys = new Set(["onboarding", "restoreDraft", "template", "draft"]);
    const keysAreAllowed = [...url.searchParams.keys()].every((key) => allowedKeys.has(key));
    const keysAreUnique = [...allowedKeys].every(
      (key) => url.searchParams.getAll(key).length <= 1,
    );
    const restoreDraft = url.searchParams.get("restoreDraft");
    const template = url.searchParams.get("template");
    const draft = url.searchParams.get("draft");
    return (
      keysAreAllowed &&
      keysAreUnique &&
      (restoreDraft === null || restoreDraft === "1") &&
      (template === null || parseStoryTemplateId(template) !== null) &&
      (draft === null || UUID_VALUE.test(draft))
    );
  }

  if (
    url.searchParams.size === 1 &&
    url.searchParams.get("restoreDraft") === "1"
  ) {
    return true;
  }

  const entryId = url.searchParams.get("entry");
  const draftId = url.searchParams.get("draft");
  if (
    entryId &&
    UUID_VALUE.test(entryId) &&
    [...url.searchParams.keys()].every((key) => ["entry", "edit", "draft"].includes(key)) &&
    url.searchParams.getAll("entry").length === 1 &&
    url.searchParams.getAll("edit").length <= 1 &&
    url.searchParams.getAll("draft").length <= 1 &&
    (url.searchParams.get("edit") === null || url.searchParams.get("edit") === "1") &&
    (draftId === null || UUID_VALUE.test(draftId))
  ) {
    return true;
  }

  if (url.searchParams.size === 1 && draftId && UUID_VALUE.test(draftId)) {
    return true;
  }

  const groupId = url.searchParams.get("group");
  return (
    groupId !== null &&
    UUID_VALUE.test(groupId) &&
    [...url.searchParams.keys()].every((key) => key === "group" || key === "draft") &&
    url.searchParams.getAll("group").length === 1 &&
    url.searchParams.getAll("draft").length <= 1 &&
    (draftId === null || UUID_VALUE.test(draftId))
  );
}

function hasAllowedPath(url: URL) {
  return (
    ALLOWED_PATHS.has(url.pathname) ||
    GROUP_PATH.test(url.pathname) ||
    USER_PATH.test(url.pathname) ||
    STORY_ROUTE_PATH.test(url.pathname) ||
    ENTRY_PATH.test(url.pathname) ||
    TAG_PATH.test(url.pathname) ||
    EMOTION_PATH.test(url.pathname)
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
