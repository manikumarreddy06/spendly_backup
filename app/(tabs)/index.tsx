import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppTourOverlay } from "@/components/AppTourOverlay";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  useApp,
  ExpenseCategory,
  CustomCategory,
  Expense,
  SplitGroup,
  parseGroupName,
  useCurrency,
} from "@/context/AppContext";
import { isSameMember, getExpenseMemberConsumptionShare } from "@/lib/split";
import { useColors } from "@/hooks/useColors";
import { useThemePreference } from "@/hooks/useThemePreference";
import { NativeAdCard } from "@/components/NativeAdCard";
import { BalanceCard } from "@/components/BalanceCard";
import { ReminderModal } from "@/components/ReminderModal";
import { getDashboardInsights } from "@/lib/insights";
import { loadReminderSettings } from "@/hooks/useNotifications";

import { BUILTIN_CATEGORIES, resolveExpenseMeta } from "@/constants/categories";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { recordDescription } from "@/lib/smartDescriptions";

type CategoryTile = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
};



type ActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  positive?: boolean;
  icon: string;
  color: string;
  bg: string;
  route: string;
  sortDate: string;
  isRecurring?: boolean;
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

function formatActivityDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86400000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function customToTile(cat: CustomCategory): CategoryTile {
  return {
    key: cat.id,
    label: cat.name,
    icon: cat.icon,
    color: cat.color,
    bg: cat.color + "18",
  };
}



