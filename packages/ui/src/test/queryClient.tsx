import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithQueryClient(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = createTestQueryClient();
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
  return { ...result, queryClient };
}
