import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { profile, loaded } = useApp();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    if (!loaded) return;

    if (!profile || !profile.salary || profile.salary <= 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)");
    }
  }, [loaded, profile, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!loaded ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      ) : null}
    </View>
  );
}
