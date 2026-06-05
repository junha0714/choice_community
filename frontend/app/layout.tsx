import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { AuthSessionKeeper } from "@/components/AuthSessionKeeper";
import { CommunityShell } from "@/components/CommunityShell";
import { HeaderNav } from "@/components/HeaderNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme-storage";
import {
  getSiteUrl,
  SHELL_WIDTH_CLASS,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  keywords: ["PickTalk", "picktalk", "community", "vote", "AI", "choices"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_TAGLINE,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0ea5e9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=document.documentElement;var dark=(t==="dark")||(t!=="light"&&t!=="dark"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)d.classList.add("dark");else d.classList.remove("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background bg-[radial-gradient(ellipse_120%_80%_at_50%_-28%,rgba(14,165,233,0.14),transparent_58%),radial-gradient(ellipse_90%_55%_at_100%_0%,rgba(56,189,248,0.1),transparent_52%),radial-gradient(ellipse_70%_45%_at_0%_100%,rgba(125,211,252,0.09),transparent_55%)] text-zinc-900 dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-28%,rgba(56,189,248,0.08),transparent_58%),radial-gradient(ellipse_90%_55%_at_100%_0%,rgba(14,165,233,0.06),transparent_52%),radial-gradient(ellipse_70%_45%_at_0%_100%,rgba(14,165,233,0.05),transparent_55%)] dark:text-zinc-100">
        <AuthSessionKeeper />
        <a
          href="#main-content"
          className="skip-link"
        >
          본문으로 건너뛰기
        </a>
        <header className="sticky top-0 z-50 border-b border-sky-200/60 bg-white/80 shadow-sm shadow-sky-900/5 backdrop-blur-md dark:border-sky-900/50 dark:bg-zinc-950/75 dark:shadow-sky-950/20">
          <div
            className={`flex items-center justify-between gap-3 py-3 sm:gap-4 ${SHELL_WIDTH_CLASS}`}
          >
            <Link
              href="/"
              className="group shrink-0 text-lg font-semibold tracking-tight"
            >
              <span className="bg-linear-to-r from-sky-600 via-sky-500 to-cyan-500 bg-clip-text text-transparent">
                {SITE_NAME}
              </span>
            </Link>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <ThemeToggle />
              <HeaderNav />
            </div>
          </div>
        </header>

        <div
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col outline-none focus:outline-none"
        >
          <div className={`flex-1 py-6 sm:py-7 md:py-8 lg:py-9 xl:py-10 2xl:py-12 ${SHELL_WIDTH_CLASS}`}>
            <Suspense fallback={<div />}>
              <CommunityShell>{children}</CommunityShell>
            </Suspense>
          </div>
        </div>

        <SiteFooter />
      </body>
    </html>
  );
}
