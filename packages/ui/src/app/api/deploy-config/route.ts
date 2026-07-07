import { NextResponse } from "next/server";
import { normalizeApiUrl } from "@/config/publicApiUrl";

/** Public deploy probe — exposes the baked-in API base URL for ops smoke (OPS-2). */
export function GET() {
  const apiUrl = normalizeApiUrl(
    process.env.NEXT_PUBLIC_ZEROTRUST_URL ?? "http://localhost:1337",
  );
  return NextResponse.json({ apiUrl });
}
