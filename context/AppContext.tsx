import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  type AppStateStatus,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Platform,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";

// Global alert handler delegate for React Native Alert.alert interception
let globalAlertHandler: ((
  title: string,
  message?: string,
  buttons?: any[],
  options?: { cancelable?: boolean }
) => void) | null = null;

if (Alert && !(Alert as any).__spendlyCustomAlertPatched) {
  const originalAlert = Alert.alert.bind(Alert);
  Alert.alert = (title, message, buttons, options) => {
    if (globalAlertHandler) {
      globalAlertHandler(title, message, buttons, options);
    } else {
      originalAlert(title, message, buttons, options);
    }
  };
  (Alert as any).__spendlyCustomAlertPatched = true;
}

interface CustomAlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
}

interface CustomAlertConfig {
  title: string;
  message?: string;
  buttons?: CustomAlertButton[];
  cancelable?: boolean;
}

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
  type SyncStatus,
} from "@/lib/supabase";
import { SUPABASE_ENABLED } from "@/lib/config";

// Import modular domain state hooks
import { useProfileState } from "./state/useProfileState";
import { useExpenseState } from "./state/useExpenseState";
import { useSplitState } from "./state/useSplitState";
export { parseGroupInviteCode } from "./state/useSplitState";
import { useBudgetState } from "./state/useBudgetState";
import { useCategoryState } from "./state/useCategoryState";
import { useDetectedTransactionState, type DetectedTransaction, type DetectionSettings } from "./state/useDetectedTransactionState";
import { recordDescription } from "@/lib/smartDescriptions";
import { BUILTIN_CATEGORIES } from "@/constants/categories";

export type ExpenseCategory =
  | "travel"
  | "food"
  | "shopping"
  | "entertainment"
  | "healthcare"
  | "others";

export type SplitMode = "equal" | "percentage" | "custom" | "shares";

export type BudgetLimits = Partial<Record<string, number>>;

export interface CustomCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  isRecurring?: boolean;
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
  type?: "income" | "expense";
  recurring?: "monthly" | null;
  recurringGroupId?: string | null;
}

export interface SplitExpense {
  id: string;
  description: string;
  totalAmount: number;
  paidBy: string;
  splitAmong: string[];
  /** Map of member -> amount/weight they owe */
  customShares?: Record<string, number>;
  settled: string[];
  date: string;
  /** "equal" | "percentage" | "custom" | "shares" */
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
  accessCode?: string;
}

