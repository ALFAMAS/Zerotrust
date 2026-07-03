import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import {
  myOrgInvitesPrefetchOptions,
  organizationsListPrefetchOptions,
} from "@/lib/server-state/prefetch";
import OrganizationsClient from "./OrganizationsClient";

export default async function OrganizationsPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery(organizationsListPrefetchOptions()).catch(() => undefined),
    queryClient.prefetchQuery(myOrgInvitesPrefetchOptions()).catch(() => undefined),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrganizationsClient />
    </HydrationBoundary>
  );
}
