import type { SplitExpense } from "@/context/AppContext";

/** Match a name to the canonical member string stored on the group. */
export function resolveMemberInGroup(
  name: string,
  members: string[]
): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return members.find((m) => m.trim().toLowerCase() === key) ?? null;
}

export function isSameMember(a: string, b: string, members: string[]): boolean {
  const ra = resolveMemberInGroup(a, members) ?? a.trim();
  const rb = resolveMemberInGroup(b, members) ?? b.trim();
  return ra.toLowerCase() === rb.toLowerCase();
}

export function isExpenseSettledFor(
  expense: SplitExpense,
  member: string,
  members: string[]
): boolean {
  const canon = resolveMemberInGroup(member, members) ?? member.trim();
  return expense.settled.some(
    (s) => (resolveMemberInGroup(s, members) ?? s.trim()).toLowerCase() === canon.toLowerCase()
  );
}

/** Per-member share for one expense (matches balance logic in AppContext). */
export function getExpenseMemberShare(
  expense: SplitExpense,
  member: string,
  members: string[]
): number {
  const m = resolveMemberInGroup(member, members) ?? member.trim();
  const payer = resolveMemberInGroup(expense.paidBy, members) ?? expense.paidBy.trim();
  const inSplit = expense.splitAmong.some((x) => isSameMember(x, m, members));
  if (!inSplit || isSameMember(m, payer, members)) return 0;

  if (expense.splitMode === "custom" && expense.customShares) {
    const entry = Object.entries(expense.customShares).find(([k]) =>
      isSameMember(k, m, members)
    );
    return entry ? entry[1] : 0;
  }

  if (expense.splitMode === "percentage" && expense.customShares) {
    const entry = Object.entries(expense.customShares).find(([k]) =>
      isSameMember(k, m, members)
    );
    const pct = entry ? entry[1] : 0;
    return (pct / 100) * expense.totalAmount;
  }

  const count = expense.splitAmong.length;
  if (count === 0) return 0;
  return expense.totalAmount / count;
}

/** Calculate the user's consumption share of an expense. */
export function getExpenseMemberConsumptionShare(
  expense: SplitExpense,
  member: string,
  members: string[]
): number {
  const m = resolveMemberInGroup(member, members) ?? member.trim();
  const inSplit = expense.splitAmong.some((x) => isSameMember(x, m, members));
  if (!inSplit) return 0;

  if (expense.splitMode === "custom" && expense.customShares) {
    const entry = Object.entries(expense.customShares).find(([k]) =>
      isSameMember(k, m, members)
    );
    return entry ? entry[1] : 0;
  }

  if (expense.splitMode === "percentage" && expense.customShares) {
    const entry = Object.entries(expense.customShares).find(([k]) =>
      isSameMember(k, m, members)
    );
    const pct = entry ? entry[1] : 0;
    return (pct / 100) * expense.totalAmount;
  }

  const count = expense.splitAmong.length;
  if (count === 0) return 0;
  return expense.totalAmount / count;
}

/** Safely evaluate simple math expressions like "100+50-20" inside string inputs. */
export function evaluateMathExpression(str: string): number | null {
  const sanitized = str.replace(/\s+/g, ""); // remove spaces
  if (!sanitized) return null;
  // Only allow digits, decimals, and basic arithmetic operators
  if (!/^[0-9+\-*/.]+$/.test(sanitized)) {
    return null;
  }
  // Safeguard against trailing or leading operators which would cause syntax errors
  if (/^[+\-*/]/.test(sanitized) || /[+\-*/]$/.test(sanitized)) {
    return null;
  }
  // Ensure we don't have consecutive operators like "10++5"
  if (/[+\-*/]{2,}/.test(sanitized)) {
    return null;
  }

  try {
    // Math expression is validated and sanitised, safe to evaluate
    const fn = new Function(`return ${sanitized};`);
    const val = fn();
    return typeof val === "number" && !isNaN(val) && isFinite(val) ? val : null;
  } catch (e) {
    return null;
  }
}

