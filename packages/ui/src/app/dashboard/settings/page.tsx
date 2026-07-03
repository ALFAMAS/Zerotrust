import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { oauthProvidersPrefetchOptions } from "@/lib/server-state/prefetch";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery(oauthProvidersPrefetchOptions()).catch(() => undefined);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsClient />
    </HydrationBoundary>
  );
}
