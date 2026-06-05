import { User } from "lucide-react";

type ProfileAvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<ProfileAvatarSize, { box: string; icon: string }> = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5" },
  md: { box: "h-10 w-10", icon: "h-5 w-5" },
  lg: { box: "h-16 w-16", icon: "h-8 w-8" },
};

type ProfileAvatarProps = {
  size?: ProfileAvatarSize;
  /** 추후 프로필 사진 URL 연동용 */
  imageUrl?: string | null;
  className?: string;
};

export function ProfileAvatar({
  size = "md",
  imageUrl,
  className = "",
}: ProfileAvatarProps) {
  const { box, icon } = SIZE_CLASS[size];

  if (imageUrl?.trim()) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={`${box} shrink-0 rounded-full object-cover ring-1 ring-zinc-200/80 dark:ring-[#223141] ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:ring-[#223141] ${className}`}
      aria-hidden
    >
      <User className={icon} strokeWidth={2} />
    </span>
  );
}
