import {
  BedDouble,
  BriefcaseBusiness,
  Cross,
  Flower2,
  GraduationCap,
  Home,
  Landmark,
  MapPin,
  Route,
  TrainFront,
  Trees,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCategorySlug } from "@/types/database";

export const PLACE_CATEGORIES: ReadonlyArray<{
  slug: PlaceCategorySlug;
  label: string;
  iconKey: string;
}> = [
  { slug: "home", label: "家与住所", iconKey: "home" },
  { slug: "school", label: "学校与教育", iconKey: "school" },
  { slug: "work", label: "工作场所", iconKey: "work" },
  { slug: "food", label: "餐饮", iconKey: "food" },
  { slug: "transport", label: "交通地点", iconKey: "transport" },
  { slug: "street", label: "城市街道", iconKey: "street" },
  { slug: "nature", label: "公园与自然", iconKey: "nature" },
  { slug: "landmark", label: "文化与地标", iconKey: "landmark" },
  { slug: "medical", label: "医疗", iconKey: "medical" },
  { slug: "travel", label: "旅行住宿", iconKey: "travel" },
  { slug: "memorial", label: "纪念地点", iconKey: "memorial" },
  { slug: "other", label: "其他", iconKey: "other" },
] as const;

const ICONS: Record<PlaceCategorySlug, LucideIcon> = {
  home: Home,
  school: GraduationCap,
  work: BriefcaseBusiness,
  food: Utensils,
  transport: TrainFront,
  street: Route,
  nature: Trees,
  landmark: Landmark,
  medical: Cross,
  travel: BedDouble,
  memorial: Flower2,
  other: MapPin,
};

export function normalizeCategory(value: string | null | undefined): PlaceCategorySlug {
  return PLACE_CATEGORIES.some((category) => category.slug === value)
    ? (value as PlaceCategorySlug)
    : "other";
}

export function getCategoryLabel(value: string | null | undefined) {
  const slug = normalizeCategory(value);
  return PLACE_CATEGORIES.find((category) => category.slug === slug)?.label ?? "其他";
}

export function getCategoryIcon(value: string | null | undefined): LucideIcon {
  return ICONS[normalizeCategory(value)] ?? MapPin;
}

export function getVisibilityMarkerGlyph(visibility: "public" | "private" | "group") {
  return visibility === "private" ? "▣" : visibility === "group" ? "◇" : "●";
}

export function PlaceCategoryIcon({
  category,
  size = 18,
}: {
  category: string | null | undefined;
  size?: number;
}) {
  const label = getCategoryLabel(category);
  const props = { "aria-label": label, role: "img", size, strokeWidth: 1.9 } as const;
  switch (normalizeCategory(category)) {
    case "home": return <Home {...props} />;
    case "school": return <GraduationCap {...props} />;
    case "work": return <BriefcaseBusiness {...props} />;
    case "food": return <Utensils {...props} />;
    case "transport": return <TrainFront {...props} />;
    case "street": return <Route {...props} />;
    case "nature": return <Trees {...props} />;
    case "landmark": return <Landmark {...props} />;
    case "medical": return <Cross {...props} />;
    case "travel": return <BedDouble {...props} />;
    case "memorial": return <Flower2 {...props} />;
    default: return <MapPin {...props} />;
  }
}