function buildRecentActivities(
  expenses: Expense[],
  splitGroups: SplitGroup[],
  customCategories: CustomCategory[],
  myName: string,
  colors: ReturnType<typeof useColors>
): ActivityItem[] {
  const monthExpenses = expenses.filter((e) => {
    const d = new Date(e.date);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const personal: ActivityItem[] = monthExpenses.map((exp) => {
    const meta = resolveExpenseMeta(exp.category, customCategories, colors);
    const custom = customCategories.find((c) => c.id === exp.category);
    const hasActiveRecurringInCat = expenses.some(
      (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === exp.category
    );
    const matchesCommonRecurringName = ["netflix", "spotify", "youtube premium", "rent", "icloud"].some(
      (name) => (exp.description || "").toLowerCase().includes(name)
    );
    return {
      id: exp.id,
      title: exp.description || meta.label,
      subtitle: formatActivityDate(exp.date),
      amount: exp.amount,
      positive: exp.type === "income",
      icon: meta.icon,
      color: meta.color,
      bg: meta.bg,
      route: "/(tabs)/history",
      sortDate: exp.date,
      isRecurring: exp.recurring === "monthly" || !!exp.recurringGroupId || !!custom?.isRecurring || hasActiveRecurringInCat || matchesCommonRecurringName,
    };
  });

  const shared: ActivityItem[] = splitGroups.flatMap((group) => {
    const gMembers = group.members || [];
    const cleanGroupName = parseGroupName(group.name).name;
    return (group.expenses || []).map((exp) => {
      const iPaid = isSameMember(exp.paidBy, myName, gMembers);
      
      if (exp.category === "settlement") {
        const isRecipient = (exp.splitAmong || []).some(m => isSameMember(m, myName, gMembers));
        const positive = !iPaid && isRecipient;
        
        return {
          id: `${group.id}-${exp.id}`,
          title: exp.description || `Settlement in ${cleanGroupName}`,
          subtitle: positive ? `Received from ${exp.paidBy}` : `Paid to ${(exp.splitAmong || []).join(", ")}`,
          amount: exp.totalAmount,
          positive,
          icon: "checkmark-circle",
          color: colors.primary,
          bg: colors.primary + "12",
          route: `/split/${group.id}`,
          sortDate: exp.date,
        };
      }

      const userInSplit = (exp.splitAmong || []).some((m) => isSameMember(m, myName, gMembers));

      if (!userInSplit && !iPaid) return null;

      const share = getExpenseMemberConsumptionShare(exp, myName, gMembers);
      if (share <= 0) return null;

      const payer = exp.paidBy;
      const subtitle = iPaid
        ? `You paid · Split in ${cleanGroupName}`
        : `${payer} paid · Split in ${cleanGroupName}`;

      const catMeta = resolveExpenseMeta(exp.category || "others", customCategories, colors);
      return {
        id: `${group.id}-${exp.id}`,
        title: exp.description || cleanGroupName,
        subtitle,
        amount: Math.round(share),
        positive: false,
        icon: catMeta.icon || "people",
        color: catMeta.color,
        bg: catMeta.bg,
        route: `/split/${group.id}`,
        sortDate: exp.date,
      };
    }).filter(Boolean) as ActivityItem[];
  });

  return [...personal, ...shared]
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    .slice(0, 8);
}



function CategoryIcon({
  name,
  color,
  size = 22,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return <Ionicons name={name as any} size={size} color={color} />;
}

function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const currency = useCurrency();
  const {
    profile,
    expenses,
    allExpenses,
    splitGroups,
    customCategories,
    getCurrentMonthTotal,
    getCurrentMonthIncome,
    getSpentByCategory,
    budgetLimits,
    pendingTransactionCount,
    detectionSettings,
    syncDetectedTransactions,
    addExpense,
    addExpenseWithBudgetCheck,
  } = useApp();

  const salary = profile?.salary ?? 0;
  const spent = getCurrentMonthTotal();
  const loggedIncome = getCurrentMonthIncome();
  const totalIncome = loggedIncome > 0 ? loggedIncome : salary;
  const budgetLimit = totalIncome > 0 ? totalIncome : 0;
  const remaining = budgetLimit > 0 ? Math.max(budgetLimit - spent, 0) : 0;
  const spentPctRaw =
    budgetLimit > 0 ? Math.round((spent / budgetLimit) * 100) : 0;
  const spentPct = Math.min(100, spentPctRaw);
  const remainingPct =
    budgetLimit > 0 ? Math.min(100, Math.round((remaining / budgetLimit) * 100)) : 0;

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr >= 5 && hr < 12) return "Good morning";
    if (hr >= 12 && hr < 17) return "Good afternoon";
    if (hr >= 17 && hr < 22) return "Good evening";
    return "Good night";
  }, []);

  const quickActionCategories = useMemo(() => {
    const builtin: CategoryTile[] = BUILTIN_CATEGORIES.map((cat) => {
      const color = (colors as any)[cat.key] || colors.primary;
      return {
        ...cat,
        color,
        bg: color + "18",
      };
    });
    const custom = customCategories.map(customToTile);
    return [...builtin, ...custom];
  }, [customCategories, colors]);

  const recentActivities = useMemo(
    () =>
      buildRecentActivities(
        expenses,
        splitGroups,
        customCategories,
        profile?.name || "You",
        colors
      ),
    [expenses, splitGroups, customCategories, profile?.name, colors]
  );

  const insights = useMemo(() => {
    return getDashboardInsights(allExpenses, customCategories, budgetLimit, colors);
  }, [allExpenses, customCategories, budgetLimit, colors]);

  const screenWidth = Dimensions.get("window").width;
  const horizontalPad = 20;
  const gridGap = 10;
  const tileWidth = (screenWidth - horizontalPad * 2 - gridGap * 3) / 4;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const tabBarClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  // ── Reminder Modal State (must be before derived values) ──
  const [reminderModalVisible, setReminderModalVisible] = useState(false);

  // ── Bell animation state & load logic ──
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const bellAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;
    loadReminderSettings().then((settings) => {
      if (isMounted) {
        setRemindersEnabled(settings.enabled);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [reminderModalVisible, isFocused]);

  // Sync detected transactions when screen is focused
  useEffect(() => {
    if (isFocused && Platform.OS === "android") {
      syncDetectedTransactions();
    }
  }, [isFocused]);

  // Pulsing animation for smart detection pending transactions
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (Platform.OS === "android" && pendingTransactionCount > 0) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [pendingTransactionCount]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let timeoutId: any = null;
    let isMounted = true;

    if (!remindersEnabled) {
      const wiggle = () => {
        if (!isMounted) return;
        bellAnim.setValue(0);
        animation = Animated.sequence([
          Animated.timing(bellAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(bellAnim, { toValue: -1, duration: 150, useNativeDriver: true }),
          Animated.timing(bellAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(bellAnim, { toValue: -1, duration: 150, useNativeDriver: true }),
          Animated.timing(bellAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ]);
        animation.start((result) => {
          if (result.finished && isMounted) {
            timeoutId = setTimeout(() => {
              wiggle();
            }, 3000);
          }
        });
      };
      wiggle();
    } else {
      bellAnim.setValue(0);
    }

    return () => {
      isMounted = false;
      if (animation) {
        animation.stop();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [remindersEnabled]);

  const bellRotate = bellAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-18deg", "0deg", "18deg"],
  });

  const [tourVisible, setTourVisible] = useState(false);
  const notifRef = useRef<any>(null);
  const budgetRef = useRef<any>(null);

  const [notifLayout, setNotifLayout] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [budgetLayout, setBudgetLayout] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

  useEffect(() => {
    if (tourVisible) {
      // Give a tiny timeout for elements to fully render and calculate layouts
      const timer = setTimeout(() => {
        if (notifRef.current && typeof notifRef.current.measureInWindow === 'function') {
          notifRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) {
              setNotifLayout({ x, y, w, h });
            }
          });
        }
        if (budgetRef.current && typeof budgetRef.current.measureInWindow === 'function') {
          budgetRef.current.measureInWindow((x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) {
              setBudgetLayout({ x, y, w, h });
            }
          });
        }
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [tourVisible]);

  useEffect(() => {
    const checkTour = async () => {
      try {
        const seen = await AsyncStorage.getItem("@spendly_tour_seen");
        if (seen !== "true") {
          setTourVisible(true);
        }
      } catch (err) {
        console.warn("Error reading tour seen status:", err);
      }
    };
    checkTour();
  }, []);

  const handleCloseTour = async () => {
    setTourVisible(false);
    try {
      await AsyncStorage.setItem("@spendly_tour_seen", "true");
    } catch (err) {
      console.warn("Error writing tour seen status:", err);
    }
  };

  // ── All hooks must be before any conditional logic ──

  // Insight carousel state
  const [activeInsight, setActiveInsight] = useState(0);
  const insightScrollRef = useRef<ScrollView>(null);
  const dotAnimsRef = useRef<Animated.Value[]>([]);

  // Sync dotAnimsRef length with insights.length (safe mutation during render)
  if (dotAnimsRef.current.length !== insights.length) {
    dotAnimsRef.current = insights.map((_, i) =>
      dotAnimsRef.current[i] ?? new Animated.Value(i === 0 ? 1 : 0)
    );
  }
  const dotAnimations = dotAnimsRef.current;

  const goToInsight = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, insights.length - 1));
    setActiveInsight(clamped);
    insightScrollRef.current?.scrollTo({ x: (screenWidth - 40) * clamped, animated: true });
    dotAnimations.forEach((anim, i) => {
      Animated.spring(anim, { toValue: i === clamped ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
    });
  }, [insights.length, dotAnimations, screenWidth]);

  useEffect(() => {
    dotAnimations[0]?.setValue(1);
    const interval = setInterval(() => {
      setActiveInsight((prev) => {
        const next = (prev + 1) % insights.length;
        insightScrollRef.current?.scrollTo({ x: (screenWidth - 40) * next, animated: true });
        dotAnimations.forEach((anim, i) => {
          Animated.spring(anim, { toValue: i === next ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
        });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [insights.length, screenWidth]);

  // Sun/Moon theme toggle
  const { setThemeMode } = useThemePreference();
  const isDark = colors.background !== "#f4faf6";
  const themeAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(themeAnim, { toValue: isDark ? 1 : 0, useNativeDriver: true, speed: 12, bounciness: 8 }).start();
  }, [isDark]);

  // Entrance animations
  const greetOpacity = useRef(new Animated.Value(0)).current;
  const greetTranslateY = useRef(new Animated.Value(15)).current;

  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(15)).current;

  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const bodyTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(greetOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(greetTranslateY, { toValue: 0, damping: 15, stiffness: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.spring(cardTranslateY, { toValue: 0, damping: 15, stiffness: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(bodyOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(bodyTranslateY, { toValue: 0, damping: 18, stiffness: 100, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const toggleTheme = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setThemeMode(isDark ? 'light' : 'dark');
  }, [isDark, setThemeMode]);

  const sunOpacity = themeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const moonOpacity = themeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const themeRotate = themeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  // ── Derived values (safe after hooks) ──
  const s = createStyles(colors, topPad, tabBarClearance, tileWidth, screenWidth);
  const totalBalance = remaining;
  const displayName = profile?.name || "User";



  const gradientColors = isDark
    ? ["#0b1610", "#080c09", "#080c09"]
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];

  return (
    <View style={s.root}>
      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.35, 1]}
        style={s.headerBg}
      />
      <View style={s.headerBlob} />
      <View style={s.leavesWrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Ionicons name="leaf" size={16} color="#86efac" style={{ transform: [{ rotate: "-40deg" }] }} />
        <Ionicons name="leaf" size={24} color="#4ade80" style={{ transform: [{ rotate: "-8deg" }], marginLeft: 4, marginTop: -8 }} />
        <Ionicons name="leaf" size={30} color="#22c55e" style={{ transform: [{ rotate: "18deg" }], marginLeft: 2, marginTop: -14 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={{ opacity: greetOpacity, transform: [{ translateY: greetTranslateY }] }}>
          <View style={s.header}>
            <Text style={s.greetSub}>{greeting},</Text>
            <View style={s.nameRow}>
              <Text style={s.greetName} testID="text-greeting" numberOfLines={1}>
                {displayName} 👋
              </Text>
              <View style={s.headerActions}>
                {/* Animated Sun/Moon theme toggle */}
                <TouchableOpacity
                  testID="button-theme-toggle"
                  style={s.themeToggleBtn}
                  onPress={toggleTheme}
                  activeOpacity={0.8}
                  accessibilityLabel={`Switch to ${isDark ? "light" : "dark"} mode`}
                  accessibilityRole="button"
                >
                  <Animated.View style={[StyleSheet.absoluteFill, s.themeIconWrap, { opacity: sunOpacity, transform: [{ rotate: themeRotate }] }]}>
                    <Ionicons name="sunny" size={20} color="#f59e0b" />
                  </Animated.View>
                  <Animated.View style={[StyleSheet.absoluteFill, s.themeIconWrap, { opacity: moonOpacity, transform: [{ rotate: themeRotate }] }]}>
                    <Ionicons name="moon" size={18} color="#818cf8" />
                  </Animated.View>
                </TouchableOpacity>
                <View ref={notifRef} collapsable={false}>
                  <TouchableOpacity
                    testID="button-reminders"
                    style={[s.settingsBtn, remindersEnabled && { backgroundColor: colors.primary + "12" }]}
                    onPress={() => setReminderModalVisible(true)}
                    activeOpacity={0.8}
                    accessibilityLabel={remindersEnabled ? "Reminders enabled" : "Reminders disabled. Tap to configure"}
                    accessibilityRole="button"
                  >
                    <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
                      <Ionicons 
                        name={remindersEnabled ? "notifications" : "notifications-outline"} 
                        size={20} 
                        color={remindersEnabled ? colors.primary : colors.mutedForeground} 
                      />
                    </Animated.View>
                    {!remindersEnabled && <View style={s.bellRedDot} />}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <Text style={s.greetTagline}>Let's make today financially great.</Text>
          </View>
        </Animated.View>

        {/* Balance card */}
        <Animated.View style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }}>
          <BalanceCard
            ref={budgetRef}
            totalBalance={totalBalance}
            budgetLimit={budgetLimit}
            spent={spent}
            spentPct={spentPct}
            spentPctRaw={spentPctRaw}
            isDark={isDark}
            primaryColor={colors.primary}
            primaryDarkColor={isDark ? "#065f46" : "#134830"}
            currency={currency}
          />
        </Animated.View>

        {/* Smart Transaction Detection Card (Android Only) */}
        {Platform.OS === "android" && pendingTransactionCount > 0 && (
          <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodyTranslateY }] }}>
            <TouchableOpacity
              style={s.detectionCard}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push("/pending-transactions");
              }}
            >
              <LinearGradient
                colors={
                  pendingTransactionCount > 0
                    ? [colors.primary + "12", colors.primary + "06"]
                    : [colors.border + "40", colors.border + "10"]
                }
                style={s.detectionCardBg}
              />
              <View style={s.detectionCardContent}>
                <View style={[
                  s.detectionIconBox,
                  { backgroundColor: pendingTransactionCount > 0 ? colors.primary + "20" : colors.muted }
                ]}>
                  <Ionicons
                    name={pendingTransactionCount > 0 ? "wallet-outline" : "scan-outline"}
                    size={22}
                    color={pendingTransactionCount > 0 ? colors.primary : colors.mutedForeground}
                  />
                  {pendingTransactionCount > 0 && (
                    <View style={s.detectionPulseWrap}>
                      <Animated.View style={[
                        s.detectionPulseOuter,
                        {
                          backgroundColor: colors.primary + "40",
                          transform: [{ scale: pulseAnim }],
                        }
                      ]} />
                      <View style={[s.detectionPulseInner, { backgroundColor: colors.primary }]} />
                    </View>
                  )}
                </View>
                
                <View style={s.detectionTextSection}>
                  <Text style={s.detectionTitle}>
                    {pendingTransactionCount > 0
                      ? `${pendingTransactionCount} Transaction${pendingTransactionCount > 1 ? "s" : ""} Pending`
                      : "Smart Detection Active"}
                  </Text>
                  <Text style={s.detectionSubtitle}>
                    {pendingTransactionCount > 0
                      ? "Tap to review and approve to ledger"
                      : "Scanning notifications for bank & UPI alerts"}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={s.detectionChevron} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Smart Suggestions (one-tap expense logging) */}
        <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodyTranslateY }] }}>
          <SmartSuggestions
            expenses={expenses}
            customCategories={customCategories}
            onLogExpense={async (data) => {
              await addExpenseWithBudgetCheck({
                category: data.category as ExpenseCategory,
                amount: data.amount,
                description: data.description,
                date: new Date().toISOString(),
                recurring: null,
              });
            }}
          />
        </Animated.View>

        <Animated.View style={{ opacity: bodyOpacity, transform: [{ translateY: bodyTranslateY }] }}>
          {/* Monthly Insight Hero Section */}
          <View style={s.insightHeroCard}>
          <View style={s.insightHeroHeader}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={[s.insightHeroTitle, { color: colors.primary }]}>MONTHLY INSIGHT</Text>
          </View>
          <Text style={s.insightHeroText}>
            {spent === 0
              ? "Your budget for this month is fresh and ready. Let's make it financially great! ✨"
              : budgetLimit === 0
              ? `You have spent ${currency}${fmt(spent)} this month. Consider setting a monthly budget limit in your profile to track against.`
              : spentPct < 50
              ? `Looking great! You've used only ${spentPct}% of your monthly budget. Calm, steady, and on track.`
              : spentPct <= 80
              ? `Pacing fine. You've spent ${currency}${fmt(spent)} so far. Your average daily spend is ${currency}${fmt(Math.max(1, spent / new Date().getDate()))}. Keep up the steady spending.`
              : spentPct < 100
              ? `Note: You've used ${spentPct}% of your budget. With ${Math.max(1, 30 - new Date().getDate())} days remaining, consider slowing down your non-essential spending.`
              : `Budget cap reached. You have exceeded your limit by ${currency}${fmt(spent - budgetLimit)}. Let's pause and keep transactions essential.`}
          </Text>
        </View>


        {/* Quick Actions */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity onPress={() => router.push("/profile")} activeOpacity={0.7}>
              <Text style={s.sectionLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={s.grid}>
            {quickActionCategories.map((cat) => {
              const catSpent = getSpentByCategory(cat.key);
              const limit = budgetLimits?.[cat.key] || 0;
              return (
                <TouchableOpacity
                  key={cat.key}
                  testID={`button-category-${cat.key}`}
                  accessibilityLabel={`${cat.label} category, total spent ${currency}${fmt(catSpent)}`}
                  accessibilityRole="button"
                  style={s.catTile}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/add/${cat.key}` as any)}
                >
                  <View style={[s.catIconBox, { backgroundColor: cat.bg }]}>
                    <CategoryIcon name={cat.icon} color={cat.color} size={22} />
                  </View>
                  <Text style={s.catLabel}>{cat.label}</Text>
                  <Text style={[s.catAmount, { color: cat.color }]}>{currency}{fmt(catSpent)}</Text>
                  {limit > 0 && (
                    <View style={s.miniProgressBarContainer}>
                      <View
                        style={[
                          s.miniProgressBarFill,
                          {
                            width: `${Math.min(100, (catSpent / limit) * 100)}%`,
                            backgroundColor:
                              (catSpent / limit) >= 0.9
                                ? colors.destructive
                                : (catSpent / limit) >= 0.7
                                ? "#f97316"
                                : cat.color,
                          },
                        ]}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              testID="button-add-category"
              accessibilityLabel="Add custom category"
              accessibilityRole="button"
              style={s.addCatTile}
              activeOpacity={0.75}
              onPress={() => router.push("/add-category")}
            >
              <View style={s.addCatInner}>
                <View style={s.addCatIconBox}>
                  <Ionicons name="add" size={20} color="#9ca3af" />
                </View>
                <Text style={s.addCatLabel} numberOfLines={2}>
                  Add Category
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Insight Carousel - horizontal ScrollView (safe inside vertical ScrollView) */}
        <ScrollView
          ref={insightScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={s.insightList}
          onScroll={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const pageWidth = screenWidth - 40;
            if (pageWidth > 0) {
              const newIndex = Math.round(offsetX / pageWidth);
              if (newIndex >= 0 && newIndex < insights.length && newIndex !== activeInsight) {
                setActiveInsight(newIndex);
                dotAnimations.forEach((anim, i) => {
                  Animated.spring(anim, { toValue: i === newIndex ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
                });
              }
            }
          }}
          scrollEventThrottle={16}
        >
          {insights.map((item, i) => (
            <View key={i} style={s.insightCard}>
              <View style={[s.insightIcon, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon as any} size={18} color="#fff" />
              </View>
              <Text style={s.insightText}>{item.text}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </View>
          ))}
        </ScrollView>
        <View style={s.dotsRow}>
          {insights.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goToInsight(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Animated.View
                style={[
                  s.dot,
                  {
                    width: dotAnimations[i].interpolate({ inputRange: [0, 1], outputRange: [6, 18] }),
                    backgroundColor: dotAnimations[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [colors.border, colors.primary],
                    }),
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Activity */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity
              testID="button-view-history"
              onPress={() => router.navigate("/(tabs)/history")}
              activeOpacity={0.7}
            >
              <Text style={s.sectionLink}>See All</Text>
            </TouchableOpacity>
          </View>

          <View style={s.activityCard}>
            {recentActivities.length === 0 ? (
              <TouchableOpacity
                style={s.emptyActivity}
                activeOpacity={0.75}
                onPress={() => router.push("/quick-log")}
              >
                <View style={[s.emptyIconCircle, { backgroundColor: colors.primary + "12" }]}>
                  <Ionicons name="receipt-outline" size={24} color={colors.primary} />
                </View>
                <Text style={s.emptyActivityText}>Your ledger is empty this month</Text>
                <Text style={s.emptyActivitySub}>
                  Tap any category above or the flash button below to log your first transaction.
                </Text>
              </TouchableOpacity>
            ) : (
              recentActivities.map((act, idx) => (
                <TouchableOpacity
                  key={act.id}
                  style={[s.activityRow, idx > 0 && s.activityRowBorder]}
                  activeOpacity={0.75}
                  onPress={() => {
                    if (act.route.startsWith("/(tabs)")) {
                      router.navigate(act.route as any);
                    } else {
                      router.push(act.route as any);
                    }
                  }}
                >
                  <View style={[s.activityIcon, { backgroundColor: act.bg }]}>
                    <Ionicons name={act.icon as any} size={18} color={act.color} />
                  </View>
                  <View style={s.activityBody}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.activityTitle} numberOfLines={1}>
                        {act.title}
                      </Text>
                      {act.isRecurring && (
                        <View style={s.miniRecurringBadge}>
                          <Ionicons name="repeat" size={10} color={colors.primary} />
                          <Text style={s.miniRecurringBadgeText}>Bill</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.activitySub}>{act.subtitle}</Text>
                  </View>
                  <View style={s.activityRight}>
                    <Text
                      style={[
                        s.activityAmount,
                        act.positive ? { color: "#10b981" } : { color: "#ef4444" },
                      ]}
                    >
                      {act.positive ? "+" : "-"}{currency}{fmt(act.amount)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
        <NativeAdCard />
        </Animated.View>
      </ScrollView>

      {/* Reminders Modal */}
      <ReminderModal
        visible={reminderModalVisible}
        onClose={() => setReminderModalVisible(false)}
      />
      <AppTourOverlay
        isVisible={tourVisible}
        onClose={handleCloseTour}
        colors={colors}
        notifLayout={notifLayout}
        budgetLayout={budgetLayout}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>, topPad: number, tabBarClearance: number, tileWidth: number, screenWidth: number) {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerBg: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 300,
    },
    headerBlob: {
      position: "absolute",
      top: -30,
      right: -50,
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: isDark ? "#122d1f" : "#c8edd8",
      opacity: 0.55,
    },
    leavesWrap: {
      position: "absolute",
      top: topPad + 4,
      right: 18,
      flexDirection: "row",
      zIndex: 2,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: topPad + 6,
      paddingBottom: tabBarClearance + 16,
    },
    header: {
      marginBottom: 18,
      zIndex: 1,
    },
    greetSub: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
    },
    greetName: {
      flex: 1,
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    greetTagline: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: 8,
    },
    themeToggleBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    themeIconWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    settingsBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    balanceCard: {
      borderRadius: 28,
      padding: 22,
      marginBottom: 22,
      overflow: "hidden",
      shadowColor: isDark ? "transparent" : "#0d3d26",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 8,
    },
    quickLogCompactBtn: {
      marginBottom: 22,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 2,
    },
    quickLogCompactContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    quickLogCompactIconBg: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    quickLogCompactText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    quickLogCompactSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      marginLeft: 6,
    },
    cardWave1: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: "rgba(255,255,255,0.07)",
      top: -50,
      right: -30,
    },
    cardWave2: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: "rgba(255,255,255,0.05)",
      bottom: -80,
      left: -50,
    },
    balanceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    balanceLeft: {
      flex: 1,
      paddingRight: 8,
    },
    balLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: "rgba(255,255,255,0.85)",
    },
    balAmount: {
      fontSize: 38,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginTop: 4,
      letterSpacing: -1,
    },
    vsBadge: {
      alignSelf: "flex-start",
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.15)",
    },
    vsText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    ringBox: {
      width: 88,
      height: 88,
      alignItems: "center",
      justifyContent: "center",
    },
    ringCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
      width: 62,
      paddingHorizontal: 2,
    },
    ringPct: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    ringLimit: {
      fontSize: 7,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.8)",
      textAlign: "center",
      lineHeight: 9,
      marginTop: 1,
    },
    section: {
      marginBottom: 20,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    sectionLink: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    catTile: {
      width: tileWidth,
      alignItems: "center",
    },
    catIconBox: {
      width: 54,
      height: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    catLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    catAmount: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      marginTop: 2,
    },
    miniProgressBarContainer: {
      width: "80%",
      height: 3,
      backgroundColor: colors.border,
      borderRadius: 1.5,
      marginTop: 4,
      overflow: "hidden",
    },
    miniProgressBarFill: {
      height: "100%",
      borderRadius: 1.5,
    },
    addCatTile: {
      width: tileWidth,
      alignItems: "center",
    },
    addCatInner: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 4,
      minHeight: 96,
    },
    addCatIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    addCatLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 13,
      paddingHorizontal: 2,
    },
    insightList: {
      marginBottom: 0,
    },
    insightCard: {
      width: screenWidth - 40,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 1,
    },
    insightIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    insightText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      lineHeight: 18,
    },
    dotsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
      marginTop: 10,
      marginBottom: 20,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 8,
    },
    activityCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 6,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    activityRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
    },
    activityRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    activityIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    activityBody: {
      flex: 1,
      marginLeft: 12,
    },
    activityTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    activitySub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    activityRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    activityAmount: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    emptyActivity: {
      paddingVertical: 32,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyIconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    insightHeroCard: {
      backgroundColor: isDark ? "rgba(24, 99, 63, 0.12)" : "rgba(24, 99, 63, 0.05)",
      borderColor: isDark ? "rgba(24, 99, 63, 0.22)" : "rgba(24, 99, 63, 0.12)",
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      marginTop: 0,
      marginBottom: 22,
    },
    insightHeroHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6,
    },
    insightHeroTitle: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      letterSpacing: 1,
    },
    insightHeroText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 18,
    },
    emptyActivityText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    emptyActivitySub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 6,
      textAlign: "center",
      lineHeight: 18,
    },
    bellRedDot: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#ef4444",
      borderWidth: 1.5,
      borderColor: colors.card,
    },
    miniRecurringBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.primary + "10",
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 6,
      borderWidth: 0.5,
      borderColor: colors.primary + "25",
      gap: 2,
    },
    miniRecurringBadgeText: {
      fontSize: 9,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    detectionCard: {
      position: "relative",
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    detectionCardBg: {
      ...StyleSheet.absoluteFillObject,
    },
    detectionCardContent: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
    },
    detectionIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    detectionPulseWrap: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    detectionPulseOuter: {
      position: "absolute",
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    detectionPulseInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.card,
    },
    detectionTextSection: {
      flex: 1,
      marginLeft: 12,
    },
    detectionTitle: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    detectionSubtitle: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    detectionChevron: {
      marginLeft: 8,
    },
  });
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <HomeScreen />
    </ErrorBoundary>
  );
}
