import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Alert,
  KeyboardAvoidingView,
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
import { useApp, ExpenseCategory } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import {
  ReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  loadReminderSettings,
  applyReminderSettings,
  requestNotificationPermissions,
  isNotificationsSupported,
} from "@/hooks/useNotifications";

const CATEGORIES: { key: ExpenseCategory; label: string; icon: string; color: string }[] = [
  { key: "travel",        label: "Travel",        icon: "airplane",                   color: "#3b82f6" },
  { key: "food",          label: "Food",          icon: "restaurant",                 color: "#f97316" },
  { key: "shopping",      label: "Shopping",      icon: "bag-handle",                 color: "#a855f7" },
  { key: "entertainment", label: "Entertainment", icon: "game-controller",            color: "#ec4899" },
  { key: "healthcare",    label: "Health",         icon: "heart",                     color: "#ef4444" },
  { key: "others",        label: "Others",         icon: "ellipsis-horizontal-circle", color: "#6b7280" },
];

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    profile,
    setProfile,
    budgetLimits,
    setBudgetLimit,
    customCategories,
    deleteCustomCategory,
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Personal Info States
  const [name, setName] = useState(profile?.name ?? "");
  const [salary, setSalary] = useState(profile?.salary?.toString() ?? "");
  const [email, setEmail] = useState("");
  const [loadingLogout, setLoadingLogout] = useState(false);

  // Category Budgets States
  const [limits, setLimits] = useState<Record<string, string>>({});

  // Reminder Settings States
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [showTimePicker, setShowTimePicker] = useState<number | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);

  // Combine builtin categories and custom categories
  const allCategories = useMemo(() => {
    const builtin = CATEGORIES.map((c) => ({
      key: c.key as string,
      label: c.label,
      icon: c.icon,
      color: c.color,
    }));
    const custom = (customCategories || []).map((c) => ({
      key: c.id,
      label: c.name,
      icon: c.icon,
      color: c.color,
    }));
    return [...builtin, ...custom];
  }, [customCategories]);

  // Sync state data on mount/changes
  useEffect(() => {
    setName(profile?.name ?? "");
    setSalary(profile?.salary?.toString() ?? "");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) setEmail(data.session.user.email);
    });
  }, [profile]);

  useEffect(() => {
    loadReminderSettings().then(setReminders);
  }, []);

  useEffect(() => {
    const nextLimits: Record<string, string> = {};
    allCategories.forEach((cat) => {
      nextLimits[cat.key] = budgetLimits[cat.key]?.toString() ?? "";
    });
    setLimits(nextLimits);
  }, [allCategories, budgetLimits]);

  // --- Handlers ---
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter your name.");
      return;
    }
    const sal = parseFloat(salary);
    if (!salary || isNaN(sal) || sal <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid monthly budget.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setProfile({ name: name.trim(), salary: sal, currency: "₹" });
    Alert.alert("Saved", "Profile updated successfully.");
  };

  const handleSaveBudgets = async () => {
    await Promise.all(
      allCategories.map(async (cat) => {
        const val = parseFloat(limits[cat.key] ?? "");
        await setBudgetLimit(cat.key, isNaN(val) || val < 0 ? 0 : val);
      })
    );
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", "Budget limits updated.");
  };

  const updateReminderTime = (index: number, date: Date) => {
    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const newTimes = [...reminders.times];
    newTimes[index] = `${hh}:${mm}`;
    setReminders(prev => ({ ...prev, times: newTimes }));
  };

  const handleSaveReminders = async () => {
    setReminderSaving(true);
    try {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Please enable notifications for Spendly in your device Settings to receive expense reminders.',
          [{ text: 'OK' }]
        );
        setReminderSaving(false);
        return;
      }
      await applyReminderSettings(reminders);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const times = reminders.times.slice(0, reminders.count);
      const timeStr = times.map(t => {
        const [h, m] = t.split(':').map(Number);
        const d = new Date(); d.setHours(h, m);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      }).join(' & ');
      Alert.alert(
        reminders.enabled ? '✅ Reminders Set!' : '🔕 Reminders Disabled',
        reminders.enabled
          ? `You'll be reminded daily at ${timeStr}.`
          : 'You won\'t receive expense reminders.',
        [{ text: 'Great!' }]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to save reminder settings. Please try again.');
    } finally {
      setReminderSaving(false);
    }
  };

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await deleteCustomCategory(id);
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setLoadingLogout(true);
          await supabase.auth.signOut();
          router.replace("/welcome");
        },
      },
    ]);
  };

  const s = profileStyles(colors, topPad, bottomPad);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.primary + "dd"]}
        style={[s.header, { paddingTop: topPad + 14 }]}
      >
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
          <View style={s.backBtnInner}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Text style={s.headerTitle}>Profile & Settings</Text>
        <Text style={s.headerSub}>Manage your account preferences</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Card */}
        <Text style={s.sectionLabel}>👤 Personal Profile</Text>
        <View style={s.card}>
          {email ? (
            <View style={s.emailRow}>
              <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
              <Text style={s.emailText}>{email}</Text>
            </View>
          ) : null}

          <Text style={s.fieldLabel}>Your Name</Text>
          <View style={s.inputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              testID="input-profile-name"
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>

          <Text style={[s.fieldLabel, { marginTop: 16 }]}>Monthly Budget / Salary</Text>
          <View style={s.inputWrap}>
            <Text style={[s.rupee, { color: colors.mutedForeground }]}>₹</Text>
            <TextInput
              testID="input-profile-salary"
              style={[s.input, { fontSize: 17, fontFamily: "Inter_600SemiBold" }]}
              value={salary}
              onChangeText={setSalary}
              placeholder="50000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            testID="button-save-profile"
            onPress={handleSaveProfile}
            style={s.saveBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.saveBtnText}>Save Details</Text>
          </TouchableOpacity>
        </View>

        {/* Budget Limits Section */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>💰 Category Budgets</Text>
        <Text style={s.sectionHint}>
          Set a monthly spending cap per category. Leave blank for no limit.
        </Text>
        <View style={s.card}>
          {allCategories.map((cat, i) => (
            <View key={cat.key} style={[s.budgetRow, i > 0 && s.budgetDivider]}>
              <View style={[s.catIcon, { backgroundColor: cat.color + "18" }]}>
                <Ionicons name={cat.icon as "home"} size={17} color={cat.color} />
              </View>
              <Text style={s.catLabel}>{cat.label}</Text>
              <View style={s.limitInputWrap}>
                <Text style={s.rupeeSmall}>₹</Text>
                <TextInput
                  testID={`input-budget-${cat.key}`}
                  style={s.limitInput}
                  value={limits[cat.key] ?? ""}
                  onChangeText={(v) => setLimits((prev) => ({ ...prev, [cat.key]: v }))}
                  placeholder="—"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                />
              </View>
            </View>
          ))}

          <TouchableOpacity
            testID="button-save-budgets"
            onPress={handleSaveBudgets}
            style={s.saveBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.saveBtnText}>Save Budgets</Text>
          </TouchableOpacity>
        </View>

        {/* Custom Categories Section */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>🏷️ Custom Categories</Text>
        <Text style={s.sectionHint}>
          Create personalized tags for expenses.
        </Text>
        <View style={s.card}>
          {customCategories.length === 0 ? (
            <View style={s.emptyCategories}>
              <Text style={s.emptyCategoriesText}>No custom categories yet.</Text>
            </View>
          ) : (
            customCategories.map((cat, i) => (
              <View key={cat.id} style={[s.categoryRow, i > 0 && s.categoryDivider]}>
                <View style={[s.catIcon, { backgroundColor: cat.color + "18" }]}>
                  <Ionicons name={cat.icon as any} size={17} color={cat.color} />
                </View>
                <Text style={s.catLabel}>{cat.name}</Text>
                <TouchableOpacity
                  onPress={() => handleDeleteCategory(cat.id, cat.name)}
                  style={s.deleteIconBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            testID="button-profile-add-category"
            onPress={() => router.push("/add-category")}
            style={s.addCategoryBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={s.addCategoryBtnText}>Add Category</Text>
          </TouchableOpacity>
        </View>

        {/* Reminders Section */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>🔔 Expense Reminders</Text>
        <Text style={s.sectionHint}>
          Get daily nudges to log your expenses. Never forget a transaction.
        </Text>
        <View style={s.card}>
          {!isNotificationsSupported && (
            <View style={s.unsupportedWarning}>
              <Ionicons name="warning-outline" size={16} color={colors.background === '#f4faf6' ? '#c2410c' : '#ea580c'} />
              <Text style={s.unsupportedWarningText}>
                Notifications are unavailable. Please run on native android/ios devices to enable reminders.
              </Text>
            </View>
          )}
          {/* Enable Toggle */}
          <View style={s.reminderToggleRow}>
            <View style={s.reminderToggleLeft}>
              <View style={[s.reminderIcon, { backgroundColor: reminders.enabled ? colors.primary + "18" : colors.muted }]}>
                <Ionicons
                  name={reminders.enabled ? 'notifications' : 'notifications-off-outline'}
                  size={18}
                  color={reminders.enabled ? colors.primary : colors.mutedForeground}
                />
              </View>
              <View>
                <Text style={s.reminderToggleLabel}>Enable Reminders</Text>
                <Text style={s.reminderToggleSub}>
                  {reminders.enabled ? 'Active — reminders are on' : 'Tap to turn on reminders'}
                </Text>
              </View>
            </View>
            <Switch
              value={reminders.enabled}
              onValueChange={v => setReminders(prev => ({ ...prev, enabled: v }))}
              trackColor={{ false: colors.border, true: colors.primary + "60" }}
              thumbColor={reminders.enabled ? colors.primary : colors.mutedForeground}
            />
          </View>

          {reminders.enabled && (
            <>
              <View style={s.reminderDivider} />

              {/* Times per day selector */}
              <Text style={s.reminderSubLabel}>How many times per day?</Text>
              <View style={s.countRow}>
                {([1, 2, 3] as const).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      s.countChip,
                      reminders.count === n && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => {
                      setReminders(prev => ({ ...prev, count: n }));
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.countChipText, reminders.count === n && { color: '#fff' }]}>
                      {n === 1 ? 'Once' : n === 2 ? 'Twice' : '3×'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Time pickers */}
              {Array.from({ length: reminders.count }).map((_, i) => {
                const timeStr = reminders.times[i] ?? '09:00';
                const [h, m] = timeStr.split(':').map(Number);
                const timeDate = new Date(); timeDate.setHours(h, m, 0, 0);
                const label = i === 0 ? 'First reminder' : i === 1 ? 'Second reminder' : 'Third reminder';
                return (
                  <View key={i}>
                    <View style={s.timeRow}>
                      <Text style={s.timeLabel}>{label}</Text>
                      <TouchableOpacity
                        style={s.timeBtn}
                        onPress={() => setShowTimePicker(showTimePicker === i ? null : i)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="time-outline" size={15} color={colors.primary} />
                        <Text style={s.timeBtnText}>
                          {timeDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    {showTimePicker === i && (
                      <DateTimePicker
                        value={timeDate}
                        mode="time"
                        is24Hour={false}
                        display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                        onChange={(_, date) => {
                          if (date) updateReminderTime(i, date);
                          if (Platform.OS === 'android') setShowTimePicker(null);
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, { marginTop: 16, opacity: reminderSaving ? 0.7 : 1 }]}
            onPress={handleSaveReminders}
            activeOpacity={0.85}
            disabled={reminderSaving}
          >
            <Ionicons name="alarm-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={s.saveBtnText}>
              {reminderSaving ? 'Saving…' : 'Save Reminders'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
        </View>
        <TouchableOpacity
          testID="button-profile-logout"
          onPress={handleLogout}
          style={s.logoutBtn}
          activeOpacity={0.7}
          disabled={loadingLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const profileStyles = (
  colors: ReturnType<typeof useColors>,
  topPad: number,
  bottomPad: number
) =>
  StyleSheet.create({
    header: {
      paddingBottom: 24,
      paddingHorizontal: 22,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    backBtn: { marginBottom: 14 },
    backBtnInner: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff" },
    headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", marginTop: 4 },
    scroll: { padding: 18, paddingTop: 22 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: 9,
    },
    sectionHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 10,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.primary + "08",
      borderRadius: 10,
    },
    emailText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    fieldLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 50,
      backgroundColor: colors.background,
    },
    input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    rupee: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginRight: 8 },
    saveBtn: {
      marginTop: 18,
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    saveBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
    emptyCategories: {
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCategoriesText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    categoryRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },
    categoryDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    catLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, marginLeft: 12 },
    deleteIconBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.destructive + "10",
    },
    addCategoryBtn: {
      marginTop: 14,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: colors.primary + "60",
      borderRadius: 12,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "06",
    },
    addCategoryBtnText: { color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.destructive + "30",
      backgroundColor: colors.destructive + "08",
    },
    logoutText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.destructive,
    },
    budgetRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
    },
    budgetDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    limitInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 8,
      height: 36,
      backgroundColor: colors.background,
      width: 100,
    },
    rupeeSmall: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginRight: 4,
    },
    limitInput: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      padding: 0,
    },
    unsupportedWarning: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: "#fff7ed",
      borderColor: "#ffedd5",
      borderWidth: 1,
      padding: 12,
      borderRadius: 10,
      marginBottom: 14,
    },
    unsupportedWarningText: {
      flex: 1,
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: "#c2410c",
      lineHeight: 15,
    },
    reminderToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    reminderToggleLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
      marginRight: 10,
    },
    reminderIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    reminderToggleLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    reminderToggleSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    reminderDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 14,
    },
    reminderSubLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    countRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    countChip: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.background,
      borderRadius: 10,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    countChipText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
    },
    timeLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    timeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.primary + "30",
      backgroundColor: colors.primary + "0c",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
    },
    timeBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
  });
