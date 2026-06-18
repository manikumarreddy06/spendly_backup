import React, { useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";

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

interface BalanceCardProps {
  totalBalance: number;
  budgetLimit: number;
  spent: number;
  spentPct: number;
  spentPctRaw: number;
  isDark: boolean;
  primaryColor: string;
  primaryDarkColor: string;
  currency?: string;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

export const BalanceCard = React.forwardRef<View, BalanceCardProps>(
  ({ totalBalance, budgetLimit, spent, spentPct, spentPctRaw, isDark, primaryColor, primaryDarkColor, currency = "₹" }, ref) => {
    const [displayMode, setDisplayMode] = useState<"pct" | "spent" | "remaining">("pct");

    const handlePress = async () => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDisplayMode((prev) => {
        if (prev === "pct") return "spent";
        if (prev === "spent") return "remaining";
        return "pct";
      });
    };

    return (
      <View ref={ref} collapsable={false} style={{ marginBottom: 22 }}>
        <LinearGradient
          colors={[primaryColor, primaryDarkColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            s.balanceCard,
            {
              shadowColor: isDark ? "transparent" : primaryDarkColor,
            },
          ]}
          accessibilityLabel={`Total balance is ${currency}${fmt(totalBalance)}. ${
            budgetLimit > 0 ? `${spentPct}% of limit used` : ""
          }`}
          accessibilityRole="summary"
        >
          <View style={s.cardWave1} />
          <View style={s.cardWave2} />
          <View style={s.balanceRow}>
            <View style={s.balanceLeft}>
              <Text style={s.balLabel}>Total Balance</Text>
              <Text style={s.balAmount}>{currency}{fmt(totalBalance)}</Text>
              {budgetLimit > 0 && (
                <View style={s.vsBadge}>
                  <Text style={s.vsText}>
                    {currency}{fmt(spent)} spent · {spentPct}% of limit used
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePress}
              style={s.ringBox}
            >
              <CircularProgress pct={spentPct} size={88} />
              <View style={s.ringCenter}>
                {displayMode === "pct" && (
                  <>
                    <Text style={s.ringPct}>{spentPctRaw}%</Text>
                    <Text
                      style={s.ringLimit}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {budgetLimit > 0 ? `of ${currency}${fmt(budgetLimit)} limit` : "set salary in settings"}
                    </Text>
                  </>
                )}
                {displayMode === "spent" && (
                  <>
                    <Text style={[s.ringPct, { fontSize: 13 }]}>{currency}{fmt(spent)}</Text>
                    <Text
                      style={s.ringLimit}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      spent
                    </Text>
                  </>
                )}
                {displayMode === "remaining" && (
                  <>
                    <Text style={[s.ringPct, { fontSize: 12 }]}>{currency}{fmt(Math.max(budgetLimit - spent, 0))}</Text>
                    <Text
                      style={s.ringLimit}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      remaining
                    </Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }
);

BalanceCard.displayName = "BalanceCard";

const s = StyleSheet.create({
  balanceCard: {
    borderRadius: 28,
    padding: 22,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
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
});
