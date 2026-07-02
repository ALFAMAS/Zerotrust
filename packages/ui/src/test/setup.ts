import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import {
  mockApiDelete,
  mockApiGet,
  mockApiGetBlob,
  mockApiPatch,
  mockApiPost,
  mockApiPostFormData,
  mockApiPut,
} from "./apiClientMock";

vi.mock("@/lib/apiClient", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiPut: (...args: unknown[]) => mockApiPut(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
  apiPostFormData: (...args: unknown[]) => mockApiPostFormData(...args),
  apiGetBlob: (...args: unknown[]) => mockApiGetBlob(...args),
}));

// Unmount rendered components between tests so state/DOM doesn't leak across cases.
afterEach(() => {
  cleanup();
});

// next/link renders a real <a>, which is fine under happy-dom without a
// router context. Components that call next/navigation hooks (useRouter,
// usePathname, etc.) or read `window.location` directly still work — happy-dom
// provides a real Location object — but tests should mock fetch/api calls
// explicitly per-file rather than relying on network access here.

// Silence sonner's toast calls in tests unless a test explicitly asserts on
// them — sonner tries to find/create a portal root, which is unnecessary
// noise for component tests that only care about form/state behavior.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
