import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  budgetBarColor,
  getCategoryBreakdown,
  getLast6Months,
  getMonthComparison,
} from "@/lib/insights";

const GREEN = "#18633f";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const {
    allExpenses,
    profile,
    customCategories,
    budgetLimits,
    getCurrentMonthExpenses,
    getSpentByCategory,
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const tabClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  const monthData = useMemo(() => getLast6Months(allExpenses), [allExpenses]);
  const currentExps = useMemo(
    () => getCurrentMonthExpenses(),
    [allExpenses, getCurrentMonthExpenses]
  );
  const totalSpent = useMemo(
    () => currentExps.reduce((s, e) => s + e.amount, 0),
    [currentExps]
  );

  const currentMonth = monthData[5];
  const lastMonth = monthData[4];
  const avgMonthly = monthData.reduce((s, m) => s + m.total, 0) / 6;
  const comparison = useMemo(
    () => getMonthComparison(currentMonth.total, lastMonth.total, lastMonth.label),
    [currentMonth.total, lastMonth.total, lastMonth.label]
  );

  const salary = profile?.salary ?? 0;
  const remaining = salary > 0 ? Math.max(salary - totalSpent, 0) : 0;

  const catBreakdown = useMemo(
    () => getCategoryBreakdown(currentExps, customCategories),
    [currentExps, customCategories]
  );

  const budgetEntries = useMemo(() => {
    const meta = (key: string) => {
      const builtin = [
        { key: "travel", label: "Travel", icon: "airplane", color: "#10b981", bg: "#e6f7f0" },
        { key: "food", label: "Food", icon: "restaurant", color: "#f97316", bg: "#fff5e6" },
        { key: "shopping", label: "Shopping", icon: "bag-handle", color: "#a855f7", bg: "#f5ebff" },
        { key: "entertainment", label: "Fun", icon: "game-controller", color: "#ec4899", bg: "#fdf0f5" },
        { key: "healthcare", label: "Health", icon: "heart", color: "#ef4444", bg: "#fdebeb" },
        { key: "others", label: "Others", icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5" },
      ].find((c) => c.key === key);
      const custom = customCategories.find((c) => c.id === key);
      return custom
        ? { label: custom.name, icon: custom.icon, color: custom.color, bg: custom.color + "18" }
        : builtin ?? {
            label: "Category",
            icon: "ellipsis-horizontal",
            color: "#6b7280",
            bg: "#f0f2f5",
          };
    };

    return Object.entries(budgetLimits || {})
      .filter(([, limit]) => limit > 0)
      .map(([key, limit]) => {
        const spent = getSpentByCategory(key);
        const pct = Math.min((spent / limit) * 100, 100);
        return { key, limit, spent, pct, ...meta(key) };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [budgetLimits, customCategories, getSpentByCategory]);

  const chartWidth = width - 80;
  const barGap = 8;
  const barW = (chartWidth - barGap * 5) / 6;
  const maxBarH = 100;
  const maxVal = Math.max(...monthData.map((m) => m.total), 1);

  const monthLabel = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const hasData = allExpenses.length > 0;
  const isDark = colors.background !== "#f4faf6";
  const gradientColors = isDark 
    ? ["#0b1610", "#080c09", "#080c09"] 
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];
  const s = createStyles(colors, topPad, tabClearance);

  return (
    <View style={s.root}>
      <LinearGradient
        colors={gradientColors}
        locations={[0, 0.35, 1]}
        style={s.headerBg}
      />
      <View style={s.headerBlob} />
      <View style={s.leavesWrap}>
        <Ionicons name="leaf" size={14} color="#86efac" style={{ transform: [{ rotate: "-40deg" }] }} />
        <Ionicons name="leaf" size={22} color="#4ade80" style={{ marginLeft: 4, marginTop: -8 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.pageTitle}>Insights</Text>
        <Text style={s.pageSub}>Your spending patterns · {monthLabel}</Text>

        {!hasData ? (
          <View style={s.emptyCard}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.primary} />
            <Text style={s.emptyTitle}>No insights yet</Text>
            <Text style={s.emptyText}>
              Add expenses from Home and this screen will show where your money goes.
            </Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => router.push("/(tabs)")}
            >
              <Text style={s.primaryBtnText}>Add expense</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 3 summary cards */}
            <View style={s.statRow}>
              <View style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                </View>
                <Text style={s.statLabel}>This month</Text>
                <Text style={s.statValue}>₹{fmt(currentMonth.total)}</Text>
                <Text style={s.statMeta}>{currentExps.length} expenses</Text>
              </View>

              <View style={s.statCard}>
                <View
                  style={[
                    s.statIcon,
                    { backgroundColor: comparison.improved ? colors.muted : (colors.destructive + "18") },
                  ]}
                >
                  <Ionicons
                    name={comparison.improved ? "trending-down" : "trending-up"}
                    size={18}
                    color={comparison.improved ? colors.primary : colors.destructive}
                  />
                </View>
                <Text style={s.statLabel}>vs {comparison.lastMonthLabel}</Text>
                <Text
                  style={[
                    s.statValue,
                    { color: comparison.improved ? colors.primary : colors.destructive, fontSize: 17 },
                  ]}
                >
                  {comparison.diffPct != null
                    ? `${comparison.improved ? "↓" : "↑"}${comparison.diffPct}%`
                    : "—"}
                </Text>
                <Text style={s.statMeta}>
                  {comparison.improved ? "Less" : "More"} spend
                </Text>
              </View>

              <View style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: "#eff6ff" }]}>
                  <Ionicons name="analytics-outline" size={18} color="#3b82f6" />
                </View>
                <Text style={s.statLabel}>6-mo avg</Text>
                <Text style={[s.statValue, { fontSize: 17 }]}>₹{fmt(avgMonthly)}</Text>
                <Text style={s.statMeta}>Per month</Text>
              </View>
            </View>

            {salary > 0 && (
              <View style={s.salaryBanner}>
                <Text style={s.salaryBannerText}>
                  ₹{fmt(remaining)} left of ₹{fmt(salary)} monthly salary
                </Text>
              </View>
            )}

            {/* 6-month trend */}
            <View style={s.card}>
              <Text style={s.cardTitle}>6-Month Trend</Text>
              <Text style={s.cardSub}>How your spending changes over time</Text>
              {monthData.every((m) => m.total === 0) ? (
                <Text style={s.hintCenter}>No history yet</Text>
              ) : (
                <>
                  <Svg width={chartWidth} height={maxBarH + 40} style={{ marginTop: 12 }}>
                    {monthData.map((month, i) => {
                      const barH =
                        month.total > 0
                          ? Math.max((month.total / maxVal) * maxBarH, 6)
                          : 4;
                      const x = i * (barW + barGap);
                      const y = maxBarH - barH;
                      return (
                        <G key={i}>
                          {month.total > 0 && barH > 20 && (
                            <SvgText
                              x={x + barW / 2}
                              y={y - 4}
                              textAnchor="middle"
                              fontSize={9}
                              fill={month.isCurrent ? colors.primary : colors.mutedForeground}
                            >
                              {month.total >= 1000
                                ? `${Math.round(month.total / 1000)}k`
                                : String(Math.round(month.total))}
                            </SvgText>
                          )}
                          <Rect
                            x={x}
                            y={y}
                            width={barW}
                            height={barH}
                            rx={6}
                            fill={month.isCurrent ? colors.primary : (isDark ? "#234231" : "#a7d4bc")}
                          />
                          <SvgText
                            x={x + barW / 2}
                            y={maxBarH + 18}
                            textAnchor="middle"
                            fontSize={10}
                            fill={month.isCurrent ? colors.foreground : colors.mutedForeground}
                          >
                            {month.label}
                          </SvgText>
                        </G>
                      );
                    })}
                  </Svg>
                  <View style={s.chartLegend}>
                    <View style={[s.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={s.legendText}>Current month</Text>
                    <View style={[s.legendDot, { backgroundColor: isDark ? "#234231" : "#a7d4bc", marginLeft: 12 }]} />
                    <Text style={s.legendText}>Earlier</Text>
                  </View>
                </>
              )}
            </View>

            {/* What you're spending on */}
            <View style={s.card}>
              <Text style={s.cardTitle}>What you're spending on</Text>
              {totalSpent === 0 ? (
                <Text style={s.hintCenter}>No spending this month yet.</Text>
              ) : (
                <>
                  <View style={s.splitBar}>
                    {catBreakdown.map((cat) => {
                      const pct = (cat.amount / totalSpent) * 100;
                      if (pct < 1) return null;
                      return (
                        <View
                          key={cat.key}
                          style={[s.splitSeg, { flex: pct, backgroundColor: cat.color }]}
                        />
                      );
                    })}
                  </View>
                  <View style={s.legendWrap}>
                    {catBreakdown.slice(0, 4).map((cat) => (
                      <View key={cat.key} style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: cat.color }]} />
                        <Text style={s.legendText} numberOfLines={1}>
                          {cat.label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.catList}>
                    {catBreakdown.map((cat, idx) => {
                      const pct = (cat.amount / totalSpent) * 100;
                      return (
                        <View key={cat.key} style={idx > 0 ? s.catRowBorder : undefined}>
                          <View style={s.catRow}>
                            <View style={[s.catIcon, { backgroundColor: cat.bg }]}>
                              <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                            </View>
                            <View style={s.catInfo}>
                              <Text style={s.catName}>{cat.label}</Text>
                              <View style={s.catBarTrack}>
                                <View
                                  style={[
                                    s.catBarFill,
                                    { width: `${pct}%`, backgroundColor: cat.color },
                                  ]}
                                />
                              </View>
                            </View>
                            <View style={s.catRight}>
                              <Text style={[s.catAmt, { color: cat.color }]}>
                                ₹{fmt(cat.amount)}
                              </Text>
                              <Text style={s.catPct}>{Math.round(pct)}%</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {/* Budget */}
            {budgetEntries.length > 0 ? (
              <View style={s.card}>
                <View style={s.cardHeaderRow}>
                  <Text style={s.cardTitle}>Budget Status</Text>
                  <TouchableOpacity onPress={() => router.push("/settings")}>
                    <Text style={s.link}>Edit</Text>
                  </TouchableOpacity>
                </View>
                {budgetEntries.map((b, idx) => {
                  const color = budgetBarColor(b.pct);
                  return (
                    <View key={b.key} style={idx > 0 ? s.catRowBorder : undefined}>
                      <View style={s.budgetRow}>
                        <View style={[s.catIcon, { backgroundColor: b.bg }]}>
                          <Ionicons name={b.icon as any} size={16} color={b.color} />
                        </View>
                        <Text style={s.catName}>{b.label}</Text>
                        <Text style={[s.budgetPct, { color }]}>{Math.round(b.pct)}%</Text>
                      </View>
                      <View style={s.catBarTrack}>
                        <View style={[s.catBarFill, { width: `${b.pct}%`, backgroundColor: color }]} />
                      </View>
                      <Text style={s.budgetMeta}>
                        ₹{fmt(b.spent)} spent · ₹{fmt(Math.max(b.limit - b.spent, 0))} left
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity
                style={s.ctaCard}
                onPress={() => router.push("/settings")}
                activeOpacity={0.85}
              >
                <Ionicons name="wallet-outline" size={22} color={GREEN} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.ctaTitle}>Set category budgets</Text>
                  <Text style={s.ctaSub}>Track limits per category in Settings</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>, topPad: number, tabClearance: number) {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    headerBg: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 260,
    },
    headerBlob: {
      position: "absolute",
      right: -50,
      top: topPad - 20,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: isDark ? "#122d1f" : "#c8edd8",
      opacity: 0.55,
    },
    leavesWrap: {
      position: "absolute",
      right: 16,
      top: topPad + 4,
      flexDirection: "row",
      zIndex: 1,
    },
    scroll: {
      paddingTop: topPad + 8,
      paddingHorizontal: 20,
      paddingBottom: tabClearance + 16,
    },
    pageTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    pageSub: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      marginBottom: 18,
    },
    statRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    statIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    statLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    statValue: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginTop: 2,
    },
    statMeta: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      textAlign: "center",
    },
    salaryBanner: {
      backgroundColor: colors.muted,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 14,
    },
    salaryBannerText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      textAlign: "center",
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    cardSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    link: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    splitBar: {
      flexDirection: "row",
      height: 14,
      borderRadius: 7,
      overflow: "hidden",
      marginTop: 14,
      backgroundColor: colors.muted,
    },
    splitSeg: { height: "100%", minWidth: 3 },
    legendWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 10,
      marginBottom: 4,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      maxWidth: 72,
    },
    catList: { marginTop: 8 },
    catRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    catRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },
    catIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    catInfo: { flex: 1, marginLeft: 12 },
    catName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 6,
    },
    catBarTrack: {
      height: 6,
      backgroundColor: colors.muted,
      borderRadius: 3,
      overflow: "hidden",
    },
    catBarFill: { height: 6, borderRadius: 3 },
    catRight: { alignItems: "flex-end", marginLeft: 8 },
    catAmt: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
    },
    catPct: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    chartLegend: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 10,
    },
    budgetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    budgetPct: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      minWidth: 36,
      textAlign: "right",
    },
    budgetMeta: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    hintCenter: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingVertical: 20,
    },
    ctaCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: isDark ? colors.border : "#d8f0e3",
    },
    ctaTitle: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    ctaSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 32,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 20,
    },
    primaryBtn: {
      marginTop: 20,
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 14,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
