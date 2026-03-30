import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { CommunityShell } from "@/components/CommunityShell";
import { HeaderNav } from "@/components/HeaderNav";
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
  title: "Choice Community",
  description: "AI 선택 고민 커뮤니티",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 bg-[radial-gradient(ellipse_120%_80%_at_50%_-30%,rgba(139,92,246,0.11),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_0%,rgba(99,102,241,0.06),transparent_50%)] text-zinc-900">
        <header className="sticky top-0 z-50 border-b border-zinc-200/60 bg-white/75 shadow-sm shadow-zinc-900/5 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="group shrink-0 text-lg font-semibold tracking-tight"
            >
              <span className="bg-linear-to-r from-violet-600 via-indigo-600 to-indigo-500 bg-clip-text text-transparent">
                Choice
              </span>
              <span className="text-zinc-800"> Community</span>
            </Link>
            <HeaderNav />
          </div>
        </header>

        <div className="mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
          <CommunityShell>{children}</CommunityShell>
        </div>

        <footer className="border-t border-zinc-200/60 bg-white/60 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 py-8 text-xs text-zinc-500 sm:px-6">
            © {new Date().getFullYear()} Choice Community
          </div>
        </footer>
      </body>
    </html>
  );
}
