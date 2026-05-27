import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  useApp,
  ExpenseCategory,
  CustomCategory,
  Expense,
  SplitGroup,
  parseGroupName,
} from "@/context/AppContext";
import { isSameMember, getExpenseMemberConsumptionShare } from "@/lib/split";
import { useColors } from "@/hooks/useColors";
import { useThemePreference } from "@/hooks/useThemePreference";

const GREEN = "#18633f";
const GREEN_DARK = "#134830";

type CategoryTile = {
  key: string;
  label: string;
  icon: string;
  iconSet?: "ion" | "mci";
  color: string;
  bg: string;
};

const BUILTIN_CATEGORIES: CategoryTile[] = [
  { key: "travel", label: "Travel", icon: "airplane", iconSet: "ion", color: "#10b981", bg: "#e6f7f0" },
  { key: "food", label: "Food", icon: "silverware-fork-knife", iconSet: "mci", color: "#f97316", bg: "#fff5e6" },
  { key: "shopping", label: "Shopping", icon: "bag-handle", iconSet: "ion", color: "#a855f7", bg: "#f5ebff" },
  { key: "entertainment", label: "Fun", icon: "game-controller", iconSet: "ion", color: "#ec4899", bg: "#fdf0f5" },
  { key: "healthcare", label: "Health", icon: "heart", iconSet: "ion", color: "#ef4444", bg: "#fdebeb" },
  { key: "others", label: "Others", icon: "ellipsis-horizontal", iconSet: "ion", color: "#6b7280", bg: "#f0f2f5" },
];

const BUILTIN_META: Record<
  ExpenseCategory,
  { icon: string; color: string; bg: string; label: string }
> = {
  travel: { icon: "airplane", color: "#10b981", bg: "#e6f7f0", label: "Travel" },
  food: { icon: "restaurant", color: "#f97316", bg: "#fff5e6", label: "Food" },
  shopping: { icon: "bag-handle", color: "#a855f7", bg: "#f5ebff", label: "Shopping" },
  entertainment: { icon: "game-controller", color: "#ec4899", bg: "#fdf0f5", label: "Fun" },
  healthcare: { icon: "heart", color: "#ef4444", bg: "#fdebeb", label: "Health" },
  others: { icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5", label: "Others" },
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
    iconSet: "ion",
    color: cat.color,
    bg: cat.color + "18",
  };
}

