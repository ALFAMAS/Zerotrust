import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import AnalyticsScript from "@/components/AnalyticsScript";
import CookieBanner from "@/components/CookieBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { brand } from "@/config/brand";
import { directionForLocale, SUPPORTED_LOCALES } from "@/i18n/locales";
import { ToastProvider } from "../context/ToastContext";
import "./globals.css";

const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const fontSans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const title = `${brand.name} — ${brand.tagline}`;
const description = brand.description;

export const metadata: Metadata = {
  title,
  description,
  keywords: ["authentication", "zero trust", "passkeys", "webauthn", "mfa", "security"],
  manifest: "/manifest.json",
  alternates: {
    canonical: brand.url,
    languages: {
      ...Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, `${brand.url}/${locale}`])),
      "x-default": brand.url,
    },
  },
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

export const viewport: Viewport = {
  themeColor: brand.color,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={directionForLocale(locale)}
      suppressHydrationWarning
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="bg-background font-sans text-foreground antialiased">
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
                <ServiceWorkerRegistrar />
              </ToastProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
