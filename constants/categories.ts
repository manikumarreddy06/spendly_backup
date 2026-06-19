import { Ionicons } from "@expo/vector-icons";

export type ExpenseCategory =
  | "travel"
  | "food"
  | "shopping"
  | "entertainment"
  | "healthcare"
  | "others";

export interface BuiltinCategory {
  key: ExpenseCategory;
  label: string;
  icon: string;
  color: string;
  bg: string;
  emoji: string;
}

export const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { key: "food",          label: "Food",          icon: "restaurant",          color: "#f97316", bg: "#fff5e6", emoji: "🍔" },
  { key: "healthcare",    label: "Fuel",          icon: "car",                 color: "#0ea5e9", bg: "#f0f9ff", emoji: "⛽" },
  { key: "entertainment", label: "Coffee",        icon: "cafe",                color: "#b45309", bg: "#fdf8f2", emoji: "☕" },
  { key: "shopping",      label: "Shopping",      icon: "bag-handle",          color: "#a855f7", bg: "#f5ebff", emoji: "🛍️" },
  { key: "travel",        label: "Travel",        icon: "airplane",            color: "#10b981", bg: "#e6f7f0", emoji: "✈️" },
  { key: "others",        label: "Others",        icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5", emoji: "🧾" },
];

export const CATEGORY_EMOJIS: Record<ExpenseCategory, string> = {
  food: "🍔",
  healthcare: "⛽",
  entertainment: "☕",
  shopping: "🛍️",
  travel: "✈️",
  others: "🧾",
};

export const BUILTIN_META = BUILTIN_CATEGORIES.reduce((acc, cat) => {
  acc[cat.key] = { label: cat.label, icon: cat.icon, color: cat.color, bg: cat.bg };
  return acc;
}, {} as Record<ExpenseCategory, { label: string; icon: string; color: string; bg: string }>);

// ── Income Categories ──────────────────────────────────────────────────────

export type IncomeCategory =
  | "salary"
  | "freelance"
  | "investment"
  | "gifts"
  | "refunds"
  | "other_income";

export interface BuiltinIncomeCategory {
  key: IncomeCategory;
  label: string;
  icon: string;
  color: string;
  bg: string;
  emoji: string;
}

export const BUILTIN_INCOME_CATEGORIES: BuiltinIncomeCategory[] = [
  { key: "salary",        label: "Salary",       icon: "briefcase",      color: "#10b981", bg: "#e6f7f0", emoji: "💼" },
  { key: "freelance",     label: "Freelance",    icon: "laptop-outline", color: "#059669", bg: "#e6f7f0", emoji: "💻" },
  { key: "investment",    label: "Investment",   icon: "trending-up",    color: "#0d9488", bg: "#e6f7f0", emoji: "📈" },
  { key: "gifts",         label: "Gifts",        icon: "gift",           color: "#16a34a", bg: "#e6f7f0", emoji: "🎁" },
  { key: "refunds",       label: "Refunds",      icon: "return-up-back", color: "#22c55e", bg: "#e6f7f0", emoji: "↩️" },
  { key: "other_income",  label: "Other Income", icon: "add-circle",     color: "#6b7280", bg: "#f0f2f5", emoji: "➕" },
];

export const BUILTIN_INCOME_META = BUILTIN_INCOME_CATEGORIES.reduce((acc, cat) => {
  acc[cat.key] = { label: cat.label, icon: cat.icon, color: cat.color, bg: cat.bg };
  return acc;
}, {} as Record<IncomeCategory, { label: string; icon: string; color: string; bg: string }>);

export type CatMeta = { label: string; icon: string; color: string; bg: string };

export function resolveExpenseMeta(
  category: string | null | undefined,
  customCategories: { id: string; name: string; color: string; icon: string }[],
  colors?: any
): CatMeta {
  if (category && category in BUILTIN_META) {
    const builtin = BUILTIN_META[category as ExpenseCategory];
    const color = (colors && colors[category]) || builtin.color;
    return {
      ...builtin,
      color,
      bg: color + "18",
    };
  }
  const custom = category ? customCategories.find((c) => c.id === category) : undefined;
  if (custom) {
    return {
      label: custom.name,
      icon: custom.icon,
      color: custom.color,
      bg: custom.color + "18",
    };
  }
  if (category && category in BUILTIN_INCOME_META) {
    const meta = BUILTIN_INCOME_META[category as IncomeCategory];
    return {
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      bg: meta.color + "18",
    };
  }
  const defaultColor = (colors && colors.mutedForeground) || "#6b7280";
  return {
    label: "Others",
    icon: "ellipsis-horizontal",
    color: defaultColor,
    bg: defaultColor + "18",
  };
}

