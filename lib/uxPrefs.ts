import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_EXPENSE_CATEGORY_KEY = "@spendly:last_expense_category";

export async function getLastExpenseCategory(fallback = "food") {
  try {
    return (await AsyncStorage.getItem(LAST_EXPENSE_CATEGORY_KEY)) || fallback;
  } catch {
    return fallback;
  }
}

export async function setLastExpenseCategory(category: string) {
  try {
    await AsyncStorage.setItem(LAST_EXPENSE_CATEGORY_KEY, category);
    await addRecentCategory(category);
  } catch {
    // Non-critical preference; ignore storage failures.
  }
}

const RECENT_CATEGORIES_KEY = "@spendly:recent_categories";

export async function getRecentCategories(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addRecentCategory(category: string) {
  try {
    const recents = await getRecentCategories();
    const filtered = [category, ...recents.filter((c) => c !== category)].slice(0, 5);
    await AsyncStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore
  }
}
