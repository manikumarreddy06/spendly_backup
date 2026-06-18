import React, { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Expense, ExpenseCategory } from "../AppContext";

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

export function generateRecurringExpenses(list: Expense[]): { updated: Expense[]; modified: boolean } {
  const parsedExpenses = [...list];
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

  return { updated: parsedExpenses, modified };
}

export function useExpenseState(setLastDeletedItem: (item: any) => void) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const stored = await AsyncStorage.getItem("expenses");
        const parsedExpenses: Expense[] = stored ? JSON.parse(stored) : [];
        
        const { updated, modified } = generateRecurringExpenses(parsedExpenses);

        if (modified) {
          await AsyncStorage.setItem("expenses", JSON.stringify(updated));
        }

        setExpenses(updated);
      } catch (err) {
        console.warn("Failed to load expenses:", err);
      } finally {
        setLoaded(true);
      }
    };
    loadExpenses();
  }, []);

  const addExpense = useCallback(async (data: Omit<Expense, "id" | "createdAt">) => {
    const newExpense: Expense = {
      ...data,
      id: genId(),
      createdAt: new Date().toISOString(),
    };

    setExpenses((prev) => {
      let updated = [newExpense, ...prev];
      if (newExpense.recurring === "monthly") {
        const result = generateRecurringExpenses(updated);
        updated = result.updated;
      }
      
      Promise.resolve().then(() => {
        AsyncStorage.setItem("expenses", JSON.stringify(updated)).catch((err) => {
          console.warn("Failed to save expenses to AsyncStorage:", err);
        });
      });
      return updated;
    });
  }, []);

  const editExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    setExpenses((prev) => {
      let updated = prev.map((e) => (e.id === id ? { ...e, ...data } : e));
      
      const target = updated.find((e) => e.id === id);
      if (target && target.recurring === "monthly" && !target.recurringGroupId) {
        const result = generateRecurringExpenses(updated);
        updated = result.updated;
      }

      Promise.resolve().then(() => {
        AsyncStorage.setItem("expenses", JSON.stringify(updated)).catch((err) => {
          console.warn("Failed to save expenses to AsyncStorage:", err);
        });
      });
      return updated;
    });
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const item = prev.find((e) => e.id === id);
      if (item) {
        Promise.resolve().then(() => {
          setLastDeletedItem({ type: "expense", data: item });
        });
      }
      const updated = prev.filter((e) => e.id !== id);
      Promise.resolve().then(() => {
        AsyncStorage.setItem("expenses", JSON.stringify(updated)).catch((err) => {
          console.warn("Failed to save expenses to AsyncStorage:", err);
        });
      });
      return updated;
    });
  }, [setLastDeletedItem]);

  const deleteRecurringExpenseSeries = useCallback(async (id: string) => {
    setExpenses((prev) => {
      const target = prev.find((e) => e.id === id);
      const rootId = target?.recurringGroupId ?? id;
      const updated = prev.filter((e) => e.id !== rootId && e.recurringGroupId !== rootId);
      Promise.resolve().then(() => {
        AsyncStorage.setItem("expenses", JSON.stringify(updated)).catch((err) => {
          console.warn("Failed to save expenses to AsyncStorage:", err);
        });
      });
      return updated;
    });
  }, []);

  return {
    expenses,
    setExpenses,
    addExpense,
    editExpense,
    deleteExpense,
    deleteRecurringExpenseSeries,
    loaded,
  };
}
