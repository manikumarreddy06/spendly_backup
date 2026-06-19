import { useColors } from "./useColors";

/**
 * Returns whether the current theme is dark mode.
 * Centralizes the isDark detection that was previously done via
 * magic string comparison (colors.background !== "#f4faf6") across many files.
 */
export function useIsDark(): boolean {
  const colors = useColors();
  return colors.background !== "#f4faf6";
}
