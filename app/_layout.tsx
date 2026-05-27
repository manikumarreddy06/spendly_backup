import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Text, StyleSheet, StatusBar as RNStatusBar, useColorScheme, Platform, Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider, useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useThemePreference } from "@/hooks/useThemePreference";
import { requestNotificationPermissions, loadReminderSettings, applyReminderSettings } from "@/hooks/useNotifications";

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  // Silent fallback
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Helper to parse access_token and refresh_token from url query/hash
const getParamsFromUrl = (urlStr: string): Record<string, string> => {
  const params: Record<string, string> = {};
  
  const hashIdx = urlStr.indexOf("#");
  if (hashIdx !== -1) {
    const hash = urlStr.substring(hashIdx + 1);
    hash.split("&").forEach((part) => {
      const [key, val] = part.split("=");
      if (key) params[key] = decodeURIComponent(val || "");
    });
  }
  
  const queryIdx = urlStr.indexOf("?");
  if (queryIdx !== -1) {
    const search = urlStr.substring(queryIdx + 1, hashIdx !== -1 && hashIdx > queryIdx ? hashIdx : undefined);
    search.split("&").forEach((part) => {
      const [key, val] = part.split("=");
      if (key) params[key] = decodeURIComponent(val || "");
    });
  }
  
  return params;
};

function RootLayoutNav() {
  const { loaded, hasSession, profile } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<any>(null);

  // Listen for notification taps → navigate to /quick-log
  useEffect(() => {
    if (!Notifications) return;
    try {
      notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response.notification.request.content.data as any;
          if (data?.route === '/quick-log') {
            router.push('/quick-log' as any);
          }
        }
      );
    } catch (e) {
      console.warn('Error setting up notification response listener:', e);
    }
    return () => {
      notifListenerRef.current?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!loaded) return;

    const inAuthGroup = segments[0] === "welcome" || segments[0] === "login" || segments[0] === "signup";
    const inOnboarding = segments[0] === "onboarding";

    if (!hasSession) {
      if (!inAuthGroup && segments.length > 0) {
        router.replace("/welcome");
      }
    } else if (!profile || !profile.salary || profile.salary <= 0) {
      if (!inOnboarding && segments.length > 0) {
        router.replace("/onboarding");
      }
    } else {
      if ((inAuthGroup || inOnboarding) && segments.length > 0) {
        router.replace("/(tabs)");
      }
    }
  }, [loaded, hasSession, profile, segments, router]);

  return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add/[category]" options={{ headerShown: false }} />
        <Stack.Screen name="split/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="add-category" options={{ headerShown: false }} />
        <Stack.Screen
          name="quick-log"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
            gestureEnabled: true,
          }}
        />
      </Stack>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: "#fff3cd",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ffeaa7",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    marginTop: Platform.OS === "android" ? RNStatusBar.currentHeight : 0,
  },
  offlineBannerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#664d03",
    textAlign: "center",
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const isOnline = useOnlineStatus();
  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();
  const effectiveTheme = themeMode === "system" ? scheme : themeMode;
  const expoUrl = Linking.useURL();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Request notification permissions once fonts are loaded
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    (async () => {
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          // Re-apply any saved reminder settings (reschedules after reinstall/update)
          const settings = await loadReminderSettings();
          if (settings.enabled) {
            await applyReminderSettings(settings);
          }
        }
      } catch (e) {
        // Notifications not critical — silently ignore
        console.warn('Notification setup failed:', e);
      }
    })();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const handleDeepLink = async (deepUrl: string | null) => {
      if (!deepUrl) return;
      // Skip URLs that do not contain auth parameters (e.g. normal launches)
      if (!deepUrl.includes("access_token=") && !deepUrl.includes("code=")) {
        return;
      }
      
      Alert.alert("Deep Link Received (useURL)", `URL: ${deepUrl}`);
      try {
        const params = getParamsFromUrl(deepUrl);
        Alert.alert("Parsed Params", JSON.stringify(params));

        if (params.access_token && params.refresh_token) {
          Alert.alert("Session Restore", "Restoring implicit flow session...");
          const { data, error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          });
          if (error) {
            Alert.alert("Session Restore Error", error.message);
          } else {
            Alert.alert("Session Restore Success", "Logged in successfully!");
          }
        } else if (params.code) {
          Alert.alert("PKCE Exchange", `Exchanging code: ${params.code}`);
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) {
            Alert.alert("PKCE Exchange Error", error.message);
          } else {
            Alert.alert("PKCE Exchange Success", "Code exchanged and logged in!");
          }
        }
      } catch (err: any) {
        Alert.alert("Deep Link Error", err.message || JSON.stringify(err));
      }
    };

    if (expoUrl) {
      handleDeepLink(expoUrl);
    }
  }, [expoUrl]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style={effectiveTheme === "dark" ? "light" : "dark"} />
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>Offline – changes will sync when you’re back online</Text>
        </View>
      )}
      <ErrorBoundary>
        <AppProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <RootLayoutNav />

            </GestureHandlerRootView>
          </QueryClientProvider>
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
