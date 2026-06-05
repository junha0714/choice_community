import { redirect } from "next/navigation";
import { SUGGESTION_CATEGORY } from "@/lib/board-categories";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WriteRedirectPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const category =
    typeof sp.category === "string"
      ? sp.category.trim()
      : Array.isArray(sp.category)
        ? sp.category[0]?.trim() ?? ""
        : "";

  if (category === SUGGESTION_CATEGORY) {
    redirect("/feedback");
  }

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    }
  }
  const query = qs.toString();
  redirect(`/write/ai${query ? `?${query}` : ""}`);
}
