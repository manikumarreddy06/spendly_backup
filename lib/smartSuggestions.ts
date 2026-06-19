import type { Expense, CustomCategory } from "@/context/AppContext";
import type { FrequentDescription } from "@/lib/smartDescriptions";
import { BUILTIN_CATEGORIES, resolveExpenseMeta } from "@/constants/categories";

/**
 * Smart suggestions engine for the home screen.
 * Analyzes expense history + time of day to surface context-aware
 * expense suggestions that can be logged with a single tap.
 */

export interface SmartSuggestion {
  id: string;
  description: string;
  category: string;
  amount: number;
  icon: string;
  color: string;
  reason: string; // e.g. "Your morning coffee", "Same time yesterday"
}

/**
 * Get the current time period for contextual suggestions.
 */
function getTimePeriod(): "morning" | "lunch" | "afternoon" | "evening" | "night" {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 11 && hour < 14) return "lunch";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Get category suggestions based on time of day.
 * Returns likely categories for the current time period.
 */
function getTimeBasedCategories(period: ReturnType<typeof getTimePeriod>): string[] {
  switch (period) {
    case "morning":
      return ["entertainment", "food"]; // coffee, breakfast
    case "lunch":
      return ["food"];
    case "afternoon":
      return ["food", "entertainment"]; // snack, coffee
    case "evening":
      return ["food", "travel", "entertainment"]; // dinner, commute, entertainment
    case "night":
      return ["food", "entertainment"]; // dinner, streaming
    default:
      return ["food"];
  }
}

/**
 * Find expenses that match the current time-of-day pattern.
 * Looks for expenses logged at similar times on previous days.
 */
function findTimeBasedMatches(
  expenses: Expense[],
  customCategories: CustomCategory[],
  colors: Record<string, any>
): SmartSuggestion[] {
  const now = new Date();
  const currentHour = now.getHours();
  const period = getTimePeriod();
  const targetCategories = getTimeBasedCategories(period);

  // Look at expenses from the last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const candidates = expenses.filter((e) => {
    const d = new Date(e.date);
    if (d < thirtyDaysAgo) return false;
    if (e.recurringGroupId) return false; // Skip auto-generated recurring children

    // Check if category matches time-based expectation
    if (!targetCategories.includes(e.category)) return false;

    // Check if time is within ±2 hours of current time
    const hour = d.getHours();
    return Math.abs(hour - currentHour) <= 2;
  });

  if (candidates.length === 0) return [];

  // Group by description similarity and find most frequent
  const groups = new Map<string, { expenses: Expense[]; totalAmount: number }>();
  for (const exp of candidates) {
    const key = (exp.description || "").toLowerCase().trim();
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.expenses.push(exp);
      existing.totalAmount += exp.amount;
    } else {
      groups.set(key, { expenses: [exp], totalAmount: exp.amount });
    }
  }

  // Find groups with 2+ occurrences (pattern, not one-off)
  const patterns = Array.from(groups.entries())
    .filter(([, g]) => g.expenses.length >= 2)
    .map(([desc, g]) => {
      const avgAmount = Math.round(g.totalAmount / g.expenses.length);
      const mostRecent = g.expenses.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )[0];
      const catMeta = resolveExpenseMeta(mostRecent.category, customCategories, colors);

      return {
        id: `time-${desc.replace(/\s+/g, "-")}`,
        description: mostRecent.description || desc,
        category: mostRecent.category,
        amount: avgAmount,
        icon: catMeta.icon,
        color: catMeta.color,
        reason: period === "morning" ? "Your morning routine" :
                period === "lunch" ? "Your usual lunch" :
                period === "evening" ? "Your evening spend" :
                "Frequent at this time",
      } as SmartSuggestion;
    })
    .sort((a, b) => b.amount - a.amount);

  return patterns.slice(0, 2);
}

/**
 * Find recent expenses that were logged yesterday or the day before
 * at a similar time — "Same time yesterday" suggestions.
 */
function findRecentDayMatches(
  expenses: Expense[],
  customCategories: CustomCategory[],
  colors: Record<string, any>
): SmartSuggestion[] {
  const now = new Date();
  const currentHour = now.getHours();

  // Look at yesterday and the day before
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const recent = expenses.filter((e) => {
    const d = new Date(e.date);
    return d >= twoDaysAgo && d < todayStart && Math.abs(d.getHours() - currentHour) <= 1;
  });

  if (recent.length === 0) return [];

  // Take the most recent matching expense
  const sorted = recent.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const match = sorted[0];
  const catMeta = resolveExpenseMeta(match.category, customCategories, colors);

  return [
    {
      id: `recent-${match.id}`,
      description: match.description || catMeta.label,
      category: match.category,
      amount: match.amount,
      icon: catMeta.icon,
      color: catMeta.color,
      reason: "Same time recently",
    },
  ];
}

/**
 * Generate smart suggestions for the home screen.
 * Combines time-of-day patterns, recent history, and frequent templates.
 * Returns up to 3 suggestions.
 */
export function getSmartSuggestions(
  expenses: Expense[],
  frequentTemplates: FrequentDescription[],
  customCategories: CustomCategory[],
  colors: Record<string, any>
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const seenDescriptions = new Set<string>();

  // 1. Time-based pattern matches (highest priority)
  const timeMatches = findTimeBasedMatches(expenses, customCategories, colors);
  for (const s of timeMatches) {
    if (!seenDescriptions.has(s.description.toLowerCase())) {
      suggestions.push(s);
      seenDescriptions.add(s.description.toLowerCase());
    }
    if (suggestions.length >= 3) return suggestions;
  }

  // 2. Recent day matches
  const recentMatches = findRecentDayMatches(expenses, customCategories, colors);
  for (const s of recentMatches) {
    if (!seenDescriptions.has(s.description.toLowerCase())) {
      suggestions.push(s);
      seenDescriptions.add(s.description.toLowerCase());
    }
    if (suggestions.length >= 3) return suggestions;
  }

  // 3. Frequent templates as fallback
  for (const template of frequentTemplates) {
    if (!seenDescriptions.has(template.description.toLowerCase())) {
      const catMeta = resolveExpenseMeta(template.category, customCategories, colors);
      suggestions.push({
        id: `freq-${template.description.replace(/\s+/g, "-")}`,
        description: template.description,
        category: template.category,
        amount: template.avgAmount,
        icon: catMeta.icon,
        color: catMeta.color,
        reason: `Used ${template.count} times`,
      });
      seenDescriptions.add(template.description.toLowerCase());
    }
    if (suggestions.length >= 3) return suggestions;
  }

  return suggestions;
}
