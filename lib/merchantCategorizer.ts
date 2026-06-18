import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Auto-categorization engine for detected transactions.
 * Maps merchant keywords to Spendly expense categories.
 * Supports user-trained overrides that persist across sessions.
 */

const OVERRIDES_KEY = "@merchant_category_overrides";

// Default merchant keyword → category mapping
// Keys are lowercase substrings to match against merchant names
const DEFAULT_MERCHANT_MAP: Record<string, string> = {
  // Food & Dining
  swiggy: "food",
  zomato: "food",
  dominos: "food",
  "domino's": "food",
  mcdonalds: "food",
  "mcdonald's": "food",
  kfc: "food",
  "burger king": "food",
  "pizza hut": "food",
  "subway": "food",
  starbucks: "food",
  dunkin: "food",
  "barbeque nation": "food",
  haldirams: "food",
  "chai point": "food",
  faasos: "food",
  "box8": "food",
  "eat sure": "food",
  "freshmenu": "food",
  "behrouz": "food",

  // Groceries (mapped to food)
  bigbasket: "food",
  blinkit: "food",
  zepto: "food",
  grofers: "food",
  jiomart: "food",
  "nature's basket": "food",
  dmart: "food",
  "more supermarket": "food",
  reliance: "food",
  "spencer's": "food",
  "star bazaar": "food",

  // Travel & Transport
  uber: "travel",
  ola: "travel",
  rapido: "travel",
  "make my trip": "travel",
  makemytrip: "travel",
  goibibo: "travel",
  cleartrip: "travel",
  yatra: "travel",
  irctc: "travel",
  redbus: "travel",
  ixigo: "travel",
  blablacar: "travel",
  metro: "travel",
  indigo: "travel",
  "air india": "travel",
  spicejet: "travel",
  vistara: "travel",

  // Fuel (mapped to healthcare which is displayed as "Fuel")
  "indian oil": "healthcare",
  "bharat petroleum": "healthcare",
  "hp petrol": "healthcare",
  bpcl: "healthcare",
  iocl: "healthcare",
  hpcl: "healthcare",
  "shell": "healthcare",
  "petrol": "healthcare",
  "fuel": "healthcare",
  "diesel": "healthcare",

  // Shopping
  amazon: "shopping",
  flipkart: "shopping",
  myntra: "shopping",
  ajio: "shopping",
  nykaa: "shopping",
  meesho: "shopping",
  snapdeal: "shopping",
  tatacliq: "shopping",
  "croma": "shopping",
  "reliance digital": "shopping",
  decathlon: "shopping",
  ikea: "shopping",
  "h&m": "shopping",
  zara: "shopping",
  uniqlo: "shopping",

  // Entertainment / Coffee (mapped to entertainment)
  netflix: "entertainment",
  hotstar: "entertainment",
  "disney+": "entertainment",
  spotify: "entertainment",
  "apple music": "entertainment",
  youtube: "entertainment",
  "amazon prime": "entertainment",
  "zee5": "entertainment",
  sonyliv: "entertainment",
  jiocinema: "entertainment",
  bookmyshow: "entertainment",
  pvr: "entertainment",
  inox: "entertainment",
  "cafe coffee day": "entertainment",
  ccd: "entertainment",

  // Bills & Utilities (mapped to others)
  airtel: "others",
  jio: "others",
  vi: "others",
  vodafone: "others",
  bsnl: "others",
  "act fibernet": "others",
  "tata sky": "others",
  "dish tv": "others",
  electricity: "others",
  "bescom": "others",
  "water bill": "others",
  "gas bill": "others",
  insurance: "others",
  "lic": "others",

  // Health
  apollo: "healthcare",
  medplus: "healthcare",
  netmeds: "healthcare",
  "1mg": "healthcare",
  pharmeasy: "healthcare",
  practo: "healthcare",
  "max hospital": "healthcare",
  fortis: "healthcare",

  // Cash & ATM (defaults to others)
  atm: "others",
  "cash withdrawal": "others",
  "neft": "others",
  "rtgs": "others",
  "imps": "others",
};

/**
 * Get user-trained merchant category overrides from AsyncStorage.
 */
export async function getUserOverrides(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save a user override for a merchant → category mapping.
 * Future transactions from this merchant will use the new category.
 */
export async function setUserOverride(merchant: string, category: string): Promise<void> {
  try {
    const overrides = await getUserOverrides();
    overrides[merchant.toLowerCase().trim()] = category;
    await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.warn("[merchantCategorizer] Failed to save user override:", e);
  }
}

/**
 * Categorize a merchant name using the default mapping.
 * Returns the category key or "others" if no match found.
 */
export function categorize(merchant: string): string {
  if (!merchant) return "others";
  const lower = merchant.toLowerCase().trim();

  // Check for exact match first
  if (DEFAULT_MERCHANT_MAP[lower]) {
    return DEFAULT_MERCHANT_MAP[lower];
  }

  // Check for partial/substring match
  for (const [keyword, category] of Object.entries(DEFAULT_MERCHANT_MAP)) {
    if (lower.includes(keyword) || keyword.includes(lower)) {
      return category;
    }
  }

  return "others";
}

/**
 * Categorize a merchant name, checking user overrides first,
 * then falling back to the default mapping.
 */
export async function categorizeWithOverrides(merchant: string): Promise<string> {
  if (!merchant) return "others";
  const lower = merchant.toLowerCase().trim();

  // 1. Check user overrides first (highest priority)
  const overrides = await getUserOverrides();
  if (overrides[lower]) {
    return overrides[lower];
  }

  // 2. Check partial matches in user overrides
  for (const [keyword, category] of Object.entries(overrides)) {
    if (lower.includes(keyword) || keyword.includes(lower)) {
      return category;
    }
  }

  // 3. Fall back to default mapping
  return categorize(merchant);
}
