import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Testing Library doesn't auto-cleanup with vitest's globals
// unless we wire it explicitly here.
afterEach(() => {
  cleanup();
});

// JSDOM doesn't ship matchMedia (antd's responsive components
// instantiate this on mount). Stub it so component renders don't
// crash with `matchMedia is not a function`.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// JSDOM also lacks ResizeObserver (used by antd's tooltips/popovers
// and by Table's column-fit logic). Stub a no-op.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverStub,
});