function resolveExpenseMeta(
  category: string | null | undefined,
  customCategories: CustomCategory[],
  colors: ReturnType<typeof useColors>
): { icon: string; color: string; bg: string; label: string } {
  if (category && category in BUILTIN_META) {
    const builtin = BUILTIN_META[category as ExpenseCategory];
    const color = (colors as any)[category] || colors.primary;
    return {
      ...builtin,
      color,
      bg: color + "18",
    };
  }
  const custom = category ? customCategories.find((c) => c.id === category) : undefined;
  if (custom) {
    return {
      icon: custom.icon,
      color: custom.color,
      bg: custom.color + "18",
      label: custom.name,
    };
  }
  const defaultColor = colors.mutedForeground;
  return {
    icon: "ellipsis-horizontal",
    color: defaultColor,
    bg: defaultColor + "18",
    label: "Others",
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
    return {
      id: exp.id,
      title: exp.description || meta.label,
      subtitle: formatActivityDate(exp.date),
      amount: exp.amount,
      icon: meta.icon,
      color: meta.color,
      bg: meta.bg,
      route: "/(tabs)/history",
      sortDate: exp.date,
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

function CircularProgress({ pct, size = 88 }: { pct: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = circ * (1 - clamped / 100);

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={5}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#fff"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circ}`}
        strokeDashoffset={offset}
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

function CategoryIcon({
  name,
  iconSet,
  color,
  size = 22,
}: {
  name: string;
  iconSet?: "ion" | "mci";
  color: string;
  size?: number;
}) {
  if (iconSet === "mci") {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    profile,
    expenses,
    allExpenses,
    splitGroups,
    customCategories,
    getCurrentMonthTotal,
    getSpentByCategory,
  } = useApp();

  const salary = profile?.salary ?? 0;
  const spent = getCurrentMonthTotal();
  const budgetLimit = salary > 0 ? salary : 0;
  const remaining = budgetLimit > 0 ? Math.max(budgetLimit - spent, 0) : 0;
  const spentPctRaw =
    budgetLimit > 0 ? Math.round((spent / budgetLimit) * 100) : 0;
  const spentPct = Math.min(100, spentPctRaw);
  const remainingPct =
    budgetLimit > 0 ? Math.min(100, Math.round((remaining / budgetLimit) * 100)) : 0;

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
    type Insight = { text: string; icon: string; iconBg: string };
    const results: Insight[] = [];

    const now = new Date();
    const msInDay = 86400000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek1 = startOfToday - 6 * msInDay;
    const startOfWeek2 = startOfToday - 13 * msInDay;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    if (allExpenses.length === 0) {
      return [
        { text: "Add your first expense to see spending insights! 📊", icon: "bulb-outline", iconBg: "#6366f1" },
        { text: "Track your expenses daily to build better financial habits 💪", icon: "calendar-outline", iconBg: "#8b5cf6" },
        { text: "Set a monthly budget in Settings to stay on track 🎯", icon: "flag-outline", iconBg: GREEN },
      ];
    }

    let w1Total = 0;
    let w2Total = 0;
    const w1CategoryTotals: Record<string, number> = {};
    const w2CategoryTotals: Record<string, number> = {};
    let monthTotal = 0;
    const allCatTotals: Record<string, number> = {};

    allExpenses.forEach((e) => {
      const t = new Date(e.date).getTime();
      allCatTotals[e.category] = (allCatTotals[e.category] || 0) + e.amount;
      if (t >= startOfMonth) monthTotal += e.amount;
      if (t >= startOfWeek1) {
        w1Total += e.amount;
        w1CategoryTotals[e.category] = (w1CategoryTotals[e.category] || 0) + e.amount;
      } else if (t >= startOfWeek2 && t < startOfWeek1) {
        w2Total += e.amount;
        w2CategoryTotals[e.category] = (w2CategoryTotals[e.category] || 0) + e.amount;
      }
    });

    // Insight 1: week-over-week overall trend
    if (w1Total > 0 && w2Total > 0) {
      const diff = w2Total - w1Total;
      const pct = Math.round((Math.abs(diff) / w2Total) * 100);
      if (pct >= 5) {
        if (diff > 0) {
          results.push({ text: `You spent ${pct}% less this week vs last week 🎉`, icon: "trending-down", iconBg: "#10b981" });
        } else {
          results.push({ text: `Heads up! Spending is up ${pct}% vs last week 📉`, icon: "trending-up", iconBg: "#ef4444" });
        }
      } else {
        results.push({ text: `Steady spender! This week (₹${fmt(w1Total)}) ≈ last week (₹${fmt(w2Total)}) ⚖️`, icon: "scale-outline", iconBg: GREEN });
      }
    } else if (w1Total > 0) {
      results.push({ text: `You spent ₹${fmt(w1Total)} this week across ${Object.keys(w1CategoryTotals).length} categories 💰`, icon: "wallet-outline", iconBg: GREEN });
    } else if (w2Total > 0) {
      results.push({ text: `Zero spending this week vs ₹${fmt(w2Total)} last week 🥳`, icon: "trending-down", iconBg: "#10b981" });
    }

    // Insight 2: top category change week-over-week
    let insightCategory = "";
    let maxChangePct = 0;
    let isLess = false;
    const allCategories = new Set([...Object.keys(w1CategoryTotals), ...Object.keys(w2CategoryTotals)]);
    for (const cat of allCategories) {
      const amt1 = w1CategoryTotals[cat] || 0;
      const amt2 = w2CategoryTotals[cat] || 0;
      if (amt1 > 0 && amt2 > 0) {
        const diff = amt2 - amt1;
        const pct = Math.round((Math.abs(diff) / amt2) * 100);
        if (pct >= 5 && pct > maxChangePct) {
          maxChangePct = pct;
          isLess = diff > 0;
          insightCategory = cat;
        }
      }
    }
    if (insightCategory && maxChangePct > 0) {
      const catLabel = resolveExpenseMeta(insightCategory, customCategories, colors).label;
      if (isLess) {
        results.push({ text: `${maxChangePct}% less on ${catLabel} this week — great control! 🥳`, icon: "trending-down", iconBg: "#10b981" });
      } else {
        results.push({ text: `${catLabel} spending is up ${maxChangePct}% this week 📈`, icon: "trending-up", iconBg: "#ef4444" });
      }
    }

    // Insight 3: top category overall + month total
    let topCat = "others";
    let maxVal = 0;
    Object.entries(allCatTotals).forEach(([cat, val]) => {
      if (val > maxVal) { maxVal = val; topCat = cat; }
    });
    const catMeta = resolveExpenseMeta(topCat, customCategories, colors);
    const totalSpentAll = allExpenses.reduce((sum, e) => sum + e.amount, 0);
    const topPct = totalSpentAll > 0 ? Math.round((maxVal / totalSpentAll) * 100) : 0;
    results.push({ text: `${catMeta.label} is your top spend (${topPct}% of ₹${fmt(totalSpentAll)} total) 💡`, icon: "pie-chart-outline", iconBg: "#6366f1" });

    // Insight 4: this month summary
    if (monthTotal > 0) {
      const budgetUsed = budgetLimit > 0 ? Math.round((monthTotal / budgetLimit) * 100) : 0;
      if (budgetLimit > 0) {
        results.push({ text: `This month: ₹${fmt(monthTotal)} spent (${budgetUsed}% of your ₹${fmt(budgetLimit)} budget) 📅`, icon: "calendar-outline", iconBg: budgetUsed > 80 ? "#ef4444" : GREEN });
      } else {
        results.push({ text: `You've spent ₹${fmt(monthTotal)} so far this month 📅`, icon: "calendar-outline", iconBg: GREEN });
      }
    }

    return results.slice(0, 4);
  }, [allExpenses, customCategories, budgetLimit, colors]);

  const screenWidth = Dimensions.get("window").width;
  const horizontalPad = 20;
  const gridGap = 10;
  const tileWidth = (screenWidth - horizontalPad * 2 - gridGap * 3) / 4;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const tabBarClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

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

  const toggleTheme = useCallback(() => {
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
        colors={gradientColors}
        locations={[0, 0.35, 1]}
        style={s.headerBg}
      />
      <View style={s.headerBlob} />
      <View style={s.leavesWrap}>
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
        <View style={s.header}>
          <Text style={s.greetSub}>Good morning,</Text>
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
              >
                <Animated.View style={[StyleSheet.absoluteFill, s.themeIconWrap, { opacity: sunOpacity, transform: [{ rotate: themeRotate }] }]}>
                  <Ionicons name="sunny" size={20} color="#f59e0b" />
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, s.themeIconWrap, { opacity: moonOpacity, transform: [{ rotate: themeRotate }] }]}>
                  <Ionicons name="moon" size={18} color="#818cf8" />
                </Animated.View>
              </TouchableOpacity>
              <TouchableOpacity
                testID="button-settings"
                style={s.settingsBtn}
                onPress={() => router.push("/profile")}
                activeOpacity={0.8}
              >
                <Ionicons name="settings-outline" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={s.greetTagline}>Let's make today financially great.</Text>
        </View>

        {/* Balance card */}
        <LinearGradient
          colors={[GREEN, GREEN_DARK]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.balanceCard}
        >
          <View style={s.cardWave1} />
          <View style={s.cardWave2} />
          <View style={s.balanceRow}>
            <View style={s.balanceLeft}>
              <Text style={s.balLabel}>Total Balance</Text>
              <Text style={s.balAmount}>₹{fmt(totalBalance)}</Text>
              {budgetLimit > 0 && (
                <View style={s.vsBadge}>
                  <Text style={s.vsText}>
                    ₹{fmt(spent)} spent · {spentPct}% of limit used
                  </Text>
                </View>
              )}
            </View>
            <View style={s.ringBox}>
              <CircularProgress pct={spentPct} size={88} />
              <View style={s.ringCenter}>
                <Text style={s.ringPct}>{spentPctRaw}%</Text>
                <Text
                  style={s.ringLimit}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {budgetLimit > 0 ? `of ₹${fmt(budgetLimit)} limit` : "set salary in settings"}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Quick Log Compact Action Row */}
        <TouchableOpacity
          testID="button-quick-log-main"
          onPress={() => router.push("/quick-log")}
          style={s.quickLogCompactBtn}
          activeOpacity={0.8}
        >
          <View style={s.quickLogCompactContent}>
            <View style={[s.quickLogCompactIconBg, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="flash" size={16} color={colors.primary} />
            </View>
            <Text style={[s.quickLogCompactText, { color: colors.foreground }]}>
              Quick Log Expense
            </Text>
            <Text style={[s.quickLogCompactSub, { color: colors.mutedForeground }]}>
              in 3 seconds
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} style={{ marginLeft: "auto" }} />
          </View>
        </TouchableOpacity>

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
              return (
                <TouchableOpacity
                  key={cat.key}
                  testID={`button-category-${cat.key}`}
                  style={s.catTile}
                  activeOpacity={0.75}
                  onPress={() => router.push(`/add/${cat.key}` as any)}
                >
                  <View style={[s.catIconBox, { backgroundColor: cat.bg }]}>
                    <CategoryIcon name={cat.icon} iconSet={cat.iconSet} color={cat.color} size={22} />
                  </View>
                  <Text style={s.catLabel}>{cat.label}</Text>
                  <Text style={[s.catAmount, { color: cat.color }]}>₹{fmt(catSpent)}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              testID="button-add-category"
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
          scrollEnabled={false}
          style={s.insightList}
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
              onPress={() => router.push("/(tabs)/history")}
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
                <Text style={s.emptyActivityText}>No activity yet this month</Text>
                <Text style={s.emptyActivitySub}>Tap a category above to add an expense</Text>
              </TouchableOpacity>
            ) : (
              recentActivities.map((act, idx) => (
                <TouchableOpacity
                  key={act.id}
                  style={[s.activityRow, idx > 0 && s.activityRowBorder]}
                  activeOpacity={0.75}
                  onPress={() => router.push(act.route as any)}
                >
                  <View style={[s.activityIcon, { backgroundColor: act.bg }]}>
                    <Ionicons name={act.icon as any} size={18} color={act.color} />
                  </View>
                  <View style={s.activityBody}>
                    <Text style={s.activityTitle} numberOfLines={1}>
                      {act.title}
                    </Text>
                    <Text style={s.activitySub}>{act.subtitle}</Text>
                  </View>
                  <View style={s.activityRight}>
                    <Text
                      style={[
                        s.activityAmount,
                        act.positive ? { color: "#10b981" } : { color: "#ef4444" },
                      ]}
                    >
                      {act.positive ? "+" : "-"}₹{fmt(act.amount)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>
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
      paddingVertical: 28,
      alignItems: "center",
    },
    emptyActivityText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptyActivitySub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      textAlign: "center",
    },
  });
}
