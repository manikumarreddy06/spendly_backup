import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

export function SkeletonBox({ width, height, borderRadius = 8 }: SkeletonBoxProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ["#e0e0e0", "#f0f0f0"]
    ),
    opacity: interpolateColor(progress.value, [0, 1], ["#808080", "#c0c0c0"]) as any,
  }));

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius },
        styles.box,
        animatedStyle,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <SkeletonBox width={48} height={48} borderRadius={14} />
        <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
          <SkeletonBox width="60%" height={14} />
          <SkeletonBox width="40%" height={12} />
          {lines > 2 && <SkeletonBox width="30%" height={10} />}
        </View>
        <SkeletonBox width={60} height={14} />
      </View>
    </View>
  );
}

export function SkeletonGroupCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <SkeletonBox width={52} height={52} borderRadius={16} />
        <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
          <SkeletonBox width="50%" height={15} />
          <SkeletonBox width="70%" height={12} />
          <View style={styles.memberDots}>
            <SkeletonBox width={28} height={28} borderRadius={14} />
            <SkeletonBox width={28} height={28} borderRadius={14} />
            <SkeletonBox width={28} height={28} borderRadius={14} />
          </View>
        </View>
        <SkeletonBox width={70} height={18} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: "hidden",
  },
  card: {
    padding: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
});
