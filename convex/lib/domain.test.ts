import { describe, expect, test } from "vitest";
import { nextStatus } from "./domain";

describe("loan state machine", () => {
  test("requested + approve -> approved", () => {
    expect(nextStatus("requested", "approve")).toBe("approved");
  });
  test("approved + return -> returned", () => {
    expect(nextStatus("approved", "return")).toBe("returned");
  });
  test("returned cannot be approved", () => {
    expect(() => nextStatus("returned", "approve")).toThrow(/CONFLICT/);
  });
  test("declined cannot be cancelled", () => {
    expect(() => nextStatus("declined", "cancel")).toThrow(/CONFLICT/);
  });
});
