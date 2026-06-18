export interface CurrencyItem {
  code: string;
  symbol: string;
  label: string;
}

export const SUPPORTED_CURRENCIES: CurrencyItem[] = [
  { code: "INR", symbol: "₹", label: "Indian Rupee (₹)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen (¥)" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham (د.إ)" },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar (C$)" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar (A$)" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar (S$)" },
];
