import { describe, it, expect } from "vitest";
import { pickDeckMode } from "../controlMode";

describe("pickDeckMode", () => {
  it("is quiet with no running jobs", () => {
    expect(pickDeckMode(0, 0)).toBe("quiet");
  });

  it("is focus with exactly one running job", () => {
    expect(pickDeckMode(1, 1)).toBe("focus");
  });

  it("is spread for a handful on a single host", () => {
    expect(pickDeckMode(2, 1)).toBe("spread");
    expect(pickDeckMode(3, 1)).toBe("spread");
    expect(pickDeckMode(4, 1)).toBe("spread");
  });

  it("is fleet past the spread cap on a single host", () => {
    expect(pickDeckMode(5, 1)).toBe("fleet");
    expect(pickDeckMode(12, 1)).toBe("fleet");
  });

  it("is fleet whenever work is distributed across hosts", () => {
    expect(pickDeckMode(2, 2)).toBe("fleet");
    expect(pickDeckMode(4, 3)).toBe("fleet");
  });
});
