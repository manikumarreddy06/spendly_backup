import React, { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomCategory } from "../AppContext";

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

export function useCategoryState() {
  const [customCategories, setCustomCategoriesState] = useState<CustomCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const stored = await AsyncStorage.getItem("custom_categories");
        if (stored) {
          setCustomCategoriesState(JSON.parse(stored));
        }
      } catch (err) {
        console.warn("Failed to load custom categories:", err);
      } finally {
        setLoaded(true);
      }
    };
    loadCategories();
  }, []);

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

  return {
    customCategories,
    setCustomCategoriesState,
    addCustomCategory,
    deleteCustomCategory,
    loaded,
  };
}
