import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMemo, useCallback } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useThemePreference } from "@/hooks/useThemePreference";
import { SUPABASE_ENABLED } from "@/lib/config";
import { AnimatedProgressBar } from "@/components/AnimatedProgressBar";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

function ProfileTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode: theme, setThemeMode } = useThemePreference();
  const cycleTheme = useCallback(() => {
    if (theme === "system") setThemeMode("light");
    else if (theme === "light") setThemeMode("dark");
    else setThemeMode("system");
  }, [theme, setThemeMode]);
  const { profile, expenses, splitGroups, getCurrentMonthTotal, getSpentByCategory } = useApp();

  const themeIcon = theme === "dark" ? "moon" : theme === "light" ? "sunny" : "phone-portrait-outline";
  const themeLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";

  const monthTotal = getCurrentMonthTotal();
  const groupCount = splitGroups.length;
  const budgetLimit = profile?.salary ?? 0;
  const remaining = budgetLimit > 0 ? Math.max(budgetLimit - monthTotal, 0) : 0;
  const budgetPct = budgetLimit > 0 ? Math.min(100, Math.round((monthTotal / budgetLimit) * 100)) : 0;

  const stats = useMemo(() => [
    { label: "Spent", value: `₹${fmt(monthTotal)}`, icon: "wallet-outline", color: colors.primary },
    { label: "Groups", value: `${groupCount}`, icon: "people-outline", color: colors.secondary },
    { label: "Remaining", value: budgetLimit > 0 ? `₹${fmt(remaining)}` : "—", icon: "layers-outline", color: remaining > 0 ? "#10b981" : colors.destructive },
  ], [monthTotal, groupCount, remaining, budgetLimit, colors]);

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={s.header}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Profile</Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/profile");
          }}
          style={[s.settingsBtn, { backgroundColor: colors.primary + "12" }]}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={18} color={colors.primary} />
          <Text style={[s.settingsLabel, { color: colors.primary }]}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Greeting */}
        <View style={s.greetingBlock}>
          <Text style={[s.greeting, { color: colors.foreground }]}>
            {profile?.name ? `Hi, ${profile.name} 👋` : "Welcome! 👋"}
          </Text>
          <Text style={[s.greetingSub, { color: colors.mutedForeground }]}>
            {profile?.name ? "Your financial overview" : "Tap Settings to set up your profile"}
          </Text>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.statIconBox, { backgroundColor: stat.color + "15" }]}>
                <Ionicons name={stat.icon as any} size={16} color={stat.color} />
              </View>
              <Text style={[s.statValue, { color: colors.foreground }]}>{stat.value}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Budget bar */}
        {budgetLimit > 0 && (
          <View style={[s.budgetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.budgetHeader}>
              <Text style={[s.budgetTitle, { color: colors.foreground }]}>Monthly Budget</Text>
              <Text style={[s.budgetPct, { color: budgetPct > 80 ? colors.destructive : colors.primary }]}>
                {budgetPct}%
              </Text>
            </View>
            <View style={[s.budgetTrack, { backgroundColor: colors.border }]}>
              <AnimatedProgressBar
                progress={budgetPct}
                color={budgetPct > 80 ? colors.destructive : colors.primary}
                trackColor="transparent"
                height={8}
              />
            </View>
            <Text style={[s.budgetSub, { color: colors.mutedForeground }]}>
              ₹{fmt(monthTotal)} of ₹{fmt(budgetLimit)}
            </Text>
          </View>
        )}

        {/* Quick links */}
        <View style={s.linksSection}>
          <QuickLink
            icon="download-outline"
            label="Export Data"
            subtitle="Backup your expenses"
            color={colors.primary}
            onPress={() => router.push("/profile")}
          />
          <QuickLink
            icon="cloud-outline"
            label={SUPABASE_ENABLED ? "Cloud Sync Active" : "Cloud Sync"}
            subtitle={SUPABASE_ENABLED ? "Groups synced in real-time" : "Connect for group sync"}
            color={colors.secondary}
            onPress={() => router.push("/profile")}
          />
        </View>

        {/* Theme toggle */}
        <TouchableOpacity
          style={[s.themeRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            cycleTheme();
          }}
          activeOpacity={0.7}
        >
          <View style={s.themeLeft}>
            <Ionicons name={themeIcon as any} size={20} color={colors.primary} />
            <Text style={[s.themeLabel, { color: colors.foreground }]}>Appearance</Text>
          </View>
          <Text style={[s.themeValue, { color: colors.mutedForeground }]}>{themeLabel}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function QuickLink({
  icon,
  label,
  subtitle,
  color,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.linkCard, { backgroundColor: color + "08", borderColor: color + "18" }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon as any} size={22} color={color} />
      <View style={s.linkText}>
        <Text style={[s.linkLabel, { color: color }]}>{label}</Text>
        <Text style={[s.linkSub, { color: color + "aa" }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color + "88"} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  settingsLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 20, paddingBottom: 100 },
  greetingBlock: { marginBottom: 22 },
  greeting: { fontSize: 20, fontFamily: "Inter_700Bold" },
  greetingSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  budgetCard: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 22 },
  budgetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  budgetTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  budgetPct: { fontSize: 16, fontFamily: "Inter_700Bold" },
  budgetTrack: { height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  budgetFill: { height: "100%", borderRadius: 4 },
  budgetSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  linksSection: { gap: 10, marginBottom: 22 },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  linkText: { flex: 1 },
  linkLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  linkSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  themeLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  themeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  themeValue: { fontSize: 13, fontFamily: "Inter_500Medium" },
});

export default function ProfileTabScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <ProfileTabScreen />
    </ErrorBoundary>
  );
}
