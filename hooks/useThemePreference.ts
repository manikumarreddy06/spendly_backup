import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_PREF_KEY = '@theme_preference';

export type ThemeMode = 'system' | 'light' | 'dark';

// Global shared state
let globalMode: ThemeMode = 'system';
let globalLoading = true;
const listeners = new Set<(mode: ThemeMode) => void>();

// Load preference on initial module evaluation
AsyncStorage.getItem(THEME_PREF_KEY)
  .then((value) => {
    if (value === 'light' || value === 'dark' || value === 'system') {
      globalMode = value as ThemeMode;
    }
    globalLoading = false;
    listeners.forEach((l) => l(globalMode));
  })
  .catch((e) => {
    console.warn('Failed to load theme preference', e);
    globalLoading = false;
  });

export function useThemePreference() {
  const [mode, setMode] = useState<ThemeMode>(globalMode);
  const [loading, setLoading] = useState(globalLoading);

  useEffect(() => {
    const handleThemeChange = (newMode: ThemeMode) => {
      setMode(newMode);
      setLoading(false);
    };

    listeners.add(handleThemeChange);
    // sync in case it loaded/changed before component mounted
    setMode(globalMode);
    setLoading(globalLoading);

    return () => {
      listeners.delete(handleThemeChange);
    };
  }, []);

  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    try {
      globalMode = newMode;
      await AsyncStorage.setItem(THEME_PREF_KEY, newMode);
      listeners.forEach((l) => l(newMode));
    } catch (e) {
      console.warn('Failed to save theme preference', e);
    }
  }, []);

  return { mode, setThemeMode, loading };
}