import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
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
import Svg, { G, Rect, Circle, Text as SvgText } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useApp, useCurrency } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  budgetBarColor,
  getCategoryBreakdown,
  getLast6Months,
  getMonthComparison,
  calculateFinancialMetrics,
} from "@/lib/insights";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

function InsightsScreen() {
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
  const currency = useCurrency();

  const [selectedCatKey, setSelectedCatKey] = useState<string | null>(null);
  const [healthExpanded, setHealthExpanded] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const tabClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  const monthData = useMemo(() => getLast6Months(allExpenses.filter(e => e.type !== "income")), [allExpenses]);
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

  const catBreakdown = useMemo(
    () => getCategoryBreakdown(currentExps, customCategories),
    [currentExps, customCategories]
  );

  const metrics = useMemo(
    () => calculateFinancialMetrics(currentExps, salary, (budgetLimits || {}) as Record<string, number>, customCategories),
    [currentExps, salary, budgetLimits, customCategories]
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
      .map(([key, limit]) => ({ key, limit: limit || 0 }))
      .filter(({ limit }) => limit > 0)
      .map(({ key, limit }) => {
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

  // Donut SVG Math
  const donutRadius = 55;
  const donutStrokeWidth = 14;
  const donutSelectedStrokeWidth = 18;
  const donutCircumference = 2 * Math.PI * donutRadius; // ~345.57
  const donutSize = 150;
  const centerPoint = donutSize / 2;

  return (
    <View style={s.root}>
      <LinearGradient
        colors={gradientColors as any}
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
              onPress={() => router.push("/quick-log")}
            >
              <Text style={s.primaryBtnText}>Add expense</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* 3 summary cards */}
            <View style={s.statRow}>
              <View style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ecfdf5" }]}>
                  <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                </View>
                <Text style={s.statLabel}>This month</Text>
                <Text style={s.statValue}>{currency}{fmt(currentMonth.total)}</Text>
                <Text style={s.statMeta}>{currentExps.length} expenses</Text>
              </View>

              <View style={s.statCard}>
                <View
                  style={[
                    s.statIcon,
                    { backgroundColor: comparison.improved ? (isDark ? "rgba(16,185,129,0.12)" : "#ecfdf5") : (colors.destructive + "18") },
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
                <View style={[s.statIcon, { backgroundColor: isDark ? "rgba(59,130,246,0.12)" : "#eff6ff" }]}>
                  <Ionicons name="analytics-outline" size={18} color="#3b82f6" />
                </View>
                <Text style={s.statLabel}>6-mo avg</Text>
                <Text style={[s.statValue, { fontSize: 17 }]}>{currency}{fmt(avgMonthly)}</Text>
                <Text style={s.statMeta}>Per month</Text>
              </View>
            </View>

            {/* Financial Wellness / Pacing Score Card */}
            {salary > 0 && (
              <View style={s.healthCard}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={async () => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setHealthExpanded(!healthExpanded);
                  }}
                >
                  <View style={[s.healthHeader, { marginBottom: healthExpanded ? 16 : 0 }]}>
                    <View style={s.healthIconBg}>
                      <Ionicons name="heart-half-outline" size={24} color="#10b981" />
                    </View>
                    <View style={s.healthTitleContainer}>
                      <Text style={s.healthTitle}>Financial Wellness</Text>
                      <Text style={s.healthSub}>
                        {healthExpanded ? "Real-time pacing & budget analysis" : "Tap to view wellness analysis"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={s.scoreBadge}>
                        <Text style={s.scoreLabel}>Score</Text>
                        <Text style={s.scoreValue}>{metrics.spendingHealthScore}</Text>
                      </View>
                      <Ionicons
                        name={healthExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </View>
                  </View>
                </TouchableOpacity>

                {healthExpanded && (
                  <>
                    <View style={s.healthDetailsRow}>
                      <View style={s.healthProgressContainer}>
                        <Svg width={70} height={70}>
                          <Circle
                            cx={35}
                            cy={35}
                            r={28}
                            stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(16,185,129,0.1)"}
                            strokeWidth={6}
                            fill="none"
                          />
                          <Circle
                            cx={35}
                            cy={35}
                            r={28}
                            stroke={
                              metrics.spendingHealthScore >= 80
                                ? "#10b981"
                                : metrics.spendingHealthScore >= 60
                                ? "#f97316"
                                : "#ef4444"
                            }
                            strokeWidth={6}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - metrics.spendingHealthScore / 100)}`}
                            rotation={-90}
                            originX={35}
                            originY={35}
                          />
                        </Svg>
                        <View style={s.healthProgressCenter}>
                          <Text style={s.healthProgressText}>{metrics.spendingHealthScore}%</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, marginLeft: 16 }}>
                        <Text style={s.healthStatusHeading}>
                          {metrics.spendingHealthScore >= 85
                            ? "Excellent Control"
                            : metrics.spendingHealthScore >= 70
                            ? "Healthy Spending"
                            : metrics.spendingHealthScore >= 50
                            ? "Attention Advised"
                            : "Critical Budget Warning"}
                        </Text>
                        <Text style={s.healthDescription}>
                          {metrics.overspendingForecastText || "No active budget restrictions detected."}
                        </Text>
                      </View>
                    </View>

                    <View style={s.burnRateContainer}>
                      <View style={s.burnRateItem}>
                        <Text style={s.burnRateLabel}>Daily Burn Rate</Text>
                        <Text style={s.burnRateValue}>{currency}{fmt(metrics.dailyBurnRate)}</Text>
                      </View>
                      <View style={s.dividerVertical} />
                      <View style={s.burnRateItem}>
                        <Text style={s.burnRateLabel}>Projected Month Spend</Text>
                        <Text style={s.burnRateValue}>{currency}{fmt(metrics.projectedSpend)}</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Category Distribution / Donut Chart */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <View>
                  <Text style={s.cardTitle}>What you're spending on</Text>
                  <Text style={s.cardSub}>Tap a category or slice to filter details</Text>
                </View>
                {selectedCatKey !== null && (
                  <TouchableOpacity
                    onPress={async () => {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCatKey(null);
                    }}
                  >
                    <Text style={s.link}>Clear Filter</Text>
                  </TouchableOpacity>
                )}
              </View>

              {totalSpent === 0 ? (
                <Text style={s.hintCenter}>No spending this month yet.</Text>
              ) : (
                <>
                  <View style={s.donutContainer}>
                    <View style={s.donutWrapper}>
                      <Svg width={donutSize} height={donutSize}>
                        <Circle
                          cx={centerPoint}
                          cy={centerPoint}
                          r={donutRadius}
                          stroke={isDark ? "rgba(255,255,255,0.03)" : "rgba(16,185,129,0.06)"}
                          strokeWidth={donutStrokeWidth - 4}
                          fill="none"
                        />
                        {(() => {
                          let accumulatedPct = 0;
                          return catBreakdown.map((cat) => {
                            const pct = cat.amount / totalSpent;
                            const strokeLength = pct * donutCircumference;
                            // Add spacing between slices for a cleaner design
                            const gapSize = catBreakdown.length > 1 ? 5 : 0;
                            const renderStrokeLength = Math.max(strokeLength - gapSize, 1.5);
                            const offset = -(accumulatedPct * donutCircumference);
                            accumulatedPct += pct;

                            const isSelected = selectedCatKey === cat.key;
                            return (
                              <Circle
                                key={cat.key}
                                cx={centerPoint}
                                cy={centerPoint}
                                r={donutRadius}
                                stroke={cat.color}
                                strokeWidth={isSelected ? donutSelectedStrokeWidth : donutStrokeWidth}
                                fill="none"
                                strokeDasharray={`${renderStrokeLength} ${donutCircumference - renderStrokeLength}`}
                                strokeDashoffset={offset}
                                rotation={-90}
                                originX={centerPoint}
                                originY={centerPoint}
                                opacity={selectedCatKey === null || isSelected ? 1 : 0.35}
                                onPress={async () => {
                                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setSelectedCatKey(selectedCatKey === cat.key ? null : cat.key);
                                }}
                              />
                            );
                          });
                        })()}
                      </Svg>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={async () => {
                          if (selectedCatKey !== null) {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedCatKey(null);
                          }
                        }}
                        style={s.donutCenterTextContainer}
                      >
                        {selectedCatKey === null ? (
                          <>
                            <Text style={s.centerLabel}>Total Spent</Text>
                            <Text style={s.centerValue} numberOfLines={1} adjustsFontSizeToFit>
                              {currency}{fmt(totalSpent)}
                            </Text>
                            <Text style={s.centerSub}>{currentExps.length} items</Text>
                          </>
                        ) : (
                          (() => {
                            const selectedCat = catBreakdown.find((c) => c.key === selectedCatKey);
                            if (!selectedCat) return null;
                            const pctVal = Math.round((selectedCat.amount / totalSpent) * 100);
                            return (
                              <>
                                <Text style={[s.centerLabel, { color: selectedCat.color }]}>
                                  {selectedCat.label}
                                </Text>
                                <Text style={s.centerValue} numberOfLines={1} adjustsFontSizeToFit>
                                  {currency}{fmt(selectedCat.amount)}
                                </Text>
                                <Text style={s.centerSub}>{pctVal}% of total</Text>
                              </>
                            );
                          })()
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={s.legendWrap}>
                    {catBreakdown.map((cat) => {
                      const isSelected = selectedCatKey === cat.key;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          activeOpacity={0.7}
                          style={[
                            s.legendItem,
                            isSelected && s.legendItemActive,
                            selectedCatKey !== null && !isSelected && { opacity: 0.5 },
                          ]}
                          onPress={async () => {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedCatKey(selectedCatKey === cat.key ? null : cat.key);
                          }}
                        >
                          <View style={[s.legendDot, { backgroundColor: cat.color }]} />
                          <Text style={s.legendText} numberOfLines={1}>
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={s.catList}>
                    {catBreakdown.map((cat) => {
                      const pct = (cat.amount / totalSpent) * 100;
                      const isSelected = selectedCatKey === cat.key;
                      const isAnySelected = selectedCatKey !== null;
                      return (
                        <TouchableOpacity
                          key={cat.key}
                          activeOpacity={0.85}
                          onPress={async () => {
                            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedCatKey(selectedCatKey === cat.key ? null : cat.key);
                          }}
                          style={[
                            s.catRowContainer,
                            isSelected && s.catRowSelected,
                            isAnySelected && !isSelected && { opacity: 0.35 },
                          ]}
                        >
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
                               {currency}{fmt(cat.amount)}
                              </Text>
                              <Text style={s.catPct}>{Math.round(pct)}%</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {/* Budget Status */}
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
                        {currency}{fmt(b.spent)} spent · {currency}{fmt(Math.max(b.limit - b.spent, 0))} left
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
                <Ionicons name="wallet-outline" size={22} color={colors.primary} />
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

export default function InsightsScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <InsightsScreen />
    </ErrorBoundary>
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
      marginBottom: 14,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 20,
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
      fontSize: 17,
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
      alignItems: "flex-start",
      marginBottom: 4,
    },
    link: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    // Donut Styles
    donutContainer: {
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 18,
    },
    donutWrapper: {
      width: 150,
      height: 150,
      alignItems: "center",
      justifyContent: "center",
    },
    donutCenterTextContainer: {
      position: "absolute",
      width: 90,
      height: 90,
      borderRadius: 45,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    centerLabel: {
      fontSize: 9,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      textAlign: "center",
    },
    centerValue: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginVertical: 2,
      textAlign: "center",
      width: 80,
    },
    centerSub: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    // Legend Styles
    legendWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 6,
      marginTop: 6,
      marginBottom: 14,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
    },
    legendItemActive: {
      backgroundColor: isDark ? "rgba(16,185,129,0.15)" : "#e6f7f0",
      borderColor: colors.primary,
    },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      maxWidth: 80,
    },
    // Cat list rows
    catList: {
      marginTop: 8,
      gap: 4,
    },
    catRowContainer: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: "transparent",
    },
    catRowSelected: {
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
    },
    catRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    catRow: {
      flexDirection: "row",
      alignItems: "center",
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
      fontSize: 14,
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
      fontSize: 14,
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
      marginTop: 14,
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

    // Health Card Styles
    healthCard: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 20,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: isDark ? "transparent" : "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 3,
    },
    healthHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    healthIconBg: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ecfdf5",
      alignItems: "center",
      justifyContent: "center",
    },
    healthTitleContainer: {
      flex: 1,
      marginLeft: 12,
    },
    healthTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    healthSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    scoreBadge: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#18261e" : "#e8f1ea",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    scoreLabel: {
      fontSize: 8,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
    },
    scoreValue: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
      marginTop: 1,
    },
    healthDetailsRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      marginBottom: 16,
    },
    healthProgressContainer: {
      width: 70,
      height: 70,
      alignItems: "center",
      justifyContent: "center",
    },
    healthProgressCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
    },
    healthProgressText: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    healthStatusHeading: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    healthDescription: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 16,
    },
    burnRateContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 16,
    },
    burnRateItem: {
      flex: 1,
      alignItems: "center",
    },
    burnRateLabel: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 4,
    },
    burnRateValue: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    dividerVertical: {
      width: StyleSheet.hairlineWidth,
      height: 24,
      backgroundColor: colors.border,
    },
  });
}
