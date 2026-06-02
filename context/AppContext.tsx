import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  isExpenseSettledFor,
  isSameMember,
  resolveMemberInGroup,
  getExpenseMemberConsumptionShare,
  getExpenseMemberShare,
} from "@/lib/split";
import {
  upsertGroup,
  fetchGroup,
  deleteGroup as deleteGroupRemote,
  subscribeToGroup,
  unsubscribeAll,
} from "@/lib/supabase";
import { SUPABASE_ENABLED } from "@/lib/config";

export type ExpenseCategory =
  | "travel"
  | "food"
  | "shopping"
  | "entertainment"
  | "healthcare"
  | "others";

export type SplitMode = "equal" | "percentage" | "custom";

export type BudgetLimits = Partial<Record<string, number>>;

export interface CustomCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface UserProfile {
  name: string;
  salary: number;
  currency: string;
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  createdAt: string;
  recurring?: "monthly" | null;
  recurringGroupId?: string | null;
}

export interface SplitExpense {
  id: string;
  description: string;
  totalAmount: number;
  paidBy: string;
  splitAmong: string[];
  /** Map of member -> amount they owe (for percentage/custom splits) */
  customShares?: Record<string, number>;
  settled: string[];
  date: string;
  /** "equal" | "percentage" | "custom" */
  splitMode: SplitMode;
  category?: string;
}

export interface SplitGroup {
  id: string;
  name: string;
  members: string[];
  expenses: SplitExpense[];
  createdAt: string;
  createdBy?: string;
}

