import {
  Ellipsis,
  Gamepad2,
  GraduationCap,
  Heart,
  Home,
  Megaphone,
  MessageSquare,
  PawPrint,
  Plane,
  Shirt,
  ShoppingBag,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { categoryDisplayName, normalizeCategory } from "@/lib/categories";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "음식·카페": UtensilsCrossed,
  "패션·뷰티": Shirt,
  "진로·커리어": GraduationCap,
  "연애·인간관계": Heart,
  "취미·여가": Gamepad2,
  "주거·생활": Home,
  "쇼핑·소비": ShoppingBag,
  "여행·이동": Plane,
  반려동물: PawPrint,
  기타: Ellipsis,
  공지사항: Megaphone,
  건의게시판: MessageSquare,
};

const DEFAULT_ICON = Ellipsis;

type CategoryLabelProps = {
  category: string;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
};

export function CategoryIcon({
  category,
  className = "h-3 w-3 shrink-0 opacity-80",
}: {
  category: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[normalizeCategory(category)] ?? DEFAULT_ICON;
  return <Icon className={className} aria-hidden strokeWidth={2} />;
}

export function CategoryLabel({
  category,
  className = "inline-flex min-w-0 items-center gap-1.5",
  iconClassName = "h-3.5 w-3.5 shrink-0 opacity-85",
  showIcon = true,
}: CategoryLabelProps) {
  const name = categoryDisplayName(category);
  return (
    <span className={className} title={name}>
      {showIcon ? (
        <CategoryIcon category={category} className={iconClassName} />
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
