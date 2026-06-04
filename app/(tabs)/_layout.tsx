import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

function TabButton({
  children,
  onPress,
  accessibilityState,
}: {
  children: React.ReactNode;
  onPress?: (e: any) => void;
  accessibilityState?: { selected?: boolean };
}) {
  const focused = accessibilityState?.selected;
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={tabStyles.tabBtn}>
      {children}
      {focused ? (
        <View style={[tabStyles.indicator, { backgroundColor: colors.primary }]} />
      ) : (
        <View style={tabStyles.indicatorSpacer} />
      )}
    </Pressable>
  );
}

function ProfileTabButton({
  onPress,
  accessibilityState,
}: {
  onPress?: (e: any) => void;
  accessibilityState?: { selected?: boolean };
}) {
  const colors = useColors();
  const { profile } = useApp();
  const letter = (profile?.name || "U")[0].toUpperCase();
  const focused = accessibilityState?.selected;

  return (
    <Pressable
      onPress={onPress}
      style={tabStyles.tabBtn}
      android_ripple={{ borderless: true, radius: 28 }}
    >
      <View
        style={[
          tabStyles.avatarCircle,
          {
            backgroundColor: focused ? colors.primary : colors.muted,
            borderColor: focused ? colors.primary : "transparent",
            borderWidth: focused ? 2 : 0,
          },
        ]}
      >
        <Text style={[tabStyles.avatarLetter, { color: focused ? "#fff" : colors.primary }]}>
          {letter}
        </Text>
      </View>
      <Text style={[tabStyles.avatarLabel, { color: focused ? colors.primary : colors.mutedForeground }]}>
        Profile
      </Text>
      {focused ? (
        <View style={[tabStyles.indicator, { backgroundColor: colors.primary }]} />
      ) : (
        <View style={tabStyles.indicatorSpacer} />
      )}
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "ios" ? insets.bottom : 8;
  const colors = useColors();
  const router = useRouter();

  const handlePressFab = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/quick-log");
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        backBehavior="initialRoute"
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown: false,
          tabBarShowLabel: true,
          tabBarButton: (props) => <TabButton {...props} />,
          tabBarStyle: {
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 54 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 6,
            backgroundColor: colors.card,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
            marginTop: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="insights"
          options={{
            title: "Insights",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "stats-chart" : "stats-chart-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "time" : "time-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="split"
          options={{
            title: "Split",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile-tab"
          options={{
            title: "Profile",
            tabBarButton: (props) => <ProfileTabButton {...props} />,
          }}
        />
      </Tabs>

      {/* Global Quick Add FAB */}
      <TouchableOpacity
        testID="button-global-quick-add"
        accessibilityLabel="Quick add expense"
        accessibilityRole="button"
        style={[
          tabStyles.globalFab,
          {
            bottom: 54 + bottomInset + 16,
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
          },
        ]}
        onPress={handlePressFab}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    width: 22,
    height: 3,
    borderRadius: 2,
    marginTop: 4,
  },
  indicatorSpacer: {
    height: 7,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  avatarLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 1,
  },
  globalFab: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
});
