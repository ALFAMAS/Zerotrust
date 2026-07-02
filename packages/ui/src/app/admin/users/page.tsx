import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { adminUsersListPrefetchOptions } from "@/lib/server-state/prefetch";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const queryClient = new QueryClient();

  await queryClient
    .prefetchQuery(adminUsersListPrefetchOptions({ page: 1, status: "all" }))
    .catch(() => undefined);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UsersClient />
    </HydrationBoundary>
  );
}
