import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorageState } from "../useLocalStorageState";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useLocalStorageState", () => {
  it("falls back to `initial` when no value is in storage", () => {
    const { result } = renderHook(() => useLocalStorageState("k", "hello"));
    expect(result.current[0]).toBe("hello");
  });

  it("hydrates from storage when present", () => {
    window.localStorage.setItem("k", JSON.stringify("from-storage"));
    const { result } = renderHook(() => useLocalStorageState("k", "fallback"));
    expect(result.current[0]).toBe("from-storage");
  });

  it("falls back to `initial` when stored value is corrupt JSON", () => {
    window.localStorage.setItem("k", "{not-json");
    const { result } = renderHook(() => useLocalStorageState("k", 42));
    expect(result.current[0]).toBe(42);
  });

  it("persists updates back to storage", () => {
    const { result } = renderHook(() => useLocalStorageState("k", 0));
    act(() => result.current[1](7));
    expect(result.current[0]).toBe(7);
    expect(window.localStorage.getItem("k")).toBe("7");
  });

  it("supports the updater-function form like useState", () => {
    const { result } = renderHook(() => useLocalStorageState("counter", 10));
    act(() => result.current[1]((prev) => prev + 5));
    expect(result.current[0]).toBe(15);
    expect(window.localStorage.getItem("counter")).toBe("15");
  });
});