function genId(): string {
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
  if (!rawName?.trim()) return { name: "", emoji: "👥", coverColor: "#2d7a52" };
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

export function getGroupInviteCode(group: Pick<SplitGroup, "id" | "accessCode">): string {
  return group.accessCode ? `${group.id}:${group.accessCode}` : group.id;
}

// ─── Context types ──────────────────────────────────────────────────────────

export type LastDeletedItem =
  | { type: "expense"; data: Expense }
  | { type: "split"; groupId: string; data: SplitExpense };

interface AppContextType {
  loaded: boolean;
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => Promise<void>;
  expenses: Expense[];
  allExpenses: Expense[];
  addExpense: (data: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  addExpenseWithBudgetCheck: (data: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  editExpense: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteRecurringExpenseSeries: (id: string) => Promise<void>;
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
  getCurrentMonthIncome: () => number;
  getTotalByCategory: (category: ExpenseCategory) => number;
  getSpentByCategory: (category: string) => number;
  getBalances: (group: SplitGroup) => Record<string, number>;
  /** Simplifies debts: reduces transactions (e.g. A owes B 100 + B owes A 50 => A pays B 50) */
  getSimplifiedBalances: (group: SplitGroup) => Array<{ from: string; to: string; amount: number }>;
  budgetLimits: BudgetLimits;
  setBudgetLimit: (category: string, amount: number) => Promise<void>;
  getCategoryBudgetPct: (category: string) => number;
  customCategories: CustomCategory[];
  addCustomCategory: (name: string, color: string, icon: string, isRecurring?: boolean) => Promise<string>;
  deleteCustomCategory: (id: string) => Promise<void>;
  getOweSummary: () => { totalOwed: number; totalOwe: number };
  joinGroupFromInvite: (inviteCode: string) => Promise<SplitGroup | null>;
  refreshGroup: (groupId: string) => Promise<void>;
  lastDeleted: LastDeletedItem | null;
  undoDelete: () => Promise<void>;
  clearLastDeleted: () => void;
  restoreBackup: (jsonStr: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  syncStatus: Record<string, SyncStatus>;
  showAlert: (
    title: string,
    message?: string,
    buttons?: CustomAlertButton[],
    options?: { cancelable?: boolean }
  ) => void;
  // Smart Detection
  detectedTransactions: DetectedTransaction[];
  pendingTransactionCount: number;
  detectionSettings: DetectionSettings;
  updateDetectionSettings: (partial: Partial<DetectionSettings>) => Promise<void>;
  syncDetectedTransactions: () => Promise<void>;
  approveTransaction: (id: string, edits?: { amount?: number; category?: string; merchant?: string }) => Promise<void>;
  rejectTransaction: (id: string) => Promise<void>;
  approveAllTransactions: () => Promise<void>;
  rejectAllTransactions: () => Promise<void>;
  // Auto-approve for high-confidence detected transactions
  autoApproveHighConfidence: () => Promise<void>;
  undoAutoApprove: () => Promise<void>;
  autoApprovedTransactions: DetectedTransaction[];
}

// POLISH 1: Export currency helper
export function useCurrency() {
  const ctx = React.useContext(AppContext);
  return ctx?.profile?.currency ?? "₹";
}

const AppContext = createContext<AppContextType>({} as AppContextType);

// ─── Provider ───────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Alert overlay state management
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig | null>(null);
  const alertAnim = useRef(new Animated.Value(0)).current;

  const showAlert = useCallback(
    (
      title: string,
      message?: string,
      buttons?: CustomAlertButton[],
      options?: { cancelable?: boolean }
    ) => {
      setAlertConfig({
        title,
        message,
        buttons,
        cancelable: options?.cancelable ?? true,
      });
    },
    []
  );

  useEffect(() => {
    globalAlertHandler = (title, message, buttons, options) => {
      setAlertConfig({
        title,
        message,
        buttons,
        cancelable: options?.cancelable ?? true,
      });
    };
    return () => {
      globalAlertHandler = null;
    };
  }, []);

  const resolveIcon = (title: string, message?: string) => {
    const text = `${title} ${message || ""}`.toLowerCase();
    if (
      text.includes("delete") ||
      text.includes("clear") ||
      text.includes("remove") ||
      text.includes("stop") ||
      text.includes("warning") ||
      text.includes("error") ||
      text.includes("critical")
    ) {
      return {
        name: "warning" as const,
        color: "#ef4444",
        bg: "rgba(239, 68, 68, 0.12)",
        haptic: Haptics.NotificationFeedbackType.Warning,
      };
    }
    if (
      text.includes("success") ||
      text.includes("saved") ||
      text.includes("completed") ||
      text.includes("done") ||
      text.includes("restored") ||
      text.includes("backup")
    ) {
      return {
        name: "checkmark-circle" as const,
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.12)",
        haptic: Haptics.NotificationFeedbackType.Success,
      };
    }
    return {
      name: "information-circle" as const,
      color: "#3b82f6",
      bg: "rgba(59, 130, 246, 0.12)",
      haptic: null,
    };
  };

  useEffect(() => {
    if (alertConfig) {
      const meta = resolveIcon(alertConfig.title, alertConfig.message);
      if (meta.haptic) {
        Haptics.notificationAsync(meta.haptic).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      alertAnim.setValue(0);
      Animated.spring(alertAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 15,
        stiffness: 150,
      }).start();
    }
  }, [alertConfig]);

  const handleButtonPress = async (btn: CustomAlertButton) => {
    setAlertConfig(null);
    if (btn.onPress) {
      try {
        await btn.onPress();
      } catch (err) {
        console.warn("Error running custom alert button onPress:", err);
      }
    }
  };

  const colors = useColors();
  const alertStyles = useMemo(() => createAlertStyles(colors), [colors]);

  const resolvedButtons = alertConfig?.buttons && alertConfig.buttons.length > 0
    ? alertConfig.buttons
    : [{ text: "OK", onPress: () => {} }];

  const isRowLayout =
    resolvedButtons.length === 2 &&
    (resolvedButtons[0].text || "").length < 12 &&
    (resolvedButtons[1].text || "").length < 12;

  const alertIconMeta = alertConfig ? resolveIcon(alertConfig.title, alertConfig.message) : null;
  const alertOpacity = alertAnim;
  const alertScale = alertAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.93, 1],
  });
  const alertTranslateY = alertAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 0],
  });

  // Undo delete operations
  const [lastDeleted, setLastDeleted] = useState<LastDeletedItem | null>(null);
  const undoTimerRef = useRef<any>(null);

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

  // ── Modular Sub-domain State Hooks ──
  const {
    profile,
    setProfile,
    loaded: profileLoaded,
  } = useProfileState();

  const {
    customCategories,
    setCustomCategoriesState,
    addCustomCategory,
    deleteCustomCategory,
    loaded: categoryLoaded,
  } = useCategoryState();

  const {
    budgetLimits,
    setBudgetLimitsState,
    setBudgetLimit,
    loaded: budgetLoaded,
  } = useBudgetState();

  const {
    expenses,
    setExpenses,
    addExpense,
    editExpense,
    deleteExpense,
    deleteRecurringExpenseSeries,
    loaded: expenseLoaded,
  } = useExpenseState(setLastDeletedItem);

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

      if ((expense.splitMode === "custom" || expense.splitMode === "percentage" || expense.splitMode === "shares") && expense.customShares) {
        const totalShares = expense.splitMode === "shares"
          ? Object.values(expense.customShares).reduce((sum, v) => sum + Number(v), 0)
          : 0;

        Object.entries(expense.customShares).forEach(([member, value]) => {
          const amount = expense.splitMode === "percentage"
            ? (Number(value) / 100) * expense.totalAmount
            : expense.splitMode === "shares"
            ? totalShares > 0 ? (Number(value) / totalShares) * expense.totalAmount : 0
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

  const {
    splitGroups,
    setSplitGroups,
    syncStatus,
    createSplitGroup,
    deleteSplitGroup,
    addSplitExpense,
    deleteSplitExpense,
    settleUp,
    settleAllDebtsBetween,
    addGroupMember,
    removeGroupMember,
    refreshGroup,
    joinGroupFromInvite,
    loaded: splitLoaded,
  } = useSplitState(setLastDeletedItem, getBalances, profile?.name);

  const {
    detectedTransactions,
    pendingTransactionCount,
    detectionSettings,
    updateDetectionSettings,
    syncFromNative: syncDetectedTransactions,
    approveTransaction,
    rejectTransaction,
    approveAll: approveAllTransactions,
    rejectAll: rejectAllTransactions,
    autoApproveHighConfidence,
    undoAutoApprove,
    autoApprovedTransactions,
    loaded: detectionLoaded,
  } = useDetectedTransactionState(addExpense);

  // Overall ready status computed from sub-states
  const loaded = profileLoaded && expenseLoaded && splitLoaded && budgetLoaded && categoryLoaded && detectionLoaded;

  // ── Derived State Calculations (Master Orchestrator) ──
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
      if (e.type === "income") return false;
      const date = new Date(e.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }, [allExpenses]);

  const getCurrentMonthTotal = useCallback(
    () => getCurrentMonthExpenses().reduce((sum, e) => sum + e.amount, 0),
    [getCurrentMonthExpenses]
  );

  const getCurrentMonthIncome = useCallback(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        if (e.type !== "income") return false;
        const date = new Date(e.date);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

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

  const getCategoryBudgetPct = useCallback((category: string) => {
    const limit = budgetLimits[category];
    if (!limit || limit <= 0) return 0;
    const spent = getSpentByCategory(category);
    return Math.min((spent / limit) * 100, 100);
  }, [budgetLimits, getSpentByCategory]);

  // ── Budget Overspend Alert Wrapper ──
  // Wraps addExpense with a post-save budget check.
  // Shows an alert when a category exceeds its budget limit.
  const addExpenseWithBudgetCheck = useCallback(async (data: Omit<Expense, "id" | "createdAt">) => {
    await addExpense(data);

    // Track description for smart autocomplete (non-blocking)
    const desc = data.description || "";
    if (desc.trim().length >= 2) {
      recordDescription(desc, data.category, data.amount, data.type).catch(() => {});
    }

    // Skip budget check for income entries
    if (data.type === "income") return;

    // Check budget after expense is added (non-blocking)
    try {
      const limit = budgetLimits[data.category];
      if (!limit || limit <= 0) return;

      // Recalculate spent AFTER the expense was added
      const now = new Date();
      const currentMonthExpenses = allExpenses.filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
      const categorySpent = currentMonthExpenses
        .filter((e) => e.category === data.category)
        .reduce((sum, e) => sum + e.amount, 0) + data.amount; // +data.amount since allExpenses may not be updated yet

      const pct = Math.round((categorySpent / limit) * 100);

      if (pct >= 100) {
        // Overspent — show warning alert
        const overAmount = categorySpent - limit;
        const categoryLabel = BUILTIN_CATEGORIES.find((c) => c.key === data.category)?.label || data.category;
        showAlert(
          "Budget Exceeded",
          `You've exceeded your ${categoryLabel} budget by ${profile?.currency || "₹"}${Math.round(overAmount).toLocaleString("en-IN")}. Consider slowing down on spending for the rest of the month.`,
          [{ text: "OK", style: "default" }]
        );
      } else if (pct >= 80) {
        // Warning zone — show a less intrusive alert
        const remaining = limit - categorySpent;
        const categoryLabel = BUILTIN_CATEGORIES.find((c) => c.key === data.category)?.label || data.category;
        showAlert(
          "Budget Warning",
          `${categoryLabel} budget is at ${pct}%. ${profile?.currency || "₹"}${Math.round(remaining).toLocaleString("en-IN")} remaining this month.`,
          [{ text: "OK", style: "default" }]
        );
      }
    } catch {
      // Non-critical; ignore budget check failures
    }
  }, [addExpense, budgetLimits, allExpenses, showAlert, profile?.currency]);

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
        if (syncedGroup) {
          if (SUPABASE_ENABLED) upsertGroup(syncedGroup).catch(() => {});
        }
        return updated;
      });
    }
    clearLastDeleted();
  }, [lastDeleted, clearLastDeleted, setExpenses, setSplitGroups]);

  const restoreBackup = useCallback(async (jsonStr: string) => {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== "object") {
      throw new Error("Invalid backup format");
    }
    if (!data.expenses && !data.split_groups && !data.user_profile) {
      throw new Error("Invalid backup: missing essential data");
    }

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
      setProfile(data.user_profile);
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
  }, [setProfile, setExpenses, setSplitGroups, setBudgetLimitsState, setCustomCategoriesState]);

  const clearAllData = useCallback(async () => {
    const keys = ["user_profile", "expenses", "split_groups", "budget_limits", "custom_categories"];
    await Promise.all(keys.map(k => AsyncStorage.removeItem(k)));
    setProfile(null);
    setExpenses([]);
    setSplitGroups([]);
    setBudgetLimitsState({});
    setCustomCategoriesState([]);
    setLastDeleted(null);
  }, [setProfile, setExpenses, setSplitGroups, setBudgetLimitsState, setCustomCategoriesState]);

  return (
    <AppContext.Provider
      value={{
        loaded,
        profile,
        setProfile,
        expenses,
        allExpenses,
        addExpense,
        addExpenseWithBudgetCheck,
        editExpense,
        deleteExpense,
        deleteRecurringExpenseSeries,
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
        getCurrentMonthIncome,
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
        syncStatus,
        showAlert,
        detectedTransactions,
        pendingTransactionCount,
        detectionSettings,
        updateDetectionSettings,
        syncDetectedTransactions,
        approveTransaction,
        rejectTransaction,
        approveAllTransactions,
        rejectAllTransactions,
        autoApproveHighConfidence,
        undoAutoApprove,
        autoApprovedTransactions,
      }}
    >
      {children}
      {alertConfig && (
        <Modal
          visible={alertConfig !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (alertConfig.cancelable !== false) {
              setAlertConfig(null);
            }
          }}
        >
          <View style={alertStyles.alertOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (alertConfig.cancelable !== false) {
                  setAlertConfig(null);
                }
              }}
            />
            <Animated.View
              style={[
                alertStyles.alertCard,
                {
                  opacity: alertOpacity,
                  transform: [
                    { scale: alertScale },
                    { translateY: alertTranslateY }
                  ]
                }
              ]}
            >
              {alertIconMeta && (
                <View style={[alertStyles.alertIconBg, { backgroundColor: alertIconMeta.bg }]}>
                  <Ionicons name={alertIconMeta.name} size={28} color={alertIconMeta.color} />
                </View>
              )}
              <Text style={alertStyles.alertTitle}>{alertConfig.title}</Text>
              {alertConfig.message ? (
                <Text style={alertStyles.alertMessage}>{alertConfig.message}</Text>
              ) : null}

              {isRowLayout ? (
                <View style={alertStyles.buttonRow}>
                  {resolvedButtons.map((btn, idx) => {
                    const isDestructive = btn.style === "destructive";
                    const isCancel = btn.style === "cancel";
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          alertStyles.btnBase,
                          alertStyles.buttonRowCell,
                          isDestructive
                            ? alertStyles.btnDestructive
                            : isCancel
                            ? alertStyles.btnCancel
                            : alertStyles.btnDefault,
                        ]}
                        onPress={() => handleButtonPress(btn)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            alertStyles.btnTextBase,
                            isDestructive
                              ? alertStyles.btnTextDestructive
                              : isCancel
                              ? alertStyles.btnTextCancel
                              : alertStyles.btnTextDefault,
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={alertStyles.buttonStack}>
                  {resolvedButtons.map((btn, idx) => {
                    const isDestructive = btn.style === "destructive";
                    const isCancel = btn.style === "cancel";
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          alertStyles.btnBase,
                          isDestructive
                            ? alertStyles.btnDestructive
                            : isCancel
                            ? alertStyles.btnCancel
                            : alertStyles.btnDefault,
                          { width: "100%" }
                        ]}
                        onPress={() => handleButtonPress(btn)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            alertStyles.btnTextBase,
                            isDestructive
                              ? alertStyles.btnTextDestructive
                              : isCancel
                              ? alertStyles.btnTextCancel
                              : alertStyles.btnTextDefault,
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </Animated.View>
          </View>
        </Modal>
      )}
    </AppContext.Provider>
  );
}

function createAlertStyles(colors: ReturnType<typeof useColors>) {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    alertOverlay: {
      flex: 1,
      backgroundColor: isDark ? "rgba(0, 0, 0, 0.65)" : "rgba(0, 0, 0, 0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    alertCard: {
      width: "100%",
      maxWidth: 320,
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.35 : 0.08,
      shadowRadius: 16,
      elevation: 10,
    },
    alertIconBg: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    alertTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 8,
      lineHeight: 22,
    },
    alertMessage: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 20,
    },
    buttonRow: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    buttonRowCell: {
      flex: 1,
    },
    buttonStack: {
      flexDirection: "column",
      gap: 10,
      width: "100%",
    },
    btnBase: {
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    btnDefault: {
      backgroundColor: colors.primary,
    },
    btnDestructive: {
      backgroundColor: colors.destructive,
    },
    btnCancel: {
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    btnTextBase: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    btnTextDefault: {
      color: "#ffffff",
    },
    btnTextDestructive: {
      color: "#ffffff",
    },
    btnTextCancel: {
      color: colors.foreground,
    },
  });
}

export function useApp() {
  return useContext(AppContext);
}
