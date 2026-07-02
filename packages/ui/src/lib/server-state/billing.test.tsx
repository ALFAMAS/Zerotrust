import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiGet, mockApiPost } from "@/test/apiClientMock";
import {
  billingKeys,
  buildBillingPricingPath,
  useBillingCancelMutation,
  useBillingCurrenciesQuery,
  useBillingPricingQuery,
  useBillingSubscriptionQuery,
} from "./billing";


function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("billing TanStack Query server state", () => {
  
  it("models billing query keys and encoded pricing paths", () => {
    expect(billingKeys.subscription()).toEqual(["billing", "subscription"]);
    expect(billingKeys.currencies()).toEqual(["billing", "currencies"]);
    expect(billingKeys.pricing("EUR", "en-GB")).toEqual([
      "billing",
      "pricing",
      { currency: "EUR", locale: "en-GB" },
    ]);
    expect(buildBillingPricingPath("EUR", "en-GB")).toBe(
      "/billing/pricing?currency=EUR&locale=en-GB"
    );
  });

  it("fetches subscription, currencies, and pricing through apiClient", async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === "/billing/subscription") return Promise.resolve({ plan: "pro", status: "active" });
      if (path === "/billing/currencies") return Promise.resolve({ currencies: [{ code: "USD" }] });
      if (path === "/billing/pricing?currency=USD&locale=en-US") {
        return Promise.resolve({ plans: [{ plan: "pro", formatted: "$29", pppDiscountPercent: 0 }] });
      }
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    const { Wrapper } = wrapper();

    const subscription = renderHook(() => useBillingSubscriptionQuery(), { wrapper: Wrapper });
    const currencies = renderHook(() => useBillingCurrenciesQuery(), { wrapper: Wrapper });
    const pricing = renderHook(() => useBillingPricingQuery("USD", "en-US"), { wrapper: Wrapper });

    await waitFor(() => expect(subscription.result.current.data?.plan).toBe("pro"));
    await waitFor(() => expect(currencies.result.current.data?.currencies[0]?.code).toBe("USD"));
    await waitFor(() => expect(pricing.result.current.data?.plans[0]?.formatted).toBe("$29"));
    expect(mockApiGet).toHaveBeenCalledWith("/billing/subscription");
    expect(mockApiGet).toHaveBeenCalledWith("/billing/currencies");
    expect(mockApiGet).toHaveBeenCalledWith("/billing/pricing?currency=USD&locale=en-US");
  });

  it("invalidates the subscription after cancellation mutation settles", async () => {
    mockApiPost.mockResolvedValue({ offer: { code: "SAVE20" } });
    const { Wrapper, queryClient } = wrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useBillingCancelMutation(), { wrapper: Wrapper });

    await result.current.mutateAsync({ action: "cancel", reason: "Too expensive", comment: "" });

    expect(mockApiPost).toHaveBeenCalledWith("/billing/cancel", {
      action: "cancel",
      reason: "Too expensive",
      comment: "",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: billingKeys.subscription() });
  });
});
