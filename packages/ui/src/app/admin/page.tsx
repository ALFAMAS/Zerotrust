import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import {
  adminRecentUsersPrefetchOptions,
  adminStatsPrefetchOptions,
} from "@/lib/server-state/prefetch";
import AdminOverviewClient from "./AdminOverviewClient";

export default async function AdminOverviewPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery(adminStatsPrefetchOptions()).catch(() => undefined),
    queryClient.prefetchQuery(adminRecentUsersPrefetchOptions(5)).catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminOverviewClient />
    </HydrationBoundary>
  );
}
