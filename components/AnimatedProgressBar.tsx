import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from "react-native-reanimated";

interface AnimatedProgressBarProps {
  progress: number; // 0-100
  color: string;
  trackColor: string;
  height?: number;
  delay?: number;
}

export function AnimatedProgressBar({
  progress,
  color,
  trackColor,
  height = 8,
  delay = 100,
}: AnimatedProgressBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    const clamped = Math.min(Math.max(progress, 0), 100);
    width.value = withSpring(clamped, { damping: 20, stiffness: 120 });
  }, [progress, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: color, height, borderRadius: height / 2 },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
