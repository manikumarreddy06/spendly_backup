import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from "react-native-reanimated";

interface InlineErrorProps {
  message: string;
  visible: boolean;
}

export function InlineError({ message, visible }: InlineErrorProps) {
  const shake = useSharedValue(0);

  if (!visible || !message) return null;

  shake.value = withSequence(
    withTiming(-8, { duration: 50 }),
    withTiming(8, { duration: 50 }),
    withTiming(-6, { duration: 50 }),
    withTiming(6, { duration: 50 }),
    withTiming(0, { duration: 50 })
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  return (
    <Animated.View style={[styles.row, animatedStyle]}>
      <Ionicons name="alert-circle" size={14} color="#ef4444" />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
  },
});
