import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/site";
import { CARD, PAGE_STACK, SECTION_TITLE } from "@/lib/ui-classes";
export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${SITE_NAME} 개인정보처리방침`,
};

export default function PrivacyPage() {
  return (
    <div className={PAGE_STACK}>
      <article className={`${CARD} max-w-3xl`}>
        <h1 className={SECTION_TITLE}>개인정보처리방침</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
          {SITE_NAME}은 회원 가입·로그인·서비스 제공에 필요한 최소한의 정보를
          수집·이용합니다. 개인정보처리방침 전문은 준비 중이며, 정식 오픈 전에
          공개됩니다.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-[#9bb3c7]">
          <li>수집 항목: 이메일, 닉네임, 비밀번호(암호화 저장) 등</li>
          <li>이용 목적: 회원 식별, 게시·투표·댓글 서비스 제공</li>
          <li>보관 기간: 회원 탈퇴 시 또는 관련 법령에 따른 기간</li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-[#9bb3c7]">
          관련 문의는{" "}
          <Link
            href="/board?feed=feedback"
            className="font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
          >
            피드백 게시판
          </Link>
          으로 보내 주세요.
        </p>
      </article>
    </div>
  );
}
