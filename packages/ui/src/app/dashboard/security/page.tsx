import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { authMePrefetchOptions } from "@/lib/server-state/prefetch";
import SecurityClient from "./SecurityClient";

export default async function SecurityPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery(authMePrefetchOptions()).catch(() => undefined);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SecurityClient />
    </HydrationBoundary>
  );
}
