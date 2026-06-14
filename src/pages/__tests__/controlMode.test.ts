import { describe, it, expect } from "vitest";
import { pickDeckMode } from "../controlMode";

describe("pickDeckMode", () => {
  it("is quiet with no running jobs", () => {
    expect(pickDeckMode(0)).toBe("quiet");
  });

  it("is focus with exactly one running job", () => {
    expect(pickDeckMode(1)).toBe("focus");
  });

  it("is grid for two or more running jobs", () => {
    expect(pickDeckMode(2)).toBe("grid");
    expect(pickDeckMode(4)).toBe("grid");
    expect(pickDeckMode(5)).toBe("grid");
    expect(pickDeckMode(40)).toBe("grid");
  });
});
