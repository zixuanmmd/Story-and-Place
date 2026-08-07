import { parseExactLocalDateTime } from "@/lib/time/local-date-time";

export type TimeCapsuleState = "current" | "past" | "future";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function unlockInputToIso(value: string) {
  if (!parseExactLocalDateTime(value)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function formatUnlockAtForInput(value: string | null) {
  if (!value) return "";
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return [
    String(instant.getFullYear()).padStart(4, "0"),
    "-",
    pad(instant.getMonth() + 1),
    "-",
    pad(instant.getDate()),
    "T",
    pad(instant.getHours()),
    ":",
    pad(instant.getMinutes()),
  ].join("");
}

export function getTimeCapsuleState(
  unlockAt: string | null,
  now = Date.now(),
): TimeCapsuleState {
  if (!unlockAt) return "current";
  const timestamp = new Date(unlockAt).getTime();
  if (Number.isNaN(timestamp)) return "current";
  return timestamp > now ? "future" : "past";
}

export function formatUnlockAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
