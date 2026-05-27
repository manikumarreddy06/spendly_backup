import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  isExpenseSettledFor,
  isSameMember,
  resolveMemberInGroup,
  getExpenseMemberConsumptionShare,
  getExpenseMemberShare,
} from "@/lib/split";

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
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
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

// ─── Supabase helpers ───────────────────────────────────────────────────────

async function loadFromSupabase<T>(table: string, userId?: string): Promise<T[]> {
  try {
    let query = supabase.from(table).select("*");
    // CRITICAL 1: Add user_id filtering on reads
    if (userId && table === "expenses") {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn(`Supabase load ${table} failed:`, error.message);
      return [];
    }
    return (data ?? []) as T[];
  } catch (e) {
    console.warn(`Supabase load ${table} error:`, e);
    return [];
  }
}

async function upsertToSupabase(table: string, rows: unknown[]): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const { error } = await supabase.from(table).upsert(rows as any, {
      onConflict: "id",
      ignoreDuplicates: false,
    });
    if (error) {
      console.warn(`Supabase upsert ${table} failed:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`Supabase upsert ${table} error:`, e);
    return false;
  }
}

async function deleteFromSupabase(table: string, id: string, userId?: string): Promise<boolean> {
  try {
    let query = supabase.from(table).delete().eq("id", id);
    // CRITICAL 1: Add user_id filtering defensively
    if (userId && table === "expenses") {
      query = query.eq("user_id", userId);
    }
    const { error } = await query;
    if (error) {
      console.warn(`Supabase delete ${table} failed:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`Supabase delete ${table} error:`, e);
    return false;
  }
}

// ─── Context types ──────────────────────────────────────────────────────────

// ─── Context types ──────────────────────────────────────────────────────────

interface AppContextType {
  loaded: boolean;
  hasSession: boolean;
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
  const [hasSession, setHasSession] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const [budgetLimits, setBudgetLimitsState] = useState<BudgetLimits>({});
  const [customCategories, setCustomCategoriesState] = useState<CustomCategory[]>([]);

