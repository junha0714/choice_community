import type { Metadata } from "next";
import BoardClient from "../board-client";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "게시판",
  description: `${SITE_NAME} 고민·공지·피드백 게시판`,
};

export default function BoardPage() {
  return <BoardClient />;
}
