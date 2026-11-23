import { describe, expect, test } from "vitest";
import { addDays, daysBetween, rangesOverlap, today } from "./dates";

describe("dates", () => {
  test("today uses the app timezone, not UTC", () => {
    expect(today("America/Sao_Paulo", Date.UTC(2026, 10, 24, 2))).toBe("2026-11-23");
  });
  test("addDays crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  test("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-11-20", "2026-11-23")).toBe(3);
  });
  test("ranges sharing a day overlap", () => {
    expect(rangesOverlap("2026-12-01", "2026-12-03", "2026-12-03", "2026-12-05")).toBe(true);
  });
  test("adjacent ranges do not overlap", () => {
    expect(rangesOverlap("2026-12-01", "2026-12-02", "2026-12-03", "2026-12-05")).toBe(false);
  });
});
