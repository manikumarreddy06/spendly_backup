/**
 * Shared formatting utilities.
 */

/** Format a number as Indian locale string (no decimals). */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

/** Format a number with the given currency symbol. */
export function fmtCurrency(n: number, currency = "₹"): string {
  return `${currency}${fmt(n)}`;
}
