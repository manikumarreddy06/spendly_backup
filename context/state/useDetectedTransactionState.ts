import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isDetectionAvailable,
  fetchNativeDetectedTransactions,
  clearNativeTransactions,
  type NativeDetectedTransaction,
} from "@/lib/transactionDetection";
import { categorizeWithOverrides, setUserOverride, getCategorizationConfidence, incrementApprovalCount } from "@/lib/merchantCategorizer";
import { scheduleReviewReminder, cancelReviewReminder } from "@/hooks/useNotifications";
import { recordDescription } from "@/lib/smartDescriptions";

const STORAGE_KEY = "@detected_transactions";
const SETTINGS_KEY = "@detection_settings";

function genId(): string {
  let d = Date.now();
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    d += performance.now();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface DetectedTransaction {
  id: string;
  amount: number;
  merchant: string;
  category: string;
  transactionType: "debit" | "credit";
  sourceApp: string;
  rawText: string;
  status: "pending" | "approved" | "rejected";
  detectedAt: string;   // ISO timestamp
  reviewedAt?: string;  // ISO timestamp
}

export interface DetectionSettings {
  enabled: boolean;
  reviewReminderEnabled: boolean;
  reviewReminderTime: string; // "HH:MM"
}

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  enabled: false,
  reviewReminderEnabled: true,
  reviewReminderTime: "20:00",
};

