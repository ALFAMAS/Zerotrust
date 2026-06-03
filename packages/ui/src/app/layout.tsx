import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "../context/ToastContext";
import CookieBanner from "@/components/CookieBanner";
import { brand } from "@/config/brand";
import "./globals.css";

const title = `${brand.name} — ${brand.tagline}`;
const description = brand.description;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["authentication", "zero trust", "passkeys", "webauthn", "mfa", "security"],
  manifest: "/manifest.json",
  themeColor: brand.color,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: brand.name,
  },
  openGraph: {
    title,
    description,
    type: "website",
    siteName: brand.name,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 dark:bg-gray-950 text-gray-100 antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ToastProvider>
            {children}
            <CookieBanner />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
