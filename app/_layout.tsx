import 'react-native-url-polyfill/auto';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import 'react-native-url-polyfill/auto';
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider, useApp } from "@/context/AppContext";
import { useThemePreference } from "@/hooks/useThemePreference";
import { requestNotificationPermissions, loadReminderSettings, applyReminderSettings } from "@/hooks/useNotifications";
import { AnimatedSplashScreen } from "@/components/AnimatedSplashScreen";
import { useColors } from "@/hooks/useColors";

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  // Silent fallback
}

SplashScreen.preventAutoHideAsync();


function RootLayoutNav() {
  const { loaded, profile } = useApp();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<any>(null);
  const [splashAnimationComplete, setSplashAnimationComplete] = useState(false);
  const colors = useColors();

  // Hide splash screen only when AppContext loaded state is true
  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => { });
    }
  }, [loaded]);

  // Listen for notification taps → navigate to correct route
  useEffect(() => {
    if (!Notifications) return;
    try {
      notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(
        (response: any) => {
          const data = response.notification.request.content.data as any;
          if (data?.route === '/quick-log') {
            router.push('/quick-log' as any);
          } else if (data?.route === '/pending-transactions') {
            router.push('/pending-transactions' as any);
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

    const inOnboarding = segments[0] === "onboarding";

    if (!profile || !profile.salary || profile.salary <= 0) {
      if (!inOnboarding && segments.length > 0) {
        router.replace("/onboarding");
      }
    } else {
      if (inOnboarding && segments.length > 0) {
        router.replace("/(tabs)");
      }
    }
  }, [loaded, profile, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add/[category]" options={{ headerShown: false }} />
        <Stack.Screen name="split/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="add-category" options={{ headerShown: false }} />
        <Stack.Screen name="pending-transactions" options={{ headerShown: false }} />
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
      {!splashAnimationComplete && (
        <AnimatedSplashScreen isReady={loaded} onAnimationEnd={() => setSplashAnimationComplete(true)} />
      )}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();
  const effectiveTheme = themeMode === "system" ? scheme : themeMode;

  // Request notification permissions once fonts are loaded
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;
    (async () => {
      try {
        const granted = await requestNotificationPermissions();
        if (granted) {
          // Re-apply any saved reminder settings if not already scheduled (e.g. after reinstall/update)
          const settings = await loadReminderSettings();
          if (settings.enabled) {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const ours = scheduled.filter((n: any) =>
              n.identifier.startsWith('expense-reminder-')
            );
            const expectedCount = settings.count;
            if (ours.length !== expectedCount) {
              await applyReminderSettings(settings);
            }
          }
        }
      } catch (e) {
        // Notifications not critical — silently ignore
        console.warn('Notification setup failed:', e);
      }
    })();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style={effectiveTheme === "dark" ? "light" : "dark"} />
      <ErrorBoundary>
        <AppProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}