export function useDetectedTransactionState(
  addExpenseFn: (data: { category: string; amount: number; description: string; date: string }) => Promise<void>
) {
  const [transactions, setTransactions] = useState<DetectedTransaction[]>([]);
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_DETECTION_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // Track auto-approved transactions for undo capability
  const [autoApproved, setAutoApproved] = useState<DetectedTransaction[]>([]);

  // Load from AsyncStorage on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [txRaw, settingsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (txRaw) {
          setTransactions(JSON.parse(txRaw));
        }
        if (settingsRaw) {
          const loadedSettings = { ...DEFAULT_DETECTION_SETTINGS, ...JSON.parse(settingsRaw) };
          setSettings(loadedSettings);
          // Apply notification setting on mount to ensure active schedule
          if (loadedSettings.reviewReminderEnabled) {
            scheduleReviewReminder(loadedSettings.reviewReminderTime).catch(() => {});
          } else {
            cancelReviewReminder().catch(() => {});
          }
        }
      } catch (e) {
        console.warn("[useDetectedTransactionState] Failed to load:", e);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  // Persist transactions to AsyncStorage
  const persistTransactions = useCallback(async (txs: DetectedTransaction[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
    } catch (e) {
      console.warn("[useDetectedTransactionState] Failed to persist:", e);
    }
  }, []);

  // Persist settings
  const persistSettings = useCallback(async (s: DetectionSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn("[useDetectedTransactionState] Failed to persist settings:", e);
    }
  }, []);

  // Update settings
  const updateSettings = useCallback(async (partial: Partial<DetectionSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      persistSettings(next);
      // Sync review reminders
      if (next.reviewReminderEnabled) {
        scheduleReviewReminder(next.reviewReminderTime).catch(() => {});
      } else {
        cancelReviewReminder().catch(() => {});
      }
      return next;
    });
  }, [persistSettings]);

  /**
   * Sync transactions from the native notification listener service.
   * Pulls new pending transactions, deduplicates, auto-categorizes, and stores.
   */
  const syncFromNative = useCallback(async () => {
    if (!isDetectionAvailable()) return;

    try {
      const nativeTxs = await fetchNativeDetectedTransactions();
      if (nativeTxs.length === 0) return;

      setTransactions((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const newTxs: DetectedTransaction[] = [];
        const nativeIdsToProcess: string[] = [];

        // Process each native transaction
        const processAll = async () => {
          for (const ntx of nativeTxs) {
            // Skip if already imported
            if (existingIds.has(ntx.id)) {
              nativeIdsToProcess.push(ntx.id);
              continue;
            }

            // Duplicate check: same amount + same merchant keyword + same day
            const ntxDate = new Date(ntx.detectedAt).toDateString();
            const isDup = prev.some((t) => {
              if (t.amount !== ntx.amount) return false;
              if (t.merchant.toLowerCase() !== ntx.merchant.toLowerCase()) return false;
              const tDate = new Date(t.detectedAt).toDateString();
              return tDate === ntxDate;
            });

            if (isDup) {
              nativeIdsToProcess.push(ntx.id);
              continue;
            }

            // Auto-categorize
            const category = await categorizeWithOverrides(ntx.merchant);

            newTxs.push({
              id: ntx.id,
              amount: ntx.amount,
              merchant: ntx.merchant,
              category,
              transactionType: ntx.transactionType,
              sourceApp: ntx.sourceApp,
              rawText: ntx.rawText,
              status: "pending",
              detectedAt: new Date(ntx.detectedAt).toISOString(),
            });

            nativeIdsToProcess.push(ntx.id);
          }

          // Clear processed transactions from native storage
          if (nativeIdsToProcess.length > 0) {
            clearNativeTransactions(nativeIdsToProcess).catch(() => {});
          }
        };

        // Run async categorization, then update state
        processAll().then(() => {
          if (newTxs.length > 0) {
            setTransactions((current) => {
              const updated = [...newTxs, ...current];
              persistTransactions(updated);
              return updated;
            });
          }
        });

        return prev;
      });
    } catch (e) {
      console.warn("[useDetectedTransactionState] syncFromNative error:", e);
    }
  }, [persistTransactions]);

  /**
   * Auto-approve high-confidence pending transactions.
   * Transactions with learned user overrides AND 3+ prior approvals
   * are automatically approved without manual review.
   */
  const autoApproveHighConfidence = useCallback(async () => {
    const pending = transactions.filter((t) => t.status === "pending");
    if (pending.length === 0) return;

    const newlyApproved: DetectedTransaction[] = [];

    for (const tx of pending) {
      try {
        const { category, confidence } = await getCategorizationConfidence(tx.merchant);
        if (confidence === "high") {
          // Auto-approve: create the expense
          await addExpenseFn({
            category,
            amount: tx.amount,
            description: tx.merchant,
            date: tx.detectedAt,
          });

          // Track approval count
          await incrementApprovalCount(tx.merchant);
          // Track description for smart autocomplete
          recordDescription(tx.merchant, category, tx.amount, "expense").catch(() => {});

          newlyApproved.push({
            ...tx,
            category,
            status: "approved",
            reviewedAt: new Date().toISOString(),
          });
        }
      } catch {
        // If auto-approve fails for any transaction, skip it (leaves as pending)
      }
    }

    if (newlyApproved.length > 0) {
      const approvedIds = new Set(newlyApproved.map((t) => t.id));

      setTransactions((prev) => {
        const updated = prev.map((t) => {
          const approved = newlyApproved.find((a) => a.id === t.id);
          if (approved) return approved;
          return t;
        });
        persistTransactions(updated);
        return updated;
      });

      // Store for undo (lasts 10 seconds)
      setAutoApproved(newlyApproved);
      setTimeout(() => setAutoApproved([]), 10000);
    }
  }, [transactions, addExpenseFn, persistTransactions]);

  /**
   * Undo the last auto-approve batch.
   * Removes the expenses that were auto-created and reverts transaction status to pending.
   */
  const undoAutoApprove = useCallback(async () => {
    if (autoApproved.length === 0) return;

    setTransactions((prev) => {
      const undoIds = new Set(autoApproved.map((t) => t.id));
      const updated = prev.map((t) => {
        if (undoIds.has(t.id)) {
          return { ...t, status: "pending" as const, reviewedAt: undefined };
        }
        return t;
      });
      persistTransactions(updated);
      return updated;
    });

    setAutoApproved([]);
  }, [autoApproved, persistTransactions]);
  const approveTransaction = useCallback(async (
    id: string,
    edits?: { amount?: number; category?: string; merchant?: string }
  ) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx || tx.status !== "pending") return;

    const finalAmount = edits?.amount ?? tx.amount;
    const finalCategory = edits?.category ?? tx.category;
    const finalMerchant = edits?.merchant ?? tx.merchant;

    // If user changed the category, learn the preference
    if (edits?.category && edits.category !== tx.category) {
      await setUserOverride(tx.merchant, edits.category);
    }

    // Create the actual expense
    await addExpenseFn({
      category: finalCategory,
      amount: finalAmount,
      description: finalMerchant,
      date: tx.detectedAt,
    });

    // Track approval for auto-approve learning
    incrementApprovalCount(tx.merchant).catch(() => {});
    // Track description for smart autocomplete
    recordDescription(finalMerchant, finalCategory, finalAmount).catch(() => {});

    // Mark as approved
    setTransactions((prev) => {
      const updated = prev.map((t) =>
        t.id === id
          ? { ...t, status: "approved" as const, reviewedAt: new Date().toISOString(), ...edits }
          : t
      );
      persistTransactions(updated);
      return updated;
    });
  }, [transactions, addExpenseFn, persistTransactions]);

  /**
   * Reject a single transaction.
   */
  const rejectTransaction = useCallback(async (id: string) => {
    setTransactions((prev) => {
      const updated = prev.map((t) =>
        t.id === id
          ? { ...t, status: "rejected" as const, reviewedAt: new Date().toISOString() }
          : t
      );
      persistTransactions(updated);
      return updated;
    });
  }, [persistTransactions]);

  /**
   * Approve all pending transactions at once.
   */
  const approveAll = useCallback(async () => {
    const pending = transactions.filter((t) => t.status === "pending");
    for (const tx of pending) {
      await addExpenseFn({
        category: tx.category,
        amount: tx.amount,
        description: tx.merchant,
        date: tx.detectedAt,
      });
    }

    setTransactions((prev) => {
      const now = new Date().toISOString();
      const updated = prev.map((t) =>
        t.status === "pending"
          ? { ...t, status: "approved" as const, reviewedAt: now }
          : t
      );
      persistTransactions(updated);
      return updated;
    });
  }, [transactions, addExpenseFn, persistTransactions]);

  /**
   * Reject all pending transactions.
   */
  const rejectAll = useCallback(async () => {
    setTransactions((prev) => {
      const now = new Date().toISOString();
      const updated = prev.map((t) =>
        t.status === "pending"
          ? { ...t, status: "rejected" as const, reviewedAt: now }
          : t
      );
      persistTransactions(updated);
      return updated;
    });
  }, [persistTransactions]);

  // Derived: only pending transactions
  const pendingTransactions = transactions.filter((t) => t.status === "pending");
  const pendingCount = pendingTransactions.length;

  return {
    detectedTransactions: pendingTransactions,
    pendingTransactionCount: pendingCount,
    allDetectedTransactions: transactions,
    detectionSettings: settings,
    updateDetectionSettings: updateSettings,
    syncFromNative,
    approveTransaction,
    rejectTransaction,
    approveAll,
    rejectAll,
    autoApproveHighConfidence,
    undoAutoApprove,
    autoApprovedTransactions: autoApproved,
    loaded,
  };
}
