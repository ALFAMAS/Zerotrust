import { vi } from "vitest";

export const mockApiGet = vi.fn();
export const mockApiPost = vi.fn();
export const mockApiPatch = vi.fn();
export const mockApiPut = vi.fn();
export const mockApiPostFormData = vi.fn();
export const mockApiPostRaw = vi.fn();
export const mockApiGetBlob = vi.fn();
export const mockApiDelete = vi.fn();

export function resetApiClientMocks() {
  mockApiGet.mockReset();
  mockApiPost.mockReset();
  mockApiPatch.mockReset();
  mockApiPut.mockReset();
  mockApiPostFormData.mockReset();
  mockApiPostRaw.mockReset();
  mockApiGetBlob.mockReset();
  mockApiDelete.mockReset();
}
