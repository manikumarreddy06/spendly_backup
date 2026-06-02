import type { CustomCategory, Expense, ExpenseCategory } from "@/context/AppContext";
import { BUILTIN_CATEGORIES, resolveExpenseMeta } from "@/constants/categories";

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

const BUILTIN = BUILTIN_CATEGORIES;

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

export type FinancialMetrics = {
  dailyBurnRate: number;
  projectedSpend: number;
  savingsRate: number;
  spendingHealthScore: number;
  overspendingForecastText: string | null;
  projectedOverspend: boolean;
};

export function calculateFinancialMetrics(
  currentMonthExps: Expense[],
  salary: number,
  budgetLimits: Record<string, number>,
  customCategories: CustomCategory[]
): FinancialMetrics {
  const now = new Date();
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const spent = currentMonthExps.reduce((s, e) => s + e.amount, 0);
  
  // 1. Daily Burn Rate
  const dailyBurnRate = currentDay > 0 ? spent / currentDay : spent;
  
  // 2. Projected Spend
  const projectedSpend = dailyBurnRate * totalDays;
  
  // 3. Savings Rate
  const savingsRate = salary > 0 ? ((salary - spent) / salary) * 100 : 0;
  
  // 4. Overspending Forecast
  const projectedOverspend = salary > 0 && projectedSpend > salary;
  let overspendingForecastText: string | null = null;
  if (projectedOverspend) {
    const overspendAmt = projectedSpend - salary;
    overspendingForecastText = `At this pace, you'll exceed your limit by ₹${Math.round(overspendAmt).toLocaleString("en-IN")} this month.`;
  } else if (salary > 0 && spent < salary) {
    const daysLeft = totalDays - currentDay;
    const remainingBudget = salary - spent;
    const safeDailySpend = daysLeft > 0 ? remainingBudget / daysLeft : remainingBudget;
    overspendingForecastText = daysLeft > 0 
      ? `Keep daily spends under ₹${Math.round(safeDailySpend).toLocaleString("en-IN")} for the next ${daysLeft} days to stay on track.`
      : `Outstanding budget pacing! You are fully on track to finish this month within limit.`;
  }
  
  // 5. Spending Health Score (Calm, mathematical, and accurate)
  let score = 100;

  if (salary > 0) {
    // Base score on savings rate:
    // A healthy savings rate is 20% or more.
    // If savings rate is negative (spent > salary), score drops heavily.
    if (savingsRate < 0) {
      score = 40 + Math.max(-30, savingsRate); // heavily penalized (10 - 40 points)
    } else {
      // Scale points from savings rate (0% saving = 50 score, 20% saving = 80 score, 40%+ saving = 100 score)
      if (savingsRate >= 40) {
        score = 100;
      } else if (savingsRate >= 20) {
        // Linear between 80 and 100
        score = 80 + ((savingsRate - 20) / 20) * 20;
      } else {
        // Linear between 50 and 80
        score = 50 + (savingsRate / 20) * 30;
      }
    }

    // Pacing adjustment:
    // How fast are they burning their salary?
    const expectedPacing = currentDay / totalDays;
    const actualPacing = spent / salary;
    
    if (actualPacing > expectedPacing && savingsRate > 0) {
      const pacingDiff = actualPacing - expectedPacing; // e.g. 0.15 ahead
      // Deduct up to 25 points for pacing ahead of schedule
      const deduction = Math.min(25, Math.round(pacingDiff * 50));
      score -= deduction;
    }
  } else {
    // If no salary/budget is set, we evaluate health based on category budgets (if any) or past spending.
    // Default base score is 75 for neutral tracking.
    score = 75;
  }

  // Category budget limit deductions
  let exceededCatsCount = 0;
  let hasBudgets = false;
  Object.entries(budgetLimits).forEach(([key, limit]) => {
    if (limit <= 0) return;
    hasBudgets = true;
    const catSpent = currentMonthExps.filter(e => e.category === key).reduce((s, e) => s + e.amount, 0);
    if (catSpent > limit) {
      exceededCatsCount++;
    }
  });

  if (hasBudgets) {
    // Deduct 10 points per exceeded category limit
    score -= exceededCatsCount * 10;
  }

  score = Math.min(100, Math.max(10, Math.round(score)));
  
  return {
    dailyBurnRate,
    projectedSpend,
    savingsRate,
    spendingHealthScore: score,
    overspendingForecastText,
    projectedOverspend,
  };
}

export type DashboardInsight = { text: string; icon: string; iconBg: string };

