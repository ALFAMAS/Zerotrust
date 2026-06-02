import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZeroAuth — Zero Trust Authentication",
  description: "Enterprise-grade authentication for modern applications. PASETO tokens, WebAuthn passkeys, MFA, RBAC, and more.",
  keywords: ["authentication", "zero trust", "passkeys", "webauthn", "mfa", "security"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
