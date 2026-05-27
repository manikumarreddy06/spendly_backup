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
  } catch {
    // Non-critical preference; ignore storage failures.
  }
}
