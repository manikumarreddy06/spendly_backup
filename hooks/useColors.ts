import { useColorScheme } from "react-native";
import { useThemePreference } from "./useThemePreference";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting or user preference.
 */
export function useColors() {
  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();

  // Determine the effective scheme: if user forced light/dark, use that; otherwise follow system.
  const effectiveScheme =
    themeMode === "system" ? scheme : themeMode;

  const palette =
    effectiveScheme === "dark" && "dark" in colors
      ? (colors as any).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
