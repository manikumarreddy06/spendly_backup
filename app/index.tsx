import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function Index() {
  const { profile, loaded } = useApp();
  const router = useRouter();
  const colors = useColors();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setHasSession(!!session);
        setSessionChecked(true);
      })
      .catch(() => {
        setHasSession(false);
        setSessionChecked(true);
      });
  }, []);

  useEffect(() => {
    if (!loaded || !sessionChecked) return;

    if (!hasSession) {
      router.replace("/welcome");
    } else if (!profile || !profile.salary || profile.salary <= 0) {
      router.replace("/onboarding");
    } else {
      router.replace("/(tabs)");
    }
  }, [loaded, sessionChecked, hasSession, profile, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!sessionChecked ? (
        <ActivityIndicator size="large" color="#18633f" style={{ marginTop: 100 }} />
      ) : null}
    </View>
  );
}
