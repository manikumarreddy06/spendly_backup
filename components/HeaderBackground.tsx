import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, ViewStyle } from "react-native";

interface HeaderBackgroundProps {
  gradientColors: readonly [string, string, ...string[]];
  isDark: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export function HeaderBackground({ gradientColors, isDark, style, children }: HeaderBackgroundProps) {
  return (
    <>
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.35, 1]}
        style={[styles.bg, style]}
      />
      <View
        style={[
          styles.blob,
          { backgroundColor: isDark ? "#122d1f" : "#c8edd8", opacity: isDark ? 0.3 : 0.55 },
        ]}
      />
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  bg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  blob: {
    position: "absolute",
    top: -30,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
});
