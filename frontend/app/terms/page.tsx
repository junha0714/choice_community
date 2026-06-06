import type { Metadata } from "next";
import Link from "next/link";
import { AppNotice } from "@/components/AppNotice";
import { SITE_NAME } from "@/lib/site";
import { CARD, PAGE_STACK, SECTION_TITLE } from "@/lib/ui-classes";
export const metadata: Metadata = {
  title: "이용약관",
  description: `${SITE_NAME} 서비스 이용약관`,
};

export default function TermsPage() {
  return (
    <div className={PAGE_STACK}>
      <article className={`${CARD} max-w-3xl`}>
        <h1 className={SECTION_TITLE}>이용약관</h1>
        <AppNotice variant="info" className="mt-4">
          {SITE_NAME} 이용약관 전문은 정식 오픈 전에 게시될 예정이에요. 서비스 이용 시 본
          약관이 적용됩니다.
        </AppNotice>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
          문의·제안은{" "}
          <Link
            href="/board?feed=feedback"
            className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
          >
            피드백 게시판
          </Link>
          을 이용해 주세요.
        </p>
      </article>
    </div>
  );
}
