import { TAG_CHIP } from "@/lib/ui-classes";

type TagChipProps = {
  tag: string;
  className?: string;
};

export function TagChip({ tag, className = "" }: TagChipProps) {
  return (
    <span className={[TAG_CHIP, className].filter(Boolean).join(" ")}>
      #{tag}
    </span>
  );
}
