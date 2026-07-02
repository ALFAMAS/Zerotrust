import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { adminSessionsListPrefetchOptions } from "@/lib/server-state/prefetch";
import SessionsClient from "./SessionsClient";

export default async function SessionsPage() {
  const queryClient = new QueryClient();

  await queryClient
    .prefetchQuery(adminSessionsListPrefetchOptions({ page: 1, limit: 20 }))
    .catch(() => undefined);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SessionsClient />
    </HydrationBoundary>
  );
}
