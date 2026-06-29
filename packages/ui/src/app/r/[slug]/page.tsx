import { redirect } from "next/navigation";

/**
 * Referral short-link landing page.
 *
 * Matches /r/:slug (e.g. /r/alfamas). Looks up the referral by slug via the
 * API server, sets a tracking cookie, and redirects to /register?ref=CODE.
 *
 * The actual click tracking (IP/UA/utm) happens server-side at the API layer;
 * this page just needs to resolve the slug → code and pass it to the register
 * form so signup can attribute the new account.
 */
export default async function ReferralPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Resolve slug → referral code via API
  const apiUrl =
    process.env.NEXT_PUBLIC_ZEROTRUST_URL ?? "http://localhost:1337";

  try {
    const res = await fetch(`${apiUrl}/wallet/referrals/resolve?slug=${encodeURIComponent(slug)}`, {
      // No auth needed — this is a public endpoint
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      if (data.code) {
        // Redirect to register with the referral code; the register page reads
        // ?ref= from URL search params and includes it in the signup payload.
        redirect(`/register?ref=${encodeURIComponent(data.code)}`);
      }
    }
  } catch {
    // Fall through to register without ref on any error
  }

  // Slug not found or API unreachable — send to register without ref
  redirect("/register");
}
