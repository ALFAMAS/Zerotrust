import { redirect } from "next/navigation";

/** ARCH-1: orphaned `tenants` table removed — organizations are the tenancy boundary. */
export default function AdminTenantsRedirectPage() {
  redirect("/dashboard/organizations");
}
