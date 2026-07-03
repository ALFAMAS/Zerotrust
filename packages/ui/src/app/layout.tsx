import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
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
      className={`dark ${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <head>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap (same pattern as next-themes)
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement,c=d.classList;c.remove('light','dark');var e=localStorage.getItem('theme');if(e==='system'||(!e&&true)){var m=window.matchMedia('(prefers-color-scheme: dark)');c.add(m.matches?'dark':'light')}else if(e==='light'||e==='dark'){c.add(e)}else{c.add('dark')}var cs=e==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):(e||'dark');if(cs==='light'||cs==='dark')d.style.colorScheme=cs}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider defaultTheme="dark" enableSystem>
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
