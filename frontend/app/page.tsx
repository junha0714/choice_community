import type { Metadata } from "next";
import HomeClient from "./home-client";

const desc =
  "투표로 모으고, AI로 정리하고, 후기로 검증하는 선택지 커뮤니티. 지금 올라온 고민을 확인해 보세요.";

export const metadata: Metadata = {
  title: "홈",
  description: desc,
  openGraph: {
    title: "Choice Community",
    description: desc,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Choice Community",
    description: desc,
  },
};

export default function HomePage() {
  return <HomeClient />;
}
