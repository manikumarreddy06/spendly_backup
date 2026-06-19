import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Smart description autocomplete and frequent expense templates.
 * Tracks user's expense descriptions by frequency to provide
 * intelligent autocomplete suggestions and one-tap repeat entries.
 */

const FREQUENT_KEY = "@spendly:frequent_descriptions";
const MAX_ENTRIES = 50;
const MAX_SUGGESTIONS = 5;

export interface FrequentDescription {
  description: string;
  category: string;
  avgAmount: number;
  count: number;
  lastUsed: string; // ISO timestamp
  type?: "income" | "expense";
}

/**
 * Get all frequent descriptions, sorted by frequency (descending).
 */
export async function getFrequentDescriptions(): Promise<FrequentDescription[]> {
  try {
    const raw = await AsyncStorage.getItem(FREQUENT_KEY);
    if (!raw) return [];
    const entries: FrequentDescription[] = JSON.parse(raw);
    return entries.sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

/**
 * Record a new expense description usage.
 * Updates frequency count, running average amount, and last-used timestamp.
 * Called automatically after each expense is added.
 */
export async function recordDescription(
  description: string,
  category: string,
  amount: number,
  type?: "income" | "expense"
): Promise<void> {
  try {
    if (!description || description.trim().length < 2) return;

    const normalized = description.trim().toLowerCase();
    const entries = await getFrequentDescriptions();
    const existing = entries.find(
      (e) => e.description.toLowerCase() === normalized
    );

    if (existing) {
      // Update existing entry
      existing.count += 1;
      existing.avgAmount = Math.round(
        (existing.avgAmount * (existing.count - 1) + amount) / existing.count
      );
      existing.lastUsed = new Date().toISOString();
      // Update category if user used a different one (most recent wins)
      existing.category = category;
      existing.type = type;
    } else {
      // Add new entry
      entries.push({
        description: description.trim(),
        category,
        avgAmount: Math.round(amount),
        count: 1,
        lastUsed: new Date().toISOString(),
        type,
      });
    }

    // Keep only top entries by frequency, cap at MAX_ENTRIES
    const sorted = entries.sort((a, b) => b.count - a.count).slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(FREQUENT_KEY, JSON.stringify(sorted));
  } catch {
    // Non-critical; ignore failures
  }
}

/**
 * Get autocomplete suggestions matching a partial input.
 * Returns top matches sorted by frequency.
 */
export async function getAutocompleteSuggestions(
  partial: string,
  type?: "income" | "expense"
): Promise<FrequentDescription[]> {
  if (!partial || partial.trim().length < 1) return [];

  const entries = await getFrequentDescriptions();
  const lower = partial.toLowerCase().trim();

  return entries
    .filter((e) => {
      if (type && e.type !== type) return false;
      return e.description.toLowerCase().includes(lower);
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Get top frequent expense templates for "Quick Repeat" chips.
 * These are the user's most common expenses that can be logged with one tap.
 */
export async function getQuickRepeatTemplates(
  type?: "income" | "expense"
): Promise<FrequentDescription[]> {
  const entries = await getFrequentDescriptions();

  // Filter to entries used at least 2 times (meaningful pattern)
  const patterns = entries.filter((e) => {
    if (e.count < 2) return false;
    if (type && e.type !== type) return false;
    return true;
  });

  // Sort by frequency, take top 3
  return patterns.slice(0, 3);
}
