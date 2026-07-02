import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import {
  billingCurrenciesPrefetchOptions,
  billingPricingPrefetchOptions,
  billingSubscriptionPrefetchOptions,
} from "@/lib/server-state/prefetch";
import BillingClient from "./BillingClient";

/** Default currency/locale for server prefetch — matches BillingClient initial state. */
const PREFETCH_CURRENCY = "USD";
const PREFETCH_LOCALE = "en-US";

export default async function BillingPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery(billingSubscriptionPrefetchOptions()).catch(() => undefined),
    queryClient.prefetchQuery(billingCurrenciesPrefetchOptions()).catch(() => undefined),
    queryClient
      .prefetchQuery(billingPricingPrefetchOptions(PREFETCH_CURRENCY, PREFETCH_LOCALE))
      .catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BillingClient />
    </HydrationBoundary>
  );
}
