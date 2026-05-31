import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionStorageState } from "../useSessionStorageState";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("useSessionStorageState", () => {
  it("falls back to `initial` when no value is in storage", () => {
    const { result } = renderHook(() => useSessionStorageState("k", "hello"));
    expect(result.current[0]).toBe("hello");
  });

  it("hydrates from storage when present", () => {
    window.sessionStorage.setItem("k", JSON.stringify("from-storage"));
    const { result } = renderHook(() => useSessionStorageState("k", "fallback"));
    expect(result.current[0]).toBe("from-storage");
  });

  it("falls back to `initial` when stored value is corrupt JSON", () => {
    window.sessionStorage.setItem("k", "{not-json");
    const { result } = renderHook(() => useSessionStorageState("k", 42));
    expect(result.current[0]).toBe(42);
  });

  it("persists updates back to storage", () => {
    const { result } = renderHook(() => useSessionStorageState("k", 0));
    act(() => result.current[1](7));
    expect(result.current[0]).toBe(7);
    expect(window.sessionStorage.getItem("k")).toBe("7");
  });

  it("supports the updater-function form like useState", () => {
    const { result } = renderHook(() => useSessionStorageState("counter", 10));
    act(() => result.current[1]((prev) => prev + 5));
    expect(result.current[0]).toBe(15);
    expect(window.sessionStorage.getItem("counter")).toBe("15");
  });

  it("does not leak into localStorage", () => {
    const { result } = renderHook(() => useSessionStorageState("scope", "x"));
    act(() => result.current[1]("y"));
    expect(window.localStorage.getItem("scope")).toBeNull();
  });
});
