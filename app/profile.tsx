import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
  Share,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, ExpenseCategory } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { BUILTIN_CATEGORIES } from "@/constants/categories";
import { InlineError } from "@/components/InlineError";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const CATEGORIES = BUILTIN_CATEGORIES;

function ProfileScreen() {
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
    restoreBackup,
    expenses,
    splitGroups,
    clearAllData,
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Personal Info States
  const [name, setName] = useState(profile?.name ?? "");
  const [salary, setSalary] = useState(profile?.salary?.toString() ?? "");
  const [nameError, setNameError] = useState("");
  const [salaryError, setSalaryError] = useState("");

  // Category Budgets States
  const [limits, setLimits] = useState<Record<string, string>>({});

  // Ad Settings State
  const [adFreeMode, setAdFreeMode] = useState(false);

  // Load ad preferences on mount
  useEffect(() => {
    const loadAdPreferences = async () => {
      try {
        const settingsStr = await AsyncStorage.getItem("@spendly_ad_settings");
        if (settingsStr) {
          const settings = JSON.parse(settingsStr);
          if (settings.hasOwnProperty("adFreeMode")) setAdFreeMode(settings.adFreeMode);
        }
      } catch (e) {
        console.warn("Failed to load ad preferences:", e);
      }
    };
    loadAdPreferences();
  }, []);

  const handleToggleAdFree = async (val: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAdFreeMode(val);
    try {
      const nextSettings = { adFreeMode: val };
      await AsyncStorage.setItem("@spendly_ad_settings", JSON.stringify(nextSettings));
    } catch (e) {
      console.warn("Failed to save ad settings:", e);
    }
  };

  const [restoreModalVisible, setRestoreModalVisible] = useState(false);

  const handleClearAllData = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {}
    Alert.alert(
      "Clear All Data",
      "Are you absolutely sure you want to delete all settings, transaction history, custom categories, and group split data? This action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This will permanently delete all your data off this device. Confirm delete?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Clear All Data",
                  style: "destructive",
                  onPress: async () => {
                    await clearAllData();
                    try {
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch {}
                    Alert.alert("Data Cleared", "All data has been successfully cleared.", [
                      {
                        text: "OK",
                        onPress: () => {
                          router.replace("/onboarding");
                        },
                      },
                    ]);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };
  const [restoreText, setRestoreText] = useState("");

  const handleExportCSV = async () => {
    if (expenses.length === 0) {
      Alert.alert("No Data", "There are no expenses to export.");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const headers = ["Date", "Category", "Description", "Amount (INR)"];
      const rows = expenses.map(e => {
        const cat = CATEGORIES.find(c => c.key === e.category);
        const catLabel = cat ? cat.label : (customCategories.find(c => c.id === e.category)?.name || "Others");
        const desc = e.description || "";
        const cleanDesc = desc.replace(/"/g, '""');
        return `"${e.date}","${catLabel}","${cleanDesc}",${e.amount}`;
      });
      const csvStr = [headers.join(","), ...rows].join("\n");
      await Share.share({
        message: csvStr,
        title: "Spendly Transactions Export",
      });
    } catch (e: any) {
      Alert.alert("Export Failed", e.message || "Could not export CSV");
    }
  };

  const handleExportJSON = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const backupData = {
        spendly_backup_version: 1,
        user_profile: profile,
        expenses,
        split_groups: splitGroups,
        budget_limits: budgetLimits,
        custom_categories: customCategories,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      await Share.share({
        message: jsonStr,
        title: "Spendly JSON Backup",
      });
    } catch (e: any) {
      Alert.alert("Backup Failed", e.message || "Could not export JSON backup");
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreText.trim()) {
      Alert.alert("Empty input", "Please paste your backup JSON text.");
      return;
    }

    Alert.alert(
      "Confirm Restore",
      "Restoring a backup will overwrite all existing data. This action cannot be undone. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            try {
              await restoreBackup(restoreText.trim());
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", "Backup data restored successfully!");
              setRestoreModalVisible(false);
              setRestoreText("");
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to restore backup. Make sure it's valid JSON.");
            }
          },
        },
      ]
    );
  };

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
  }, [profile]);

  useEffect(() => {
    const nextLimits: Record<string, string> = {};
    allCategories.forEach((cat) => {
      nextLimits[cat.key] = budgetLimits[cat.key]?.toString() ?? "";
    });
    setLimits(nextLimits);
  }, [allCategories, budgetLimits]);

  // --- Handlers ---
  const handleSaveProfile = async () => {
    let hasError = false;
    if (!name.trim()) {
      setNameError("Please enter your name.");
      hasError = true;
    }
    const sal = parseFloat(salary);
    if (!salary || isNaN(sal) || sal <= 0) {
      setSalaryError("Please enter a valid amount.");
      hasError = true;
    }
    if (hasError) return;
    setNameError("");
    setSalaryError("");
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

  const handleDeleteCategory = (id: string, name: string) => {
    Alert.alert(
      "Delete Category",
      `Are you sure you want to delete "${name}"? Expenses in this category will default to "Others".`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await deleteCustomCategory(id);
          },
        },
      ]
    );
  };


  const isDark = colors.background !== "#f4faf6";
  const gradientColors = isDark 
    ? ["#0b1610", "#080c09", "#080c09"] 
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];

  const s = profileStyles(colors, topPad, bottomPad);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Header */}
      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.35, 1]}
        style={[s.header, { paddingTop: topPad + 14 }]}
      >
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
          <View style={s.backBtnInner}>
            <Ionicons name="arrow-back" size={22} color={isDark ? "#fff" : colors.foreground} />
          </View>
          <InlineError message={nameError} visible={!!nameError} />
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
          <Text style={s.fieldLabel}>Your Name</Text>
          <View style={s.inputWrap}>
            <Ionicons name="person-outline" size={18} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              testID="input-profile-name"
              style={s.input}
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(""); }}
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
              onChangeText={(t) => { setSalary(t); if (salaryError) setSalaryError(""); }}
              placeholder="50000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>
          <InlineError message={salaryError} visible={!!salaryError} />

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
          Manage categories tailored to your lifestyle.
        </Text>
        <View style={s.card}>
          {customCategories.length === 0 ? (
            <View style={s.emptyCustomCats}>
              <Ionicons name="pricetag-outline" size={24} color={colors.mutedForeground} style={{ marginBottom: 6 }} />
              <Text style={s.emptyCustomCatsText}>No custom categories yet</Text>
              <Text style={s.emptyCustomCatsSub}>Create categories tailored to your lifestyle—like 'Gym' or 'Pet Care' in the Home screen.</Text>
            </View>
          ) : (
            customCategories.map((cat, i) => (
              <View key={cat.id} style={[s.customCatRow, i > 0 && s.budgetDivider]}>
                <View style={[s.catIcon, { backgroundColor: cat.color + "18" }]}>
                  <Ionicons name={cat.icon as "home"} size={17} color={cat.color} />
                </View>
                <Text style={s.catLabel}>{cat.name}</Text>
                <TouchableOpacity
                  onPress={() => handleDeleteCategory(cat.id, cat.name)}
                  style={s.trashBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Preferences Section */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>⚙️ Preferences</Text>
        <Text style={s.sectionHint}>
          Customize your application experience.
        </Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.toggleLabel}>Ad-Free Mode</Text>
              <Text style={s.toggleSub}>Hide all banner, interstitial, and sponsored ad placements</Text>
            </View>
            <Switch
              testID="switch-ad-free"
              value={adFreeMode}
              onValueChange={handleToggleAdFree}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? (adFreeMode ? colors.primary : "#f4f3f4") : undefined}
            />
          </View>
        </View>

        {/* Data Portability Section */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>💾 Data Portability</Text>
        <Text style={s.sectionHint}>
          Export or restore your transaction ledger and settings.
        </Text>
        <View style={s.card}>
          <View style={s.actionRow}>
            <TouchableOpacity
              testID="button-export-csv"
              style={s.actionBtn}
              onPress={handleExportCSV}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: "#10b98118" }]}>
                <Ionicons name="document-text-outline" size={20} color="#10b981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Export Transactions (CSV)</Text>
                <Text style={s.actionSub}>Share or save personal transactions as CSV</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[s.actionRow, s.budgetDivider]}>
            <TouchableOpacity
              testID="button-export-json"
              style={s.actionBtn}
              onPress={handleExportJSON}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Backup Data (JSON)</Text>
                <Text style={s.actionSub}>Export full app state for backup</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[s.actionRow, s.budgetDivider]}>
            <TouchableOpacity
              testID="button-restore-json"
              style={s.actionBtn}
              onPress={() => setRestoreModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: `${colors.destructive}18` }]}>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.destructive} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Restore Backup</Text>
                <Text style={s.actionSub}>Restore full app state from a backup string</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[s.actionRow, s.budgetDivider]}>
            <TouchableOpacity
              testID="button-clear-all-data"
              style={s.actionBtn}
              onPress={handleClearAllData}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: `${colors.destructive}18` }]}>
                <Ionicons name="trash-outline" size={20} color={colors.destructive} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: colors.destructive }]}>Clear All Data</Text>
                <Text style={s.actionSub}>Reset all settings and delete all data permanently</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Restore Backup Modal */}
      <Modal
        visible={restoreModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRestoreModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.restoreModalContainer}
        >
          <View style={s.restoreCard}>
            <View style={s.restoreHeader}>
              <Text style={s.restoreTitle}>Restore Backup</Text>
              <TouchableOpacity onPress={() => setRestoreModalVisible(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text style={s.restoreHint}>
              Paste your Spendly JSON backup data below. It will replace your current expenses, profile, and categories.
            </Text>

            <TextInput
              testID="input-restore-json"
              style={s.restoreInput}
              multiline
              value={restoreText}
              onChangeText={setRestoreText}
              placeholder='{"spendly_backup_version": 1, ...}'
              placeholderTextColor={colors.mutedForeground}
              textAlignVertical="top"
            />

            <TouchableOpacity
              testID="button-confirm-restore"
              onPress={handleRestoreBackup}
              style={[s.saveBtn, { backgroundColor: colors.destructive, marginTop: 16 }]}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={s.saveBtnText}>Restore Now</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const profileStyles = (
  colors: ReturnType<typeof useColors>,
  topPad: number,
  bottomPad: number
) => {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    header: {
      paddingBottom: 24,
      paddingHorizontal: 22,
      borderBottomLeftRadius: isDark ? 28 : 0,
      borderBottomRightRadius: isDark ? 28 : 0,
    },
    backBtn: { marginBottom: 14 },
    backBtnInner: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: isDark ? "#fff" : colors.foreground },
    headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: isDark ? "rgba(255,255,255,0.65)" : colors.mutedForeground, marginTop: 4 },
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
    catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    catLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, marginLeft: 12 },
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
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    toggleLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    toggleSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    emptyCustomCats: {
      paddingVertical: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyCustomCatsText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    emptyCustomCatsSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      textAlign: "center",
      lineHeight: 18,
      paddingHorizontal: 12,
    },
    customCatRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      justifyContent: "space-between",
    },
    trashBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.destructive + "12",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: "auto",
    },
    actionRow: {
      paddingVertical: 12,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    actionTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    actionSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    restoreModalContainer: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    restoreCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: "80%",
    },
    restoreHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    restoreTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    closeBtn: {
      padding: 4,
    },
    restoreHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      marginBottom: 16,
    },
    restoreInput: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      height: 150,
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      fontSize: 12,
    },
  });
};

export default function ProfileScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <ProfileScreen />
    </ErrorBoundary>
  );
}