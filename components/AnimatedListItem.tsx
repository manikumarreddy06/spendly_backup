import React from "react";
import Animated, { FadeInDown } from "react-native-reanimated";

interface AnimatedListItemProps {
  index: number;
  children: React.ReactNode;
}

export function AnimatedListItem({ index, children }: AnimatedListItemProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 40).springify()}
    >
      {children}
    </Animated.View>
  );
}
