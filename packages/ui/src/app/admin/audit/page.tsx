import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { auditEntriesPrefetchOptions } from "@/lib/server-state/prefetch";
import AuditClient from "./AuditClient";

export default async function AuditPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery(auditEntriesPrefetchOptions()).catch(() => undefined);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AuditClient />
    </HydrationBoundary>
  );
}
