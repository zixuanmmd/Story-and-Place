import { describe, expect, it } from "vitest";
import {
  formatUnlockAtForInput,
  getTimeCapsuleState,
  unlockInputToIso,
} from "./time-capsule";

describe("time capsule conversion", () => {
  it("round-trips a valid browser-local unlock time", () => {
    const input = "2035-01-01T09:30";
    const stored = unlockInputToIso(input);
    expect(stored).not.toBeNull();
    expect(formatUnlockAtForInput(stored)).toBe(input);
  });

  it.each([
    "2035-02-30T09:30",
    "2035-13-01T09:30",
    "2035-01-01T24:00",
    "not-a-time",
  ])("rejects invalid unlock time %s", (value) => {
    expect(unlockInputToIso(value)).toBeNull();
  });

  it("classifies normal, unlocked and future stories", () => {
    const now = Date.parse("2030-01-01T00:00:00Z");
    expect(getTimeCapsuleState(null, now)).toBe("current");
    expect(getTimeCapsuleState("2029-12-31T23:59:00Z", now)).toBe("past");
    expect(getTimeCapsuleState("2035-01-01T00:00:00Z", now)).toBe("future");
  });
});
