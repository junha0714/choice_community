import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MainClient from "./main-client";
import { SITE_HOME_DESC, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "홈",
  description: SITE_HOME_DESC,
  openGraph: {
    title: SITE_NAME,
    description: SITE_HOME_DESC,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_HOME_DESC,
  },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 예전 `/?category=…` 북마크 → 게시판으로 */
export default async function HomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const keys = Object.keys(sp).filter((k) => {
    const v = sp[k];
    return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  if (keys.length > 0) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else p.set(k, String(v));
    }
    redirect(`/board?${p.toString()}`);
  }
  return <MainClient />;
}