export function getDashboardInsights(
  allExpenses: Expense[],
  customCategories: CustomCategory[],
  budgetLimit: number,
  colors: any
): DashboardInsight[] {
  const results: DashboardInsight[] = [];

  const now = new Date();
  const msInDay = 86400000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek1 = startOfToday - 6 * msInDay;
  const startOfWeek2 = startOfToday - 13 * msInDay;

  if (allExpenses.length === 0) {
    return [
      { text: "Add your first expense to see spending insights! 📊", icon: "bulb-outline", iconBg: "#6366f1" },
      { text: "Track your expenses daily to build better financial habits 💪", icon: "calendar-outline", iconBg: "#8b5cf6" },
      { text: "Set a monthly budget in Settings to stay on track 🎯", icon: "flag-outline", iconBg: colors.primary },
    ];
  }

  let w1Total = 0;
  let w2Total = 0;
  const w1CategoryTotals: Record<string, number> = {};
  const w2CategoryTotals: Record<string, number> = {};
  let monthTotal = 0;
  const allCatTotals: Record<string, number> = {};

  allExpenses.forEach((e) => {
    const d = new Date(e.date);
    const t = d.getTime();
    allCatTotals[e.category] = (allCatTotals[e.category] || 0) + e.amount;
    
    const isCurrentMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (isCurrentMonth) monthTotal += e.amount;

    if (t >= startOfWeek1 && t <= now.getTime()) {
      w1Total += e.amount;
      w1CategoryTotals[e.category] = (w1CategoryTotals[e.category] || 0) + e.amount;
    } else if (t >= startOfWeek2 && t < startOfWeek1) {
      w2Total += e.amount;
      w2CategoryTotals[e.category] = (w2CategoryTotals[e.category] || 0) + e.amount;
    }
  });

  const fmt = (n: number): string => Math.round(n).toLocaleString("en-IN");
  const GREEN = "#18633f";

  // Insight 1: week-over-week overall trend
  if (w1Total > 0 && w2Total > 0) {
    const diff = w2Total - w1Total;
    const pct = Math.round((Math.abs(diff) / w2Total) * 100);
    if (pct >= 5) {
      if (diff > 0) {
        results.push({ text: `You spent ${pct}% less this week vs last week 🎉`, icon: "trending-down", iconBg: "#10b981" });
      } else {
        results.push({ text: `Heads up! Spending is up ${pct}% vs last week 📉`, icon: "trending-up", iconBg: "#ef4444" });
      }
    } else {
      results.push({ text: `Steady spender! This week (₹${fmt(w1Total)}) ≈ last week (₹${fmt(w2Total)}) ⚖️`, icon: "scale-outline", iconBg: GREEN });
    }
  } else if (w1Total > 0) {
    results.push({ text: `You spent ₹${fmt(w1Total)} this week across ${Object.keys(w1CategoryTotals).length} categories 💰`, icon: "wallet-outline", iconBg: GREEN });
  } else if (w2Total > 0) {
    results.push({ text: `Zero spending this week vs ₹${fmt(w2Total)} last week 🥳`, icon: "trending-down", iconBg: "#10b981" });
  }

  // Insight 2: top category change week-over-week
  let insightCategory = "";
  let maxChangePct = 0;
  let isLess = false;
  const allCategories = new Set([...Object.keys(w1CategoryTotals), ...Object.keys(w2CategoryTotals)]);
  for (const cat of allCategories) {
    const amt1 = w1CategoryTotals[cat] || 0;
    const amt2 = w2CategoryTotals[cat] || 0;
    if (amt1 > 0 && amt2 > 0) {
      const diff = amt2 - amt1;
      const pct = Math.round((Math.abs(diff) / amt2) * 100);
      if (pct >= 5 && pct > maxChangePct) {
        maxChangePct = pct;
        isLess = diff > 0;
        insightCategory = cat;
      }
    }
  }
  if (insightCategory && maxChangePct > 0) {
    const catLabel = resolveExpenseMeta(insightCategory, customCategories, colors).label;
    if (isLess) {
      results.push({ text: `${maxChangePct}% less on ${catLabel} this week — great control! 🥳`, icon: "trending-down", iconBg: "#10b981" });
    } else {
      results.push({ text: `${catLabel} spending is up ${maxChangePct}% this week 📈`, icon: "trending-up", iconBg: "#ef4444" });
    }
  }

  // Insight 3: top category overall + month total
  let topCat = "others";
  let maxVal = 0;
  Object.entries(allCatTotals).forEach(([cat, val]) => {
    if (val > maxVal) { maxVal = val; topCat = cat; }
  });
  const catMeta = resolveExpenseMeta(topCat, customCategories, colors);
  const totalSpentAll = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const topPct = totalSpentAll > 0 ? Math.round((maxVal / totalSpentAll) * 100) : 0;
  results.push({ text: `${catMeta.label} is your top spend (${topPct}% of ₹${fmt(totalSpentAll)} total) 💡`, icon: "pie-chart-outline", iconBg: "#6366f1" });

  // Insight 4: this month summary
  if (monthTotal > 0) {
    const budgetUsed = budgetLimit > 0 ? Math.round((monthTotal / budgetLimit) * 100) : 0;
    if (budgetLimit > 0) {
      results.push({ text: `This month: ₹${fmt(monthTotal)} spent (${budgetUsed}% of your ₹${fmt(budgetLimit)} budget) 📅`, icon: "calendar-outline", iconBg: budgetUsed > 80 ? "#ef4444" : GREEN });
    } else {
      results.push({ text: `You've spent ₹${fmt(monthTotal)} so far this month 📅`, icon: "calendar-outline", iconBg: colors.primary });
    }
  }

  return results.slice(0, 4);
}
