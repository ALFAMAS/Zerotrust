import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { authMePrefetchOptions, userSessionsPrefetchOptions } from "@/lib/server-state/prefetch";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery(authMePrefetchOptions()).catch(() => undefined),
    queryClient.prefetchQuery(userSessionsPrefetchOptions()).catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
