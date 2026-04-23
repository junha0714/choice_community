import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";

async function fetchPostJson(id: string) {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${api}/posts/${id}`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      title?: string;
      content?: string;
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const base = getSiteUrl();
  const post = await fetchPostJson(id);

  if (!post?.title) {
    return {
      title: "게시글",
      robots: { index: false, follow: false },
    };
  }

  const title = post.title;
  const raw = (post.content ?? "").replace(/\s+/g, " ").trim();
  const description =
    raw.length > 0 ? raw.slice(0, 155) : `${title} · Choice Community`;
  const url = `${base}/posts/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Choice Community",
      locale: "ko_KR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