  // WARNING 1: Sync user_settings to Supabase
  const syncUserSettings = useCallback(async (budgets: BudgetLimits, cats: CustomCategory[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      await supabase.from("user_settings").upsert({
        id: userId,
        budget_limits: budgets,
        custom_categories: cats,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Failed to sync user_settings to Supabase:", e);
    }
  }, []);

  // ── Load on mount ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        setHasSession(!!session);

        const [p, e, g, b, c, cachedUid] = await Promise.all([
          AsyncStorage.getItem("user_profile"),
          AsyncStorage.getItem("expenses"),
          AsyncStorage.getItem("split_groups"),
          AsyncStorage.getItem("budget_limits"),
          AsyncStorage.getItem("custom_categories"),
          AsyncStorage.getItem("cached_user_id"),
        ]);

        let localProfile: UserProfile | null = p ? JSON.parse(p) : null;
        let localExpenses: Expense[] = e ? JSON.parse(e) : [];
        let localGroups: SplitGroup[] = g ? JSON.parse(g) : [];
        let localBudgets: BudgetLimits = b ? JSON.parse(b) : {};
        let localCategories: CustomCategory[] = c ? JSON.parse(c) : [];

        // Check if cache belongs to a different user
        if (userId && cachedUid && userId !== cachedUid) {
          // Discard cached data from the other user session
          localProfile = null;
          localExpenses = [];
          localGroups = [];
          localBudgets = {};
          localCategories = [];
          await AsyncStorage.multiRemove([
            "user_profile",
            "expenses",
            "split_groups",
            "budget_limits",
            "custom_categories",
          ]);
          await AsyncStorage.setItem("cached_user_id", userId);
        } else if (userId && !cachedUid) {
          // First time tracking cached_user_id, associate existing cache with current user
          await AsyncStorage.setItem("cached_user_id", userId);
        } else if (!userId) {
          // If no active session, clear out all state
          setProfileState(null);
          setExpenses([]);
          setSplitGroups([]);
          setBudgetLimitsState({});
          setCustomCategoriesState([]);
          setLoaded(true);
          return;
        }

        // If cached profile exists, load state immediately and set loaded = true to render cached UI
        const hasCache = !!localProfile;
        if (hasCache) {
          setProfileState(localProfile);
          setExpenses(localExpenses);
          setSplitGroups(localGroups);
          setBudgetLimitsState(localBudgets);
          setCustomCategoriesState(localCategories);
          setLoaded(true);
        }

        // Background Remote Sync
        const syncRemote = async () => {
          try {
            if (!userId) return;

            // Fetch user_settings from Supabase
            const { data: settingsData, error: settingsError } = await supabase
              .from("user_settings")
              .select("*")
              .eq("id", userId)
              .maybeSingle();

            let remoteBudgets = localBudgets;
            let remoteCategories = localCategories;

            if (settingsError) {
              console.warn("Failed to fetch user_settings from Supabase:", settingsError.message);
            }
            if (settingsData) {
              if (settingsData.budget_limits && Object.keys(settingsData.budget_limits).length > 0) {
                remoteBudgets = settingsData.budget_limits as BudgetLimits;
              }
              if (settingsData.custom_categories && Array.isArray(settingsData.custom_categories)) {
                remoteCategories = settingsData.custom_categories as CustomCategory[];
              }
            }

            // Fetch remote data from Supabase
            const [se, sg, st, sp] = await Promise.all([
              loadFromSupabase<Expense>("expenses", userId),
              loadFromSupabase<SplitGroup>("groups"),
              loadFromSupabase<any>("settlements"),
              supabase.from("user_profiles").select("*").eq("id", userId).single(),
            ]);

            // Handle profile restore/recovery
            let profileObj = localProfile;
            if (sp && sp.data) {
              profileObj = {
                name: sp.data.name,
                salary: Number(sp.data.salary) || 0,
                currency: sp.data.currency || "₹",
              };
            }

            // Reconstruct split groups with settlements
            const remoteGroups = (sg ?? []).map((rg) => {
              const groupSettlements = (st ?? []).filter((s: any) => s.group_id === rg.id);
              const mappedExpenses = groupSettlements.map((s: any) => ({
                id: s.id,
                description: s.description || "",
                totalAmount: Number(s.total_amount) || 0,
                paidBy: s.paid_by || "",
                splitAmong: Array.isArray(s.split_among) ? s.split_among : [],
                settled: Array.isArray(s.settled) ? s.settled : [],
                date: s.date || s.created_at || new Date().toISOString(),
                splitMode: s.split_mode || "equal",
                customShares: s.custom_shares || {},
                category: s.category || "others",
              }));
              return {
                ...rg,
                expenses: mappedExpenses,
              };
            });

            // Isolation
            const activeProfileName = profileObj?.name;
            const filteredRemoteGroups = activeProfileName
              ? remoteGroups.filter((rg) =>
                  (rg.createdBy && rg.createdBy === userId) ||
                  rg.members.some(
                    (m) => m.toLowerCase().trim() === activeProfileName.toLowerCase().trim()
                  )
                )
              : [];

            const finalExpenses = se.length > 0 ? se : localExpenses;
            const finalGroups = filteredRemoteGroups.length > 0 ? filteredRemoteGroups : localGroups;

            // Update States
            if (profileObj) setProfileState(profileObj);
            setExpenses(finalExpenses);
            setSplitGroups(finalGroups);
            setBudgetLimitsState(remoteBudgets);
            setCustomCategoriesState(remoteCategories);

            // Write updated cache
            await Promise.all([
              AsyncStorage.setItem("user_profile", JSON.stringify(profileObj)),
              AsyncStorage.setItem("expenses", JSON.stringify(finalExpenses)),
              AsyncStorage.setItem("split_groups", JSON.stringify(finalGroups)),
              AsyncStorage.setItem("budget_limits", JSON.stringify(remoteBudgets)),
              AsyncStorage.setItem("custom_categories", JSON.stringify(remoteCategories)),
            ]);
          } catch (e) {
            console.warn("Quiet remote sync error:", e);
          } finally {
            setLoaded(true);
          }
        };

        // Run sync in the background
        syncRemote();

      } catch (err) {
        console.warn("Error loading AppContext details:", err);
        setLoaded(true);
      }
    };
    load();
  }, [syncUserSettings, reloadTrigger]);

  // ── Auth state change listener (dynamic logout/cleanup) ──────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setHasSession(false);
        setProfileState(null);
        setExpenses([]);
        setSplitGroups([]);
        setBudgetLimitsState({});
        setCustomCategoriesState([]);
        try {
          await AsyncStorage.multiRemove([
            "user_profile",
            "expenses",
            "split_groups",
            "budget_limits",
            "custom_categories",
            "cached_user_id",
          ]);
        } catch (e) {
          console.warn("Failed to clear AsyncStorage cache on SIGNED_OUT:", e);
        }
        setLoaded(true);
      } else if (event === "SIGNED_IN" && session?.user?.id) {
        setHasSession(true);
        const userId = session.user.id;
        try {
          const cachedUid = await AsyncStorage.getItem("cached_user_id");
          if (cachedUid && cachedUid !== userId) {
            // Force reset memory and AsyncStorage cache if cached user mismatch
            setProfileState(null);
            setExpenses([]);
            setSplitGroups([]);
            setBudgetLimitsState({});
            setCustomCategoriesState([]);
            await AsyncStorage.multiRemove([
              "user_profile",
              "expenses",
              "split_groups",
              "budget_limits",
              "custom_categories",
            ]);
          }
          await AsyncStorage.setItem("cached_user_id", userId);
        } catch (e) {
          console.warn("Failed to validate cached_user_id on SIGNED_IN:", e);
        }

        // Reload details by triggering a soft reload of state
        setLoaded(false);
        const reload = async () => {
          try {
            const [p, e, g, b, c] = await Promise.all([
              AsyncStorage.getItem("user_profile"),
              AsyncStorage.getItem("expenses"),
              AsyncStorage.getItem("split_groups"),
              AsyncStorage.getItem("budget_limits"),
              AsyncStorage.getItem("custom_categories"),
            ]);
            const cachedProfile: UserProfile | null = p ? JSON.parse(p) : null;
            const cachedExpenses: Expense[] = e ? JSON.parse(e) : [];
            const cachedGroups: SplitGroup[] = g ? JSON.parse(g) : [];
            const cachedBudgets: BudgetLimits = b ? JSON.parse(b) : {};
            const cachedCategories: CustomCategory[] = c ? JSON.parse(c) : [];

            if (cachedProfile) {
              setProfileState(cachedProfile);
              setExpenses(cachedExpenses);
              setSplitGroups(cachedGroups);
              setBudgetLimitsState(cachedBudgets);
              setCustomCategoriesState(cachedCategories);
            } else {
              setProfileState(null);
              setExpenses([]);
              setSplitGroups([]);
              setBudgetLimitsState({});
              setCustomCategoriesState([]);
            }

            const [se, sg, st, sp, sSettings] = await Promise.all([
              loadFromSupabase<Expense>("expenses", userId),
              loadFromSupabase<SplitGroup>("groups"),
              loadFromSupabase<any>("settlements"),
              supabase.from("user_profiles").select("*").eq("id", userId).single(),
              supabase.from("user_settings").select("*").eq("id", userId).maybeSingle(),
            ]);

            let profileObj = cachedProfile;
            if (sp && sp.data) {
              profileObj = {
                name: sp.data.name,
                salary: Number(sp.data.salary) || 0,
                currency: sp.data.currency || "₹",
              };
              await AsyncStorage.setItem("user_profile", JSON.stringify(profileObj));
              setProfileState(profileObj);
            }

            let remoteBudgets = cachedProfile ? cachedBudgets : {};
            let remoteCategories = cachedProfile ? cachedCategories : [];
            if (sSettings && sSettings.data) {
              if (sSettings.data.budget_limits && Object.keys(sSettings.data.budget_limits).length > 0) {
                remoteBudgets = sSettings.data.budget_limits as BudgetLimits;
              }
              if (sSettings.data.custom_categories && Array.isArray(sSettings.data.custom_categories)) {
                remoteCategories = sSettings.data.custom_categories as CustomCategory[];
              }
            }

            const remoteGroups = (sg ?? []).map((rg) => {
              const groupSettlements = (st ?? []).filter((s: any) => s.group_id === rg.id);
              const mappedExpenses = groupSettlements.map((s: any) => ({
                id: s.id,
                description: s.description || "",
                totalAmount: Number(s.total_amount) || 0,
                paidBy: s.paid_by || "",
                splitAmong: Array.isArray(s.split_among) ? s.split_among : [],
                settled: Array.isArray(s.settled) ? s.settled : [],
                date: s.date || s.created_at || new Date().toISOString(),
                splitMode: s.split_mode || "equal",
                customShares: s.custom_shares || {},
                category: s.category || "others",
              }));
              return {
                ...rg,
                expenses: mappedExpenses,
              };
            });

            const activeName = profileObj?.name;
            const filteredGroups = activeName
              ? remoteGroups.filter((rg) =>
                  (rg.createdBy && rg.createdBy === userId) ||
                  rg.members.some(
                    (m) => m.toLowerCase().trim() === activeName.toLowerCase().trim()
                  )
                )
              : [];

            const finalExpenses = se.length > 0 ? se : (cachedProfile ? cachedExpenses : []);
            const finalGroups = filteredGroups.length > 0 ? filteredGroups : (cachedProfile ? cachedGroups : []);
            
            setExpenses(finalExpenses);
            setSplitGroups(finalGroups);
            setBudgetLimitsState(remoteBudgets);
            setCustomCategoriesState(remoteCategories);
            
            await Promise.all([
              AsyncStorage.setItem("expenses", JSON.stringify(finalExpenses)),
              AsyncStorage.setItem("split_groups", JSON.stringify(finalGroups)),
              AsyncStorage.setItem("budget_limits", JSON.stringify(remoteBudgets)),
              AsyncStorage.setItem("custom_categories", JSON.stringify(remoteCategories)),
            ]);
          } catch (e) {
            console.warn("Failed to load details on SIGNED_IN:", e);
          } finally {
            setLoaded(true);
          }
        };
        reload();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ── Profile ───────────────────────────────────────────────────────────────
  const setProfile = useCallback(async (p: UserProfile) => {
    setProfileState(p);
    await AsyncStorage.setItem("user_profile", JSON.stringify(p));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const { error } = await supabase.from("user_profiles").upsert({
          id: session.user.id,
          name: p.name,
          salary: p.salary,
          currency: p.currency,
        });
        if (error) {
          console.warn("Failed to upsert profile to Supabase:", error.message);
        }
      }
    } catch (e) {
      console.warn("Failed to sync profile to Supabase:", e);
    }
    setReloadTrigger((prev) => prev + 1);
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

      // CRITICAL 1: Include user_id in expense payload
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          console.warn("Skipping expense sync: no active Supabase session.");
          return;
        }
        await upsertToSupabase("expenses", [{ ...newExpense, user_id: userId }]);
      } catch (e) {
        console.warn("Failed to sync expense to Supabase:", e);
      }
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

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        setExpenses((current) => {
          const target = current.find((e) => e.id === id);
          if (target) {
            upsertToSupabase("expenses", [{ ...target, user_id: userId }]).catch((err) => {
              console.warn("Remote sync of edited expense failed:", err);
            });
          }
          return current;
        });
      } catch (e) {
        console.warn("Failed to edit expense in Supabase:", e);
      }
    },
    []
  );

  const deleteExpense = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      AsyncStorage.setItem("expenses", JSON.stringify(updated));
      return updated;
    });
    // CRITICAL 1: Add user_id defensively on delete
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await deleteFromSupabase("expenses", id, session?.user?.id);
    } catch (e) {
      console.warn("Failed to delete expense from Supabase:", e);
    }
  }, []);

  // ── Split Groups ──────────────────────────────────────────────────────────
  const createSplitGroup = useCallback(async (name: string, members: string[]): Promise<SplitGroup> => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const newGroup: SplitGroup = {
      id: genId(),
      name,
      members,
      expenses: [],
      createdAt: new Date().toISOString(),
      createdBy: userId || undefined,
    };

    setSplitGroups((prev) => {
      const updated = [newGroup, ...prev];
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });

    await upsertToSupabase("groups", [{
      id: newGroup.id,
      name: newGroup.name,
      members: newGroup.members,
      created_at: newGroup.createdAt,
      created_by: newGroup.createdBy || null,
      category: "others",
    }]);

    return newGroup;
  }, []);

  const deleteSplitGroup = useCallback(async (id: string) => {
    setSplitGroups((prev) => {
      const updated = prev.filter((g) => g.id !== id);
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    await deleteFromSupabase("groups", id);
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
        return updated;
      });
      await upsertToSupabase("settlements", [{
        id: newExp.id,
        group_id: groupId,
        description: newExp.description,
        total_amount: newExp.totalAmount,
        paid_by: newExp.paidBy,
        split_among: newExp.splitAmong,
        split_mode: newExp.splitMode,
        custom_shares: newExp.customShares,
        settled: [],
        category: newExp.category,
        date: newExp.date,
      }]);
    },
    []
  );

  const deleteSplitExpense = useCallback(async (groupId: string, expenseId: string) => {
    setSplitGroups((prev) => {
      const updated = prev.map((g) =>
        g.id === groupId
          ? { ...g, expenses: g.expenses.filter((e) => e.id !== expenseId) }
          : g
      );
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    await deleteFromSupabase("settlements", expenseId);
  }, []);

  const settleUp = useCallback(async (groupId: string, expenseId: string, member: string) => {
    let updatedExp: SplitExpense | undefined;
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member.trim();
        const expenses = g.expenses.map((e) => {
          if (e.id !== expenseId) return e;
          const settled = e.settled.some((s) => isSameMember(s, canon, g.members))
            ? e.settled
            : [...e.settled, canon];
          updatedExp = { ...e, settled };
          return updatedExp;
        });
        return { ...g, expenses };
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });

    if (updatedExp) {
      await upsertToSupabase("settlements", [{
        id: updatedExp.id,
        group_id: groupId,
        description: updatedExp.description,
        total_amount: updatedExp.totalAmount,
        paid_by: updatedExp.paidBy,
        split_among: updatedExp.splitAmong,
        split_mode: updatedExp.splitMode,
        custom_shares: updatedExp.customShares,
        settled: updatedExp.settled,
        category: updatedExp.category,
        date: updatedExp.date,
      }]);
    }
  }, []);

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
    let settlementExp: SplitExpense | undefined;
    let updatedRows: SplitExpense[] = [];

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
          const next = { ...e, settled };
          updatedRows.push(next);
          return next;
        });

        if (amount && amount > 0) {
          settlementExp = {
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
      return updated;
    });

    if (updatedRows.length > 0) {
      await upsertToSupabase("settlements", updatedRows.map((e) => ({
        id: e.id,
        group_id: groupId,
        description: e.description,
        total_amount: e.totalAmount,
        paid_by: e.paidBy,
        split_among: e.splitAmong,
        split_mode: e.splitMode,
        custom_shares: e.customShares,
        settled: e.settled,
        category: e.category,
        date: e.date,
      })));
    }
    if (settlementExp) {
      await upsertToSupabase("settlements", [{
        id: settlementExp.id,
        group_id: groupId,
        description: settlementExp.description,
        total_amount: settlementExp.totalAmount,
        paid_by: settlementExp.paidBy,
        split_among: settlementExp.splitAmong,
        split_mode: settlementExp.splitMode,
        custom_shares: settlementExp.customShares,
        settled: settlementExp.settled,
        category: settlementExp.category,
        date: settlementExp.date,
      }]);
    }
  }, []);

  const addGroupMember = useCallback(async (groupId: string, member: string) => {
    let groupToUpsert: SplitGroup | undefined;
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId || g.members.some((m) => isSameMember(m, member, g.members))) return g;
        groupToUpsert = { ...g, members: [...g.members, member] };
        return groupToUpsert;
      });
      AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    if (groupToUpsert) {
      await upsertToSupabase("groups", [{
        id: groupToUpsert.id,
        name: groupToUpsert.name,
        members: groupToUpsert.members,
        created_at: groupToUpsert.createdAt,
        created_by: groupToUpsert.createdBy || null,
        category: "others",
      }]);
    }
  }, []);

  const removeGroupMember = useCallback(async (groupId: string, member: string) => {
    let success = false;
    let groupToUpsert: SplitGroup | undefined;
    setSplitGroups((prev) => {
      const updated = prev.map((g) => {
        if (g.id !== groupId) return g;
        const canon = resolveMemberInGroup(member, g.members) ?? member;
        const balance = getBalances(g)[canon] ?? 0;
        if (Math.abs(balance) > 0.01) return g;
        success = true;
        groupToUpsert = {
          ...g,
          members: g.members.filter((m) => !isSameMember(m, canon, g.members)),
        };
        return groupToUpsert;
      });
      if (success) AsyncStorage.setItem("split_groups", JSON.stringify(updated));
      return updated;
    });
    if (success && groupToUpsert) {
      await upsertToSupabase("groups", [{
        id: groupToUpsert.id,
        name: groupToUpsert.name,
        members: groupToUpsert.members,
        created_at: groupToUpsert.createdAt,
        created_by: groupToUpsert.createdBy || null,
        category: "others",
      }]);
    }
    return success;
  }, [getBalances]);

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

  const setBudgetLimit = useCallback(async (category: string, amount: number) => {
    setBudgetLimitsState((prev) => {
      const updated = { ...prev, [category]: amount };
      AsyncStorage.setItem("budget_limits", JSON.stringify(updated));
      syncUserSettings(updated, customCategories);
      return updated;
    });
  }, [customCategories, syncUserSettings]);

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
      syncUserSettings(budgetLimits, updated);
      return updated;
    });
    return newCat.id;
  }, [budgetLimits, syncUserSettings]);

  const deleteCustomCategory = useCallback(async (id: string) => {
    setCustomCategoriesState((prev) => {
      const updated = prev.filter((cat) => cat.id !== id);
      AsyncStorage.setItem("custom_categories", JSON.stringify(updated));
      syncUserSettings(budgetLimits, updated);
      return updated;
    });
  }, [budgetLimits, syncUserSettings]);

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
    try {
      const { data: gData, error: gError } = await supabase.from("groups").select("*").eq("id", groupId).single();
      if (gError || !gData) return null;
      const { data: sData } = await supabase.from("settlements").select("*").eq("group_id", groupId);
      const profileName = profile?.name?.trim() || "You";
      const members = Array.isArray(gData.members) ? [...gData.members] : [];
      if (!members.some((m) => m.trim().toLowerCase() === profileName.toLowerCase())) members.push(profileName);
      const joinedGroup: SplitGroup = {
        id: gData.id,
        name: gData.name || "Untitled Group",
        members,
        createdAt: gData.created_at || new Date().toISOString(),
        createdBy: gData.created_by || undefined,
        expenses: (sData ?? []).map((s: any) => ({
          id: s.id,
          description: s.description || "",
          totalAmount: Number(s.total_amount) || 0,
          paidBy: s.paid_by || "",
          splitAmong: Array.isArray(s.split_among) ? s.split_among : [],
          settled: Array.isArray(s.settled) ? s.settled : [],
          date: s.date || s.created_at || new Date().toISOString(),
          splitMode: s.split_mode || "equal",
          customShares: s.custom_shares || {},
          category: s.category || "others",
        })),
      };
      await upsertToSupabase("groups", [{
        id: joinedGroup.id,
        name: joinedGroup.name,
        members: joinedGroup.members,
        created_at: joinedGroup.createdAt,
        created_by: joinedGroup.createdBy || null,
        category: "others",
      }]);
      setSplitGroups((prev) => {
        const updated = prev.some((g) => g.id === groupId)
          ? prev.map((g) => (g.id === groupId ? joinedGroup : g))
          : [joinedGroup, ...prev];
        AsyncStorage.setItem("split_groups", JSON.stringify(updated));
        return updated;
      });
      return joinedGroup;
    } catch (e) {
      console.warn("Failed to join group from invite:", e);
      return null;
    }
  }, [profile?.name]);

  return (
    <AppContext.Provider
      value={{
        loaded,
        hasSession,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
