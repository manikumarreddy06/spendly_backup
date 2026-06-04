import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, Expense } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { resolveExpenseMeta } from "@/constants/categories";

function getNextBillingDate(startDateStr: string): Date {
  const start = new Date(startDateStr);
  const now = new Date();
  
  // Set target day, hour, min, sec to match the original starting expense
  let next = new Date(
    now.getFullYear(),
    now.getMonth(),
    start.getDate(),
    start.getHours(),
    start.getMinutes(),
    start.getSeconds()
  );

  // If that day has already passed this month, advance to next month
  if (next.getTime() <= now.getTime()) {
    next = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      start.getDate(),
      start.getHours(),
      start.getMinutes(),
      start.getSeconds()
    );
  }

  // Handle boundary conditions safely (e.g. billing on 31st, but next month has 30 days)
  const expectedMonth = next.getMonth();
  const lastDayOfExpectedMonth = new Date(next.getFullYear(), expectedMonth + 1, 0).getDate();
  if (start.getDate() > lastDayOfExpectedMonth) {
    next = new Date(
      next.getFullYear(),
      expectedMonth,
      lastDayOfExpectedMonth,
      start.getHours(),
      start.getMinutes(),
      start.getSeconds()
    );
  }

  return next;
}

function getDaysUntil(date: Date): number {
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function RecurringBillsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const { expenses, editExpense, deleteRecurringExpenseSeries, customCategories } = useApp();

  // Load parent recurring items
  const recurringItems = useMemo(() => {
    return expenses
      .filter((e) => e.recurring === "monthly" && !e.recurringGroupId)
      .map((e) => {
        const nextDate = getNextBillingDate(e.date);
        return {
          ...e,
          nextDate,
          daysLeft: getDaysUntil(nextDate),
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [expenses]);

  const handleManageOptions = (item: Expense) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    
    Alert.alert(
      "Manage Recurring Bill",
      `Choose an action for "${item.description || "Subscription"}":`,
      [
        {
          text: "Stop Recurring Billings",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            try {
              await editExpense(item.id, { recurring: null });
              Alert.alert(
                "Recurring Billing Stopped",
                "Past instances are preserved, but no future automatic expenses will be generated."
              );
            } catch (err) {
              Alert.alert("Error", "Could not stop subscription.");
            }
          },
        },
        {
          text: "Delete History & Template",
          style: "destructive",
          onPress: async () => {
            Alert.alert(
              "Confirm Deletion",
              "Are you sure you want to permanently delete this recurring expense? This will remove the original transaction and all generated monthly history.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete All",
                  style: "destructive",
                  onPress: async () => {
                    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                    try {
                      await deleteRecurringExpenseSeries(item.id);
                    } catch (err) {
                      Alert.alert("Error", "Could not delete expense.");
                    }
                  },
                },
              ]
            );
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const isDark = colors.background !== "#f4faf6";
  const gradientColors = isDark 
    ? ["#0b1610", "#080c09", "#080c09"] 
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];

  const s = styles(colors, topPad, bottomPad);

  const renderItem = ({ item }: { item: typeof recurringItems[0] }) => {
    const meta = resolveExpenseMeta(item.category, customCategories, colors);
    const dateFormatted = item.nextDate.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return (
      <View style={s.billCard}>
        <View style={s.cardHeader}>
          <View style={[s.iconBox, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={18} color={meta.color} />
          </View>
          <View style={s.titleBox}>
            <Text style={s.billTitle} numberOfLines={1}>
              {item.description || meta.label}
            </Text>
            <Text style={s.billCategory}>{meta.label}</Text>
          </View>
          <Text style={s.billAmount}>₹{Math.round(item.amount).toLocaleString("en-IN")}</Text>
        </View>

        <View style={s.cardDivider} />

        <View style={s.cardFooter}>
          <View style={s.nextBillBox}>
            <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
            <Text style={s.nextBillText}>
              Next bill: <Text style={s.nextBillDate}>{dateFormatted}</Text>
            </Text>
          </View>
          <Text style={[s.countdownBadge, item.daysLeft <= 3 ? s.countdownCritical : s.countdownNormal]}>
            {item.daysLeft === 0 ? "Today" : item.daysLeft === 1 ? "Tomorrow" : `in ${item.daysLeft} days`}
          </Text>
        </View>

        <TouchableOpacity
          style={s.manageBtn}
          onPress={() => handleManageOptions(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={s.root}>
      {/* Header zone */}
      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.35, 1]}
        style={[s.headerGradient, { paddingTop: topPad + 14 }]}
      >
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
          <View style={s.backBtnInner}>
            <Ionicons name="arrow-back" size={22} color={isDark ? "#fff" : colors.foreground} />
          </View>
        </Pressable>
        <Text style={s.headerTitle}>Recurring Bills</Text>
        <Text style={s.headerSub}>Manage your monthly subscriptions and regular bills</Text>
      </LinearGradient>

      {recurringItems.length === 0 ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIconCircle, { backgroundColor: colors.primary + "12" }]}>
            <Ionicons name="calendar-clear-outline" size={44} color={colors.primary} />
          </View>
          <Text style={s.emptyTitle}>No active recurring bills</Text>
          <Text style={s.emptyText}>
            Regular subscriptions like Netflix, Spotify, gym memberships, or rent can be set to "Repeat Monthly" when adding them. They will auto-log every month!
          </Text>
          <TouchableOpacity
            style={[s.addExpenseBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/quick-log")}
            activeOpacity={0.85}
          >
            <Ionicons name="flash-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.addExpenseBtnText}>Log subscription now</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={recurringItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, topPad: number, bottomPad: number) => {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerGradient: {
      paddingBottom: 24,
      paddingHorizontal: 22,
      borderBottomLeftRadius: isDark ? 28 : 0,
      borderBottomRightRadius: isDark ? 28 : 0,
    },
    backBtn: {
      marginBottom: 14,
    },
    backBtnInner: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: isDark ? "#fff" : colors.foreground,
    },
    headerSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: isDark ? "rgba(255,255,255,0.65)" : colors.mutedForeground,
      marginTop: 4,
    },
    listContent: {
      padding: 18,
      paddingBottom: bottomPad + 40,
      gap: 14,
    },
    billCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      position: "relative",
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    titleBox: {
      flex: 1,
      marginLeft: 12,
      paddingRight: 32,
    },
    billTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    billCategory: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    billAmount: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    nextBillBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    nextBillText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    nextBillDate: {
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    countdownBadge: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      overflow: "hidden",
    },
    countdownNormal: {
      backgroundColor: isDark ? "rgba(59,130,246,0.12)" : "#eff6ff",
      color: "#3b82f6",
    },
    countdownCritical: {
      backgroundColor: isDark ? "rgba(249,115,22,0.12)" : "#fff7ed",
      color: "#f97316",
    },
    manageBtn: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 16,
    },
    emptyState: {
      flex: 1,
      paddingHorizontal: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
      textAlign: "center",
    },
    emptyText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 24,
    },
    addExpenseBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
    },
    addExpenseBtnText: {
      color: "#fff",
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
  });
};

export default function RecurringBillsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <RecurringBillsScreen />
    </ErrorBoundary>
  );
}
