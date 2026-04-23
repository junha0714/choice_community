import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { CommunityShell } from "@/components/CommunityShell";
import { HeaderNav } from "@/components/HeaderNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme-storage";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteDescription =
  "투표로 모으고, AI로 정리하고, 후기로 검증하는 선택지 커뮤니티.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Choice Community",
    template: "%s · Choice Community",
  },
  description: siteDescription,
  keywords: ["커뮤니티", "고민", "투표", "AI", "선택", "일상"],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Choice Community",
    title: "Choice Community",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Choice Community",
    description: siteDescription,
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
            __html: `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=document.documentElement;var dark=(t==="dark");if(dark)d.classList.add("dark");else d.classList.remove("dark");}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background bg-[radial-gradient(ellipse_120%_80%_at_50%_-28%,rgba(14,165,233,0.14),transparent_58%),radial-gradient(ellipse_90%_55%_at_100%_0%,rgba(56,189,248,0.1),transparent_52%),radial-gradient(ellipse_70%_45%_at_0%_100%,rgba(125,211,252,0.09),transparent_55%)] text-zinc-900 dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-28%,rgba(56,189,248,0.08),transparent_58%),radial-gradient(ellipse_90%_55%_at_100%_0%,rgba(14,165,233,0.06),transparent_52%),radial-gradient(ellipse_70%_45%_at_0%_100%,rgba(14,165,233,0.05),transparent_55%)] dark:text-zinc-100">
        <a
          href="#main-content"
          className="skip-link"
        >
          본문으로 건너뛰기
        </a>
        <header className="sticky top-0 z-50 border-b border-sky-200/60 bg-white/80 shadow-sm shadow-sky-900/5 backdrop-blur-md dark:border-sky-900/50 dark:bg-zinc-950/75 dark:shadow-sky-950/20">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="group shrink-0 text-lg font-semibold tracking-tight"
            >
              <span className="bg-linear-to-r from-sky-600 via-sky-500 to-cyan-500 bg-clip-text text-transparent">
                Choice
              </span>
              <span className="text-zinc-800 dark:text-sky-100/95"> Community</span>
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
          <div className="mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
            <Suspense fallback={<div />}>
              <CommunityShell>{children}</CommunityShell>
            </Suspense>
          </div>
        </div>

        <footer className="border-t border-sky-200/60 bg-white/60 backdrop-blur-sm dark:border-sky-900/50 dark:bg-zinc-950/60">
          <div className="mx-auto max-w-7xl px-4 py-8 text-xs text-zinc-500 dark:text-sky-200/70 sm:px-6">
            © {new Date().getFullYear()} Choice Community
          </div>
        </footer>
      </body>
    </html>
  );
}
