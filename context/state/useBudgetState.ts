import React, { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BudgetLimits } from "../AppContext";

export function useBudgetState() {
  const [budgetLimits, setBudgetLimitsState] = useState<BudgetLimits>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadBudgets = async () => {
      try {
        const stored = await AsyncStorage.getItem("budget_limits");
        if (stored) {
          setBudgetLimitsState(JSON.parse(stored));
        }
      } catch (err) {
        console.warn("Failed to load budget limits:", err);
      } finally {
        setLoaded(true);
      }
    };
    loadBudgets();
  }, []);

  const setBudgetLimit = useCallback(async (category: string, amount: number) => {
    setBudgetLimitsState((prev) => {
      const updated = { ...prev, [category]: amount };
      AsyncStorage.setItem("budget_limits", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return {
    budgetLimits,
    setBudgetLimitsState,
    setBudgetLimit,
    loaded,
  };
}
