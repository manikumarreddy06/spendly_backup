import type { CustomCategory, Expense, ExpenseCategory } from "@/context/AppContext";

export type MonthBucket = {
  label: string;
  total: number;
  count: number;
  isCurrent: boolean;
  year: number;
  month: number;
};

export type CategoryBreakdownItem = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  amount: number;
};

const BUILTIN: {
  key: ExpenseCategory;
  label: string;
  icon: string;
  color: string;
  bg: string;
}[] = [
  { key: "travel", label: "Travel", icon: "airplane", color: "#10b981", bg: "#e6f7f0" },
  { key: "food", label: "Food", icon: "restaurant", color: "#f97316", bg: "#fff5e6" },
  { key: "shopping", label: "Shopping", icon: "bag-handle", color: "#a855f7", bg: "#f5ebff" },
  { key: "entertainment", label: "Fun", icon: "game-controller", color: "#ec4899", bg: "#fdf0f5" },
  { key: "healthcare", label: "Health", icon: "heart", color: "#ef4444", bg: "#fdebeb" },
  { key: "others", label: "Others", icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5" },
];

export function getExpensesForMonth(expenses: Expense[], year: number, month: number): Expense[] {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function getLast6Months(expenses: Expense[]): MonthBucket[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthExps = getExpensesForMonth(expenses, d.getFullYear(), d.getMonth());
    return {
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      total: monthExps.reduce((s, e) => s + e.amount, 0),
      count: monthExps.length,
      isCurrent: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(),
      year: d.getFullYear(),
      month: d.getMonth(),
    };
  });
}

export function getCategoryBreakdown(
  monthExpenses: Expense[],
  customCategories: CustomCategory[]
): CategoryBreakdownItem[] {
  const items: CategoryBreakdownItem[] = [];

  for (const cat of BUILTIN) {
    const amount = monthExpenses
      .filter((e) => e.category === cat.key)
      .reduce((s, e) => s + e.amount, 0);
    if (amount > 0) items.push({ ...cat, amount });
  }

  for (const custom of customCategories) {
    const amount = monthExpenses
      .filter((e) => e.category === custom.id)
      .reduce((s, e) => s + e.amount, 0);
    if (amount > 0) {
      items.push({
        key: custom.id,
        label: custom.name,
        icon: custom.icon,
        color: custom.color,
        bg: custom.color + "18",
        amount,
      });
    }
  }

  return items.sort((a, b) => b.amount - a.amount);
}

export type MonthComparison = {
  diff: number;
  diffPct: number | null;
  improved: boolean;
  lastMonthLabel: string;
};

export function getMonthComparison(
  currentTotal: number,
  lastMonthTotal: number,
  lastMonthLabel: string
): MonthComparison {
  const diff = currentTotal - lastMonthTotal;
  const diffPct =
    lastMonthTotal > 0 ? Math.round(Math.abs((diff / lastMonthTotal) * 100)) : null;
  return {
    diff,
    diffPct,
    improved: diff <= 0,
    lastMonthLabel,
  };
}

export type SmartInsight = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  bg: string;
};

export function buildSmartInsights(
  expenses: Expense[],
  currentMonthExps: Expense[],
  budgetLimits: Record<string, number>,
  customCategories: CustomCategory[]
): SmartInsight[] {
  const insights: SmartInsight[] = [];
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthExps = getExpensesForMonth(
    expenses,
    lastMonth.getFullYear(),
    lastMonth.getMonth()
  );

  const allCats = [
    ...BUILTIN,
    ...customCategories.map((c) => ({
      key: c.id,
      label: c.name,
      icon: c.icon,
      color: c.color,
      bg: c.color + "18",
    })),
  ];

  for (const cat of allCats) {
    const cur = currentMonthExps
      .filter((e) => e.category === cat.key)
      .reduce((s, e) => s + e.amount, 0);
    const prev = lastMonthExps
      .filter((e) => e.category === cat.key)
      .reduce((s, e) => s + e.amount, 0);
    if (prev > 0 && cur < prev) {
      const pct = Math.round(((prev - cur) / prev) * 100);
      if (pct >= 5) {
        insights.push({
          id: `less-${cat.key}`,
          title: `You spent ${pct}% less on ${cat.label}`,
          subtitle: "Compared to last month 🎉",
          icon: "trending-up",
          color: "#18633f",
          bg: "#18633f",
        });
        break;
      }
    }
  }

  for (const cat of allCats) {
    const limit = budgetLimits[cat.key];
    if (!limit || limit <= 0) continue;
    const spent = currentMonthExps
      .filter((e) => e.category === cat.key)
      .reduce((s, e) => s + e.amount, 0);
    const pct = (spent / limit) * 100;
    if (pct >= 80 && insights.length < 3) {
      insights.push({
        id: `budget-${cat.key}`,
        title: `${cat.label} budget almost reached ✈️`,
        subtitle: `₹${Math.max(limit - spent, 0).toLocaleString("en-IN")} left of ₹${limit.toLocaleString("en-IN")} limit`,
        icon: "warning-outline",
        color: "#ef4444",
        bg: "#ef4444",
      });
    }
  }

  if (currentMonthExps.length > 0) {
    const top = [...currentMonthExps].sort((a, b) => b.amount - a.amount)[0];
    insights.push({
      id: "top",
      title: `Biggest spend: ${top.description || "Expense"}`,
      subtitle: `₹${Math.round(top.amount).toLocaleString("en-IN")} this month`,
      icon: "flash",
      color: "#3b82f6",
      bg: "#3b82f6",
    });
  }

  return insights.slice(0, 3);
}

export function budgetBarColor(pct: number): string {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f97316";
  return "#18633f";
}

export function hasTrendHistory(monthData: MonthBucket[]): boolean {
  const withSpend = monthData.filter((m) => m.total > 0);
  return withSpend.length >= 2;
}
