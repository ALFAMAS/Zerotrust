import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import {
  walletPrefetchOptions,
  walletTransactionsPrefetchOptions,
} from "@/lib/server-state/prefetch";
import WalletClient from "./WalletClient";

export default async function WalletPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery(walletPrefetchOptions()).catch(() => undefined),
    queryClient.prefetchQuery(walletTransactionsPrefetchOptions()).catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WalletClient />
    </HydrationBoundary>
  );
}
