import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Image } from "react-native";

interface AnimatedSplashScreenProps {
  isReady: boolean;
  onAnimationEnd: () => void;
}

export function AnimatedSplashScreen({ isReady, onAnimationEnd }: AnimatedSplashScreenProps) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const startTime = useRef(Date.now()).current;

  useEffect(() => {
    if (!isReady) return;

    const elapsedTime = Date.now() - startTime;
    const minimumDisplayTime = 1200; // Keep splash image visible for at least 1.2 seconds
    const remainingTime = Math.max(0, minimumDisplayTime - elapsedTime);

    const timeout = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onAnimationEnd();
      });
    }, remainingTime);

    return () => clearTimeout(timeout);
  }, [isReady]);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      <Image
        source={require("../assets/images/splash_image.png")}
        style={styles.splashImage}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#030704", // Matches the native splash background color
    zIndex: 99999,
    alignItems: "center",
    justifyContent: "center",
  },
  splashImage: {
    width: "100%",
    height: "100%",
  },
});