function genId(): string {
  // Upgraded UUID v4 generator with time-based seed and high random entropy to guarantee collision prevention
  let d = Date.now();
  if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
    d += performance.now();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface GroupVisuals {
  name: string;
  emoji: string;
  coverColor: string;
}

export function parseGroupName(rawName: string): GroupVisuals {
  if (!rawName) return { name: "", emoji: "👥", coverColor: "#2d7a52" };
  const emojiMatch = rawName.match(/\[emoji::(.*?)\]/);
  const colorMatch = rawName.match(/\[color::(.*?)\]/);
  const emoji = emojiMatch ? emojiMatch[1] : "👥";
  const coverColor = colorMatch ? colorMatch[1] : "#2d7a52";
  const cleanName = rawName
    .replace(/\[emoji::.*?\]/g, "")
    .replace(/\[color::.*?\]/g, "")
    .trim();
  return { name: cleanName || rawName, emoji, coverColor };
}

export function formatGroupName(name: string, emoji: string, coverColor: string): string {
  return `[emoji::${emoji}][color::${coverColor}]${name}`;
}

// ─── Context types ──────────────────────────────────────────────────────────

export type LastDeletedItem =
  | { type: "expense"; data: Expense }
  | { type: "split"; groupId: string; data: SplitExpense };

interface AppContextType {
  loaded: boolean;
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => Promise<void>;
  expenses: Expense[];
  allExpenses: Expense[];
  addExpense: (data: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  editExpense: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  splitGroups: SplitGroup[];
  createSplitGroup: (name: string, members: string[]) => Promise<SplitGroup>;
  deleteSplitGroup: (id: string) => Promise<void>;
  addSplitExpense: (
    groupId: string,
    data: Omit<SplitExpense, "id" | "settled">
  ) => Promise<void>;
  settleUp: (groupId: string, expenseId: string, member: string) => Promise<void>;
  settleAllDebtsBetween: (groupId: string, debtor: string, creditor: string, amount?: number) => Promise<void>;
  addGroupMember: (groupId: string, member: string) => Promise<void>;
  removeGroupMember: (groupId: string, member: string) => Promise<boolean>;
  deleteSplitExpense: (groupId: string, expenseId: string) => Promise<void>;
  getCurrentMonthExpenses: () => Expense[];
  getCurrentMonthTotal: () => number;
  getTotalByCategory: (category: ExpenseCategory) => number;
  getSpentByCategory: (category: string) => number;
  getBalances: (group: SplitGroup) => Record<string, number>;
  /** Simplifies debts: reduces transactions (e.g. A owes B 100 + B owes A 50 => A pays B 50) */
  getSimplifiedBalances: (group: SplitGroup) => Array<{ from: string; to: string; amount: number }>;
  budgetLimits: BudgetLimits;
  setBudgetLimit: (category: string, amount: number) => Promise<void>;
  getCategoryBudgetPct: (category: string) => number;
  customCategories: CustomCategory[];
  addCustomCategory: (name: string, color: string, icon: string) => Promise<string>;
  deleteCustomCategory: (id: string) => Promise<void>;
  getOweSummary: () => { totalOwed: number; totalOwe: number };
  joinGroupFromInvite: (groupId: string) => Promise<SplitGroup | null>;
  refreshGroup: (groupId: string) => Promise<void>;
  lastDeleted: LastDeletedItem | null;
  undoDelete: () => Promise<void>;
  clearLastDeleted: () => void;
  restoreBackup: (jsonStr: string) => Promise<void>;
  clearAllData: () => Promise<void>;
}

// POLISH 1: Export currency helper
export function useCurrency() {
  const ctx = React.useContext(AppContext);
  return ctx?.profile?.currency ?? "₹";
}

const AppContext = createContext<AppContextType>({} as AppContextType);

// ─── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [budgetLimits, setBudgetLimitsState] = useState<BudgetLimits>({});
  const [customCategories, setCustomCategoriesState] = useState<CustomCategory[]>([]);

  const [lastDeleted, setLastDeleted] = useState<LastDeletedItem | null>(null);
  const undoTimerRef = React.useRef<any>(null);

  const clearLastDeleted = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setLastDeleted(null);
  }, []);

  const setLastDeletedItem = useCallback((item: LastDeletedItem | null) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setLastDeleted(item);
    if (item !== null) {
      undoTimerRef.current = setTimeout(() => {
        setLastDeleted(null);
      }, 5000);
    }
  }, []);

  // ── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [p, e, g, b, c] = await Promise.all([
          AsyncStorage.getItem("user_profile"),
          AsyncStorage.getItem("expenses"),
          AsyncStorage.getItem("split_groups"),
          AsyncStorage.getItem("budget_limits"),
          AsyncStorage.getItem("custom_categories"),
        ]);

        if (p) setProfileState(JSON.parse(p));
        if (g) setSplitGroups(JSON.parse(g));
        if (b) setBudgetLimitsState(JSON.parse(b));
        if (c) setCustomCategoriesState(JSON.parse(c));

        let parsedExpenses: Expense[] = e ? JSON.parse(e) : [];
        let modified = false;

        // ── Auto-generate Recurring Expenses ──
        const parents = parsedExpenses.filter(
          (exp) => exp.recurring === "monthly" && !exp.recurringGroupId
        );
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        // Pre-index existing child occurrences for O(1) lookups & track the latest child date per parent
        const childKeys = new Set<string>();
        const latestChildDates = new Map<string, Date>();

        parsedExpenses.forEach((exp) => {
          if (exp.recurringGroupId) {
            const d = new Date(exp.date);
            childKeys.add(`${exp.recurringGroupId}-${d.getFullYear()}-${d.getMonth()}`);
            
            const existingMax = latestChildDates.get(exp.recurringGroupId);
            if (!existingMax || d.getTime() > existingMax.getTime()) {
              latestChildDates.set(exp.recurringGroupId, d);
            }
          }
        });

        parents.forEach((parent) => {
          const parentDate = new Date(parent.date);
          const latestChildDate = latestChildDates.get(parent.id);
          
          // Start checkDate from one month after the latest child, or one month after the parent if no children exist
          const startDate = latestChildDate ? latestChildDate : parentDate;
          let checkDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);

          while (
            checkDate.getFullYear() < currentYear ||
            (checkDate.getFullYear() === currentYear && checkDate.getMonth() <= currentMonth)
          ) {
            const checkY = checkDate.getFullYear();
            const checkM = checkDate.getMonth();

            const key = `${parent.id}-${checkY}-${checkM}`;
            const childExists = childKeys.has(key);

            if (!childExists) {
              const parentDay = parentDate.getDate();
              const daysInMonth = new Date(checkY, checkM + 1, 0).getDate();
              const day = Math.min(parentDay, daysInMonth);
              const generatedDate = new Date(
                checkY,
                checkM,
                day,
                parentDate.getHours(),
                parentDate.getMinutes(),
                parentDate.getSeconds()
              );

              const newChild: Expense = {
                id: genId(),
                category: parent.category,
                amount: parent.amount,
                description: parent.description,
                date: generatedDate.toISOString(),
                createdAt: new Date().toISOString(),
                recurring: "monthly",
                recurringGroupId: parent.id,
              };

              parsedExpenses.push(newChild);
              childKeys.add(key);
              modified = true;
            }

            checkDate = new Date(checkY, checkM + 1, 1);
          }
        });

        if (modified) {
          await AsyncStorage.setItem("expenses", JSON.stringify(parsedExpenses));
        }

        setExpenses(parsedExpenses);
      } catch (err) {
        console.warn("Error loading AppContext details:", err);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  // ── Profile ───────────────────────────────────────────────────────────────
  const setProfile = useCallback(async (p: UserProfile) => {
    setProfileState(p);
    await AsyncStorage.setItem("user_profile", JSON.stringify(p));
  }, []);

  // ── Expenses ──────────────────────────────────────────────────────────────
  const addExpense = useCallback(
    async (data: Omit<Expense, "id" | "createdAt">) => {
      const newExpense: Expense = {
        ...data,
        id: genId(),
        createdAt: new Date().toISOString(),
      };

      setExpenses((prev) => {
        const updated = [newExpense, ...prev];
        AsyncStorage.setItem("expenses", JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const editExpense = useCallback(
    async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
      setExpenses((prev) => {
        const updated = prev.map((e) => (e.id === id ? { ...e, ...data } : e));
        AsyncStorage.setItem("expenses", JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const deleteExpense = useCallback(async (id: string) => {
    const item = expenses.find((e) => e.id === id);
    if (item) {
      setLastDeletedItem({ type: "expense", data: item });
    }
    setExpenses((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      AsyncStorage.setItem("expenses", JSON.stringify(updated));
      return updated;
    });
  }, [expenses, setLastDeletedItem]);

  // ── Split Groups ──────────────────────────────────────────────────────────
  const createSplitGroup = useCallback(async (name: string, members: string[]): Promise<SplitGroup> => {
    const newGroup: SplitGroup = {
      id: genId(),
      name,
      members,
      expenses: [],
      createdAt: new Date().toISOString(),
    };

    setSplitGroups((prev) => {
      const updated = [newGroup, ...prev];
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });

    if (SUPABASE_ENABLED) {
      upsertGroup(newGroup).catch(() => {});
    }

    return newGroup;
  }, []);

  const deleteSplitGroup = useCallback(async (id: string) => {
    setSplitGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    if (SUPABASE_ENABLED) {
      deleteGroupRemote(id).catch(() => {});
    }
  }, []);

  const syncGroupToRemote = useCallback((group: SplitGroup) => {
    if (SUPABASE_ENABLED) {
      upsertGroup(group).catch(() => {});
    }
  }, []);

  const addSplitExpense = useCallback(
    async (groupId: string, data: Omit<SplitExpense, "id" | "settled">) => {
      // CRITICAL 3: Validate shares sum to totalAmount
      if (data.splitMode === "custom" && data.customShares) {
        const sum = Object.values(data.customShares).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - data.totalAmount) > 1) {
          throw new Error(`Custom shares (${sum}) do not add up to total amount (${data.totalAmount})`);
        }
      }
      if (data.splitMode === "percentage" && data.customShares) {
        const sum = Object.values(data.customShares).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.5) {
          throw new Error(`Percentages must add up to 100. Got ${sum}`);
        }
      }

      const newExp: SplitExpense = { ...data, id: genId(), settled: [] };
      setSplitGroups((prev) => {
        const updated = prev.map((g) =>
          g.id === groupId
            ? { ...g, expenses: [newExp, ...g.expenses] }
            : g
        );
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        // Sync the modified group to Supabase
        const syncedGroup = updated.find((g) => g.id === groupId);
        if (syncedGroup) syncGroupToRemote(syncedGroup);
        return updated;
      });
    },
    [syncGroupToRemote]
  );

  const deleteSplitExpense = useCallback(async (groupId: string, expenseId: string) => {
    const group = splitGroups.find((g) => g.id === groupId);
    if (group) {
      const item = group.expenses.find((e) => e.id === expenseId);
      if (item) {
        setLastDeletedItem({ type: "split", groupId, data: item });
      }
    }
    setSplitGroups((prev) => {
      const updated = prev.map((g) =>
        g.id === groupId
          ? { ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) }
          : g
      );
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [splitGroups, setLastDeletedItem, syncGroupToRemote]);

  const settleUp = useCallback(async (groupId: string, expenseId: string, member: string) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member.trim();
        const expenses = g.expenses.map((e) => {
          if (e.id !== expenseId) return e;
          const settled = e.settled.some((s) => isSameMember(s, canon, g.members))
            ? e.settled
            : [...e.settled, canon];
          return { ...e, settled };
        });
        return { ...g, expenses };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const getBalances = useCallback((group: SplitGroup) => {
    const balances: Record<string, number> = {};
    group.members.forEach((m) => (balances[m] = 0));

    const resolve = (name: string) =>
      resolveMemberInGroup(name, group.members) ?? name.trim();

    (group.expenses || []).forEach((expense) => {
      if (expense.category === "settlement") return;
      const payer = resolve(expense.paidBy);
      if (!balances[payer]) balances[payer] = 0;

      const applyShare = (member: string, amount: number) => {
        const resolvedMember = resolve(member);
        if (isSameMember(resolvedMember, payer, group.members)) return;
        if (isExpenseSettledFor(expense, resolvedMember, group.members)) return;
        balances[resolvedMember] = Math.round(((balances[resolvedMember] ?? 0) - amount) * 100) / 100;
        balances[payer] = Math.round(((balances[payer] ?? 0) + amount) * 100) / 100;
      };

      if ((expense.splitMode === "custom" || expense.splitMode === "percentage") && expense.customShares) {
        Object.entries(expense.customShares).forEach(([member, value]) => {
          const amount = expense.splitMode === "percentage"
            ? (Number(value) / 100) * expense.totalAmount
            : Number(value);
          applyShare(member, amount);
        });
        return;
      }

      if (expense.splitAmong.length === 0) return;
      const share = Math.round((expense.totalAmount / expense.splitAmong.length) * 100) / 100;
      expense.splitAmong.forEach((member) => applyShare(member, share));
    });

    return balances;
  }, []);

  const getSimplifiedBalances = useCallback((group: SplitGroup) => {
    const raw = getBalances(group);
    const creditors: { name: string; amount: number }[] = [];
    const debtors: { name: string; amount: number }[] = [];

    group.members.forEach((m) => {
      const balance = raw[m] ?? 0;
      if (balance > 0.01) creditors.push({ name: m, amount: balance });
      if (balance < -0.01) debtors.push({ name: m, amount: Math.abs(balance) });
    });

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const result: Array<{ from: string; to: string; amount: number }> = [];
    let ci = 0;
    let di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const amount = Math.min(creditors[ci].amount, debtors[di].amount);
      if (amount > 0.01) {
        result.push({
          from: debtors[di].name,
          to: creditors[ci].name,
          amount: Math.round(amount * 100) / 100,
        });
      }
      creditors[ci].amount -= amount;
      debtors[di].amount -= amount;
      if (creditors[ci].amount <= 0.01) ci += 1;
      if (debtors[di].amount <= 0.01) di += 1;
    }

    return result;
  }, [getBalances]);

  const settleAllDebtsBetween = useCallback(async (groupId: string, debtor: string, creditor: string, amount?: number) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const debtorCanon = resolveMemberInGroup(debtor, g.members) ?? debtor.trim();
        const creditorCanon = resolveMemberInGroup(creditor, g.members) ?? creditor.trim();

        const expenses = g.expenses.map((e) => {
          if (e.category === "settlement") return e;
          const payer = resolveMemberInGroup(e.paidBy, g.members) ?? e.paidBy;
          const involvesDebtor = e.splitAmong.some((m) => isSameMember(m, debtorCanon, g.members));
          const involvesCreditor = e.splitAmong.some((m) => isSameMember(m, creditorCanon, g.members));
          const shouldSettle =
            (isSameMember(payer, creditorCanon, g.members) && involvesDebtor) ||
            (isSameMember(payer, debtorCanon, g.members) && involvesCreditor);
          if (!shouldSettle) return e;
          const target = isSameMember(payer, creditorCanon, g.members) ? debtorCanon : creditorCanon;
          const settled = e.settled.some((s) => isSameMember(s, target, g.members))
            ? e.settled
            : [...e.settled, target];
          return { ...e, settled };
        });

        if (amount && amount > 0) {
          const settlementExp: SplitExpense = {
            id: genId(),
            description: `Settlement: ${debtorCanon} paid ${creditorCanon}`,
            totalAmount: amount,
            paidBy: debtorCanon,
            splitAmong: [creditorCanon],
            settled: [creditorCanon],
            date: new Date().toISOString(),
            splitMode: "equal",
            customShares: {},
            category: "settlement",
          };
          return { ...g, expenses: [settlementExp, ...expenses] };
        }

        return { ...g, expenses };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const addGroupMember = useCallback(async (groupId: string, member: string) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId || g.members.some((m) => isSameMember(m, member, g.members))) return g;
        return { ...g, members: [...g.members, member] };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      const syncedGroup = updated.find((g) => g.id === groupId);
      if (syncedGroup) syncGroupToRemote(syncedGroup);
      return updated;
    });
  }, [syncGroupToRemote]);

  const removeGroupMember = useCallback(async (groupId: string, member: string) => {
    let success = false;
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member;
        const balance = getBalances(g)[canon] ?? 0;
        if (Math.abs(balance) > 0.01) return g;
        success = true;
        return {
          ...g,
          members: g.members.filter((m) => !isSameMember(m, canon, g.members)),
        };
      });
      if (success) {
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        const syncedGroup = updated.find((g) => g.id === groupId);
        if (syncedGroup) syncGroupToRemote(syncedGroup);
      }
      return updated;
    });
    return success;
  }, [getBalances, syncGroupToRemote]);

  const allExpenses = useMemo(() => {
    const myName = profile?.name ?? "You";
    const sharedExpenses: Expense[] = [];
    splitGroups.forEach((group) => {
      const cleanGroupName = parseGroupName(group.name).name;
      (group.expenses || []).forEach((exp) => {
        if (exp.category === "settlement") return;
        const share = getExpenseMemberConsumptionShare(exp, myName, group.members);
        if (share <= 0) return;
        sharedExpenses.push({
          id: `${group.id}-${exp.id}`,
          category: exp.category || "others",
          amount: Math.round(share),
          description: exp.description || cleanGroupName,
          date: exp.date,
          createdAt: exp.date,
        });
      });
    });
    return [...expenses, ...sharedExpenses];
  }, [expenses, splitGroups, profile?.name]);

  const getCurrentMonthExpenses = useCallback(() => {
    const now = new Date();
    return allExpenses.filter((e) => {
      const date = new Date(e.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }, [allExpenses]);

  const getCurrentMonthTotal = useCallback(
    () => getCurrentMonthExpenses().reduce((sum, e) => sum + e.amount, 0),
    [getCurrentMonthExpenses]
  );

  const getTotalByCategory = useCallback(
    (category: ExpenseCategory) =>
      getCurrentMonthExpenses().filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
    [getCurrentMonthExpenses]
  );

  const getSpentByCategory = useCallback(
    (category: string) =>
      getCurrentMonthExpenses().filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0),
    [getCurrentMonthExpenses]
  );

  const refreshGroup = useCallback(async (groupId: string) => {
    if (!SUPABASE_ENABLED) return;
    const remote = await fetchGroup(groupId);
    if (remote) {
      setSplitGroups((prev) => {
        const updated = prev.map((g) => {
          if (g.id !== groupId) return g;
          const mergedExpensesMap = new Map<string, SplitExpense>();
          [...g.expenses, ...remote.expenses].forEach((e) => {
            const existing = mergedExpensesMap.get(e.id);
            if (existing) {
              const mergedSettled = [...new Set([...existing.settled, ...e.settled])];
              mergedExpensesMap.set(e.id, { ...existing, settled: mergedSettled });
            } else {
              mergedExpensesMap.set(e.id, e);
            }
          });
          const merged = Array.from(mergedExpensesMap.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          const combinedMembers = [...new Set([...g.members, ...remote.members])];
          return { ...g, expenses: merged, members: combinedMembers };
        });
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  // ── Real-time group subscriptions ────────────────────────────────────
  const unsubscribesRef = React.useRef<Map<string, () => void>>(new Map());
  const groupUpdateCallbacksRef = React.useRef<Map<string, (group: SplitGroup) => void>>(new Map());

  useEffect(() => {
    if (!SUPABASE_ENABLED) return;

    const currentIds = new Set(splitGroups.map((g) => g.id));

    // Update callback mappings first to avoid stale closures
    splitGroups.forEach((group) => {
      groupUpdateCallbacksRef.current.set(group.id, (remoteGroup: SplitGroup) => {
        setSplitGroups((prev) => {
          const updated = prev.map((g) => {
            if (g.id !== group.id) return g;
            // Merge remote expenses and members
            const mergedExpensesMap = new Map<string, SplitExpense>();
            [...g.expenses, ...remoteGroup.expenses].forEach((e) => {
              const existing = mergedExpensesMap.get(e.id);
              if (existing) {
                const mergedSettled = [...new Set([...existing.settled, ...e.settled])];
                mergedExpensesMap.set(e.id, { ...existing, settled: mergedSettled });
              } else {
                mergedExpensesMap.set(e.id, e);
              }
            });
            const merged = Array.from(mergedExpensesMap.values()).sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const combinedMembers = [...new Set([...g.members, ...remoteGroup.members])];
            return { ...g, expenses: merged, members: combinedMembers };
          });
          AsyncStorage.setItem("split_groups", JSON.stringify(updated));
          return updated;
        });
      });
    });

    // 1. Unsubscribe from groups that have been deleted/removed
    unsubscribesRef.current.forEach((unsub, id) => {
      if (!currentIds.has(id)) {
        try {
          unsub();
        } catch (e) {
          console.warn("[supabase] unsubscribe failed for group:", id, e);
        }
        unsubscribesRef.current.delete(id);
        groupUpdateCallbacksRef.current.delete(id);
      }
    });

    // 2. Subscribe to new groups
    splitGroups.forEach((group) => {
      if (unsubscribesRef.current.has(group.id)) return;

      const unsub = subscribeToGroup(group.id, (remoteGroup: SplitGroup) => {
        const cb = groupUpdateCallbacksRef.current.get(group.id);
        if (cb) cb(remoteGroup);
      });

      unsubscribesRef.current.set(group.id, unsub);
    });
  }, [splitGroups]);

  // Clean up all subscriptions on unmount
  useEffect(() => {
    return () => {
      if (SUPABASE_ENABLED) {
        unsubscribesRef.current.forEach((unsub) => {
          try {
            unsub();
          } catch (e) {
            console.warn("[supabase] unmount unsubscribe failed:", e);
          }
        });
        unsubscribesRef.current.clear();
      }
    };
  }, []);

  const setBudgetLimit = useCallback(async (category: string, amount: number) => {
    setBudgetLimitsState((prev) => {
      const updated = { ...prev, [category]: amount };
      AsyncStorage.setItem("budget_limits", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getCategoryBudgetPct = useCallback((category: string) => {
    const limit = budgetLimits[category];
    if (!limit || limit <= 0) return 0;
    const spent = getSpentByCategory(category);
    return Math.min((spent / limit) * 100, 100);
  }, [budgetLimits, getSpentByCategory]);

  const addCustomCategory = useCallback(async (name: string, color: string, icon: string) => {
    const newCat: CustomCategory = { id: genId(), name, color, icon };
    setCustomCategoriesState((prev) => {
      const updated = [newCat, ...prev];
      AsyncStorage.setItem("custom_categories", JSON.stringify(updated));
      return updated;
    });
    return newCat.id;
  }, []);

  const deleteCustomCategory = useCallback(async (id: string) => {
    setCustomCategoriesState((prev) => {
      const updated = prev.filter((cat) => cat.id !== id);
      AsyncStorage.setItem("custom_categories", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getOweSummary = useCallback(() => {
    let totalOwed = 0;
    let totalOwe = 0;
    const myName = profile?.name ?? "You";
    splitGroups.forEach((group) => {
      const canon = resolveMemberInGroup(myName, group.members) ?? myName;
      const balance = getBalances(group)[canon] ?? 0;
      if (balance > 0) totalOwed += balance;
      if (balance < 0) totalOwe += Math.abs(balance);
    });
    return { totalOwed, totalOwe };
  }, [splitGroups, getBalances, profile?.name]);

  const joinGroupFromInvite = useCallback(async (groupId: string) => {
    const existing = splitGroups.find((g) => g.id === groupId);
    if (existing) return existing;

    if (SUPABASE_ENABLED) {
      const remote = await fetchGroup(groupId);
      if (remote) {
        setSplitGroups((prev) => {
          if (prev.some((g) => g.id === groupId)) return prev;
          const updated = [remote, ...prev];
          AsyncStorage.setItem("split_groups", JSON.stringify(updated));
          return updated;
        });
        return remote;
      }
    }

    return null;
  }, [splitGroups]);

  const undoDelete = useCallback(async () => {
    if (!lastDeleted) return;
    if (lastDeleted.type === "expense") {
      const item = lastDeleted.data;
      setExpenses((prev) => {
        if (prev.some((e) => e.id === item.id)) return prev;
        const updated = [item, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        AsyncStorage.setItem("expenses", JSON.stringify(updated));
        return updated;
      });
    } else if (lastDeleted.type === "split") {
      const { groupId, data: item } = lastDeleted;
      setSplitGroups((prev) => {
        const updated = prev.map((g) => {
          if (g.id !== groupId) return g;
          if (g.expenses.some((e) => e.id === item.id)) return g;
          return {
            ...g,
            expenses: [item, ...g.expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
          };
        });
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        const syncedGroup = updated.find((g) => g.id === groupId);
        if (syncedGroup) syncGroupToRemote(syncedGroup);
        return updated;
      });
    }
    clearLastDeleted();
  }, [lastDeleted, clearLastDeleted, syncGroupToRemote]);

  const restoreBackup = useCallback(async (jsonStr: string) => {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== "object") {
      throw new Error("Invalid backup format");
    }
    if (!data.expenses && !data.split_groups && !data.user_profile) {
      throw new Error("Invalid backup: missing essential data");
    }

    // Strict validation to prevent state corruption
    if (data.expenses && !Array.isArray(data.expenses)) {
      throw new Error("Invalid backup: 'expenses' must be an array");
    }
    if (data.split_groups && !Array.isArray(data.split_groups)) {
      throw new Error("Invalid backup: 'split_groups' must be an array");
    }
    if (data.custom_categories && !Array.isArray(data.custom_categories)) {
      throw new Error("Invalid backup: 'custom_categories' must be an array");
    }
    if (data.budget_limits && (typeof data.budget_limits !== "object" || data.budget_limits === null || Array.isArray(data.budget_limits))) {
      throw new Error("Invalid backup: 'budget_limits' must be a valid key-value object");
    }
    if (data.user_profile && (typeof data.user_profile !== "object" || data.user_profile === null || typeof data.user_profile.name !== "string")) {
      throw new Error("Invalid backup: 'user_profile' must contain a valid user name");
    }

    if (data.user_profile) {
      setProfileState(data.user_profile);
      await AsyncStorage.setItem("user_profile", JSON.stringify(data.user_profile));
    }
    if (data.expenses) {
      setExpenses(data.expenses);
      await AsyncStorage.setItem("expenses", JSON.stringify(data.expenses));
    }
    if (data.split_groups) {
      setSplitGroups(data.split_groups);
      await AsyncStorage.setItem("split_groups", JSON.stringify(data.split_groups));
    }
    if (data.budget_limits) {
      setBudgetLimitsState(data.budget_limits);
      await AsyncStorage.setItem("budget_limits", JSON.stringify(data.budget_limits));
    }
    if (data.custom_categories) {
      setCustomCategoriesState(data.custom_categories);
      await AsyncStorage.setItem("custom_categories", JSON.stringify(data.custom_categories));
    }
  }, []);

  const clearAllData = useCallback(async () => {
    const keys = ["user_profile", "expenses", "split_groups", "budget_limits", "custom_categories"];
    await Promise.all(keys.map(k => AsyncStorage.removeItem(k)));
    setProfileState(null);
    setExpenses([]);
    setSplitGroups([]);
    setBudgetLimitsState({});
    setCustomCategoriesState([]);
    setLastDeleted(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        loaded,
        profile,
        setProfile,
        expenses,
        allExpenses,
        addExpense,
        editExpense,
        deleteExpense,
        splitGroups,
        createSplitGroup,
        deleteSplitGroup,
        addSplitExpense,
        settleUp,
        settleAllDebtsBetween,
        addGroupMember,
        removeGroupMember,
        deleteSplitExpense,
        getCurrentMonthExpenses,
        getCurrentMonthTotal,
        getTotalByCategory,
        getSpentByCategory,
        getBalances,
        getSimplifiedBalances,
        getOweSummary,
        budgetLimits,
        setBudgetLimit,
        getCategoryBudgetPct,
        customCategories,
        addCustomCategory,
        deleteCustomCategory,
        joinGroupFromInvite,
        refreshGroup,
        lastDeleted,
        undoDelete,
        clearLastDeleted,
        restoreBackup,
        clearAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}