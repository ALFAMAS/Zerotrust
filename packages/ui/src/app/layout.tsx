import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ToastProvider } from "../context/ToastContext";
import CookieBanner from "@/components/CookieBanner";
import AnalyticsScript from "@/components/AnalyticsScript";
import ErrorBoundary from "@/components/ErrorBoundary";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 dark:bg-gray-950 text-gray-100 antialiased">
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <ErrorBoundary>
              <ToastProvider>
                {children}
                <CookieBanner />
                <AnalyticsScript />
              </ToastProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
