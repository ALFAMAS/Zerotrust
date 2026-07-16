import { Partytown } from "@qwik.dev/partytown/react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import AnalyticsScript from "@/components/AnalyticsScript";
import CookieBanner from "@/components/CookieBanner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { QueryProvider } from "@/components/QueryProvider";
import { ReverificationProvider } from "@/components/ReverificationProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { brand } from "@/config/brand";
import { directionForLocale, SUPPORTED_LOCALES } from "@/i18n/locales";
import { ToastProvider } from "../context/ToastContext";
import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-levels-sans",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-levels-mono",
  display: "swap",
});

const reactScanEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_REACT_SCAN === "true";

const title = `${brand.name} — ${brand.tagline}`;
const description = brand.description;

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
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
      className={`light ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        {reactScanEnabled ? (
          <Script src="/~react-scan/auto.global.js" strategy="beforeInteractive" />
        ) : null}
        <Partytown forward={["dataLayer.push"]} />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap (same pattern as next-themes)
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,c=d.classList;c.remove('light','dark');var e=localStorage.getItem('theme');var t=e==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):(e==='dark'?'dark':'light');c.add(t);d.style.colorScheme=t}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider defaultTheme="light" enableSystem>
            <ErrorBoundary>
              <QueryProvider>
                <ReverificationProvider>
                  <ToastProvider>
                    {children}
                    <CookieBanner />
                    <AnalyticsScript />
                    <ServiceWorkerRegistrar />
                  </ToastProvider>
                </ReverificationProvider>
              </QueryProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
