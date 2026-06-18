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
  Switch,
  Share,
  Modal,
  Linking,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, ExpenseCategory, useCurrency } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { BUILTIN_CATEGORIES } from "@/constants/categories";
import { SUPPORTED_CURRENCIES } from "@/constants/currencies";
import { InlineError } from "@/components/InlineError";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { exportFile, escapeCSVCell } from "@/lib/csvExporter";
import { exportPersonalExpensesPDF } from "@/lib/pdfExporter";
import { useIsFocused } from "@react-navigation/native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import {
  isNotificationAccessEnabled,
  openNotificationAccessSettings,
  setDetectionEnabled,
} from "@/lib/transactionDetection";

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
    restoreBackup,
    expenses,
    splitGroups,
    clearAllData,
    getSpentByCategory,
    detectionSettings,
    updateDetectionSettings,
  } = useApp();

  const isFocused = useIsFocused();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Smart Detection States & Helpers
  const [notifAccessGranted, setNotifAccessGranted] = useState(false);

  const checkNotificationAccess = async () => {
    if (Platform.OS === "android") {
      const isGranted = await isNotificationAccessEnabled();
      setNotifAccessGranted(isGranted);
    }
  };

  useEffect(() => {
    if (isFocused) {
      checkNotificationAccess();
    }
  }, [isFocused]);

  const handleToggleDetection = async (val: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    
    if (val) {
      const isGranted = await isNotificationAccessEnabled();
      if (!isGranted) {
        Alert.alert(
          "Notification Access Required",
          "Spendly needs permission to read notifications from your bank and UPI apps. Would you like to enable it now in system settings?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Enable Settings",
              onPress: () => {
                openNotificationAccessSettings();
              }
            }
          ]
        );
        return;
      }
    }

    await updateDetectionSettings({ enabled: val });
    await setDetectionEnabled(val);
  };

  const showTimePicker = () => {
    if (Platform.OS !== "android") return;
    
    const [hours, minutes] = (detectionSettings?.reviewReminderTime || "20:00").split(":").map(Number);
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);

    DateTimePickerAndroid.open({
      value: date,
      mode: "time",
      is24Hour: false,
      onChange: async (event, selectedDate) => {
        if (event.type === "set" && selectedDate) {
          const h = selectedDate.getHours().toString().padStart(2, "0");
          const m = selectedDate.getMinutes().toString().padStart(2, "0");
          const newTime = `${h}:${m}`;
          await updateDetectionSettings({ reviewReminderTime: newTime });
        }
      },
    });
  };

  const formatTime12h = (time24: string) => {
    const [hStr, mStr] = time24.split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return time24;
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    const displayM = m.toString().padStart(2, "0");
    return `${displayH}:${displayM} ${ampm}`;
  };

  // Personal Info States
  const [name, setName] = useState(profile?.name ?? "");
  const [salary, setSalary] = useState(profile?.salary?.toString() ?? "");
  const [nameError, setNameError] = useState("");
  const [salaryError, setSalaryError] = useState("");
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const currency = useCurrency();

  // Category Budgets States
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [budgetsExpanded, setBudgetsExpanded] = useState(false);

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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
                      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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

  const handleExportPDF = async () => {
    if (expenses.length === 0) {
      Alert.alert("No Data", "There are no expenses to export.");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await exportPersonalExpensesPDF(expenses, customCategories || [], profile?.name || "User", "Personal Expense Statement", currency);
    } catch (e: any) {
      Alert.alert("Export Failed", e.message || "Could not export PDF statement");
    }
  };

  const handleExportCSV = async () => {
    if (expenses.length === 0) {
      Alert.alert("No Data", "There are no expenses to export.");
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const currencyCode = SUPPORTED_CURRENCIES.find(c => c.symbol === currency)?.code || "INR";
      const headers = ["Date", "Category", "Description", `Amount (${currencyCode})`];
      const rows = expenses.map(e => {
        const cat = CATEGORIES.find(c => c.key === e.category);
        const catLabel = cat ? cat.label : (customCategories.find(c => c.id === e.category)?.name || "Others");
        const dateStr = `="${new Date(e.date).toISOString().split("T")[0]}"`;
        return `${escapeCSVCell(dateStr)},${escapeCSVCell(catLabel)},${escapeCSVCell(e.description || "")},${e.amount}`;
      });
      const csvStr = [headers.join(","), ...rows].join("\n");
      const dateStr = new Date().toISOString().split("T")[0];
      await exportFile({
        content: csvStr,
        filename: `spendly_expenses_all_${dateStr}.csv`,
        mimeType: "text/csv",
        dialogTitle: "Export Personal Expenses",
      });
    } catch (e: any) {
      Alert.alert("Export Failed", e.message || "Could not export CSV");
    }
  };

  const handleExportJSON = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      const dateStr = new Date().toISOString().split("T")[0];
      await exportFile({
        content: jsonStr,
        filename: `spendly_backup_${dateStr}.json`,
        mimeType: "application/json",
        dialogTitle: "Export JSON Backup",
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
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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

  // Sync state data on profile changes
  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setSalary(profile.salary?.toString() ?? "");
    }
  }, [profile]);

  useEffect(() => {
    const nextLimits: Record<string, string> = {};
    allCategories.forEach((cat) => {
      nextLimits[cat.key] = budgetLimits[cat.key]?.toString() ?? "";
    });
    setLimits(nextLimits);
  }, [allCategories, budgetLimits]);

  // --- Autosave Handlers ---
  const handleBlurName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      setTimeout(() => {
        setName(profile?.name ?? "");
        setNameError("");
      }, 1500);
      return;
    }
    setNameError("");
    if (trimmed !== profile?.name) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await setProfile({ name: trimmed, salary: profile?.salary ?? 0, currency: profile?.currency ?? "₹" });
      } catch (e) {
        console.warn("Failed to autosave name:", e);
      }
    }
  };

  const handleBlurSalary = async () => {
    const sal = parseFloat(salary);
    if (!salary || isNaN(sal) || sal <= 0) {
      setSalaryError("Enter a valid monthly budget.");
      setTimeout(() => {
        setSalary(profile?.salary?.toString() ?? "");
        setSalaryError("");
      }, 1500);
      return;
    }
    setSalaryError("");
    if (sal !== profile?.salary) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await setProfile({ name: profile?.name ?? "", salary: sal, currency: profile?.currency ?? "₹" });
      } catch (e) {
        console.warn("Failed to autosave monthly budget:", e);
      }
    }
  };

  const handleBlurCategoryLimit = async (key: string, valStr: string) => {
    const val = parseFloat(valStr);
    const resolvedVal = isNaN(val) || val < 0 ? 0 : val;
    const currentVal = budgetLimits[key] ?? 0;
    
    if (resolvedVal !== currentVal) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await setBudgetLimit(key, resolvedVal);
      } catch (e) {
        console.warn(`Failed to autosave budget for category ${key}:`, e);
      }
    }
  };

  const handleRateApp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const url = "https://play.google.com/store/apps/details?id=com.spendlyapp.personal";
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Error", "Could not open Play Store link.");
    }
  };

  const handleShareApp = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({
        message: "Check out Spendly! It's a premium, offline-first personal finance and group bill split tracker. Download it here: https://play.google.com/store/apps/details?id=com.spendlyapp.personal",
      });
    } catch (e) {
      console.warn("Failed to share app:", e);
    }
  };

  const isDark = colors.background !== "#f4faf6";
  const initial = (profile?.name || "U")[0].toUpperCase();
  const s = profileStyles(colors, topPad, bottomPad);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Sleek Navigation Bar */}
      <View style={[s.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Avatar Header */}
        <View style={s.avatarZone}>
          <View style={[s.avatarCircle, { backgroundColor: colors.primary + "15" }]}>
            <Text style={[s.avatarInitial, { color: colors.primary }]}>{initial}</Text>
          </View>
          <Text style={s.avatarName}>{profile?.name || "User"}</Text>
          <Text style={s.avatarBudget}>
            Monthly Budget: {currency}{Math.round(profile?.salary ?? 0).toLocaleString()}
          </Text>
        </View>

        {/* Group 1: Account Settings */}
        <Text style={s.groupLabel}>Account</Text>
        <View style={s.card}>
          <View style={s.inputRow}>
            <Ionicons name="person-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
            <Text style={s.rowLabel}>Name</Text>
            <TextInput
              testID="input-profile-name"
              style={s.rowInput}
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(""); }}
              onBlur={handleBlurName}
              placeholder="Your Name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
            />
          </View>
          
          <View style={s.divider} />

          <View style={s.inputRow}>
            <Ionicons name="wallet-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
            <Text style={s.rowLabel}>Monthly Budget</Text>
            <Text style={s.inputRupee}>{currency}</Text>
            <TextInput
              testID="input-profile-salary"
              style={[s.rowInput, s.salaryInput]}
              value={salary}
              onChangeText={(t) => { setSalary(t); if (salaryError) setSalaryError(""); }}
              onBlur={handleBlurSalary}
              placeholder="50000"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numeric"
            />
          </View>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-profile-currency"
            style={s.navRow}
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setCurrencyModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="cash-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Currency</Text>
            <Text style={[s.rowValue, { color: colors.mutedForeground, marginRight: 8 }]}>
              {SUPPORTED_CURRENCIES.find(c => c.symbol === currency)?.label ?? `(${currency})`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
        {nameError ? (
          <View style={s.errorMargin}>
            <InlineError message={nameError} visible={!!nameError} />
          </View>
        ) : null}
        {salaryError ? (
          <View style={s.errorMargin}>
            <InlineError message={salaryError} visible={!!salaryError} />
          </View>
        ) : null}

        {/* Group 2: Category Budgets */}
        <Text style={s.groupLabel}>Spending Caps</Text>
        <View style={s.card}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setBudgetsExpanded(!budgetsExpanded);
            }}
            style={s.collapsibleHeaderRow}
          >
            <Ionicons name="options-outline" size={18} color={colors.primary} style={s.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Category Budgets</Text>
              <Text style={s.rowSubLabel}>Configure caps for spending categories</Text>
            </View>
            <Ionicons
              name={budgetsExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>

          {budgetsExpanded && (
            <View style={s.collapsibleContent}>
              {allCategories.map((cat) => (
                <View key={cat.key}>
                  <View style={s.divider} />
                  <View style={s.budgetRow}>
                    <View style={[s.catIconBox, { backgroundColor: cat.color + "12" }]}>
                      <Ionicons name={cat.icon as any} size={15} color={cat.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.catLabelText}>{cat.label}</Text>
                      {(() => {
                        const spentAmt = getSpentByCategory(cat.key);
                        if (spentAmt > 0) {
                          return (
                            <Text style={s.catSpentText}>
                              {currency}{Math.round(spentAmt).toLocaleString()} spent this month
                            </Text>
                          );
                        }
                        return null;
                      })()}
                    </View>
                    <View style={s.rowLimitInputWrap}>
                      <Text style={s.limitRupee}>{currency}</Text>
                      <TextInput
                        testID={`input-budget-${cat.key}`}
                        style={s.limitInputText}
                        value={limits[cat.key] ?? ""}
                        onChangeText={(v) => setLimits((prev) => ({ ...prev, [cat.key]: v }))}
                        onBlur={() => handleBlurCategoryLimit(cat.key, limits[cat.key] ?? "")}
                        placeholder="—"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Group 3: Preferences */}
        <Text style={s.groupLabel}>Preferences</Text>
        <View style={s.card}>
          <View style={s.toggleRow}>
            <Ionicons name="eye-off-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Ad-Free Mode</Text>
              <Text style={s.rowSubLabel}>Hide banner ads and recommendation cards</Text>
            </View>
            <Switch
              testID="switch-ad-free"
              value={adFreeMode}
              onValueChange={handleToggleAdFree}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? (adFreeMode ? colors.primary : "#f4f3f4") : undefined}
            />
          </View>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-manage-recurring"
            style={s.navRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              router.push("/recurring-bills");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Recurring Bills</Text>
              <Text style={s.rowSubLabel}>Manage subscriptions & monthly bills</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Smart Detection Settings (Android Only) */}
        {Platform.OS === "android" && (
          <>
            <Text style={s.groupLabel}>Smart Detection</Text>
            <View style={s.card}>
              <View style={s.toggleRow}>
                <Ionicons name="scan-outline" size={18} color={colors.primary} style={s.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Auto-Detect Expenses</Text>
                  <Text style={s.rowSubLabel}>Automatically detect transactions from notifications</Text>
                </View>
                <Switch
                  testID="switch-smart-detection"
                  value={detectionSettings?.enabled ?? false}
                  onValueChange={handleToggleDetection}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === "android" ? ((detectionSettings?.enabled ?? false) ? colors.primary : "#f4f3f4") : undefined}
                />
              </View>

              <View style={s.divider} />

              <TouchableOpacity
                style={s.navRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  openNotificationAccessSettings();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Notification Access</Text>
                  <Text style={s.rowSubLabel}>
                    {notifAccessGranted ? "Access granted" : "Permission required to scan bank alerts"}
                  </Text>
                </View>
                <Text style={[s.rowValue, { color: notifAccessGranted ? colors.primary : colors.destructive, marginRight: 8, fontSize: 12, fontFamily: "Inter_600SemiBold" }]}>
                  {notifAccessGranted ? "Granted" : "Configure"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              <View style={s.divider} />

              <View style={s.toggleRow}>
                <Ionicons name="notifications-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>Review Reminder</Text>
                  <Text style={s.rowSubLabel}>Remind you to check pending transactions daily</Text>
                </View>
                <Switch
                  testID="switch-review-reminder"
                  value={detectionSettings?.reviewReminderEnabled ?? true}
                  onValueChange={async (val) => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    await updateDetectionSettings({ reviewReminderEnabled: val });
                  }}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === "android" ? ((detectionSettings?.reviewReminderEnabled ?? true) ? colors.primary : "#f4f3f4") : undefined}
                />
              </View>

              {(detectionSettings?.reviewReminderEnabled ?? true) && (
                <>
                  <View style={s.divider} />
                  <TouchableOpacity
                    style={s.navRow}
                    onPress={showTimePicker}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={18} color={colors.mutedForeground} style={s.rowIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowLabel}>Reminder Time</Text>
                      <Text style={s.rowSubLabel}>Configure daily reminder alert schedule</Text>
                    </View>
                    <Text style={[s.rowValue, { color: colors.primary, marginRight: 8, fontSize: 13, fontFamily: "Inter_700Bold" }]}>
                      {formatTime12h(detectionSettings?.reviewReminderTime || "20:00")}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}

        {/* Support & Share */}
        <Text style={s.groupLabel}>Support & Share</Text>
        <View style={s.card}>
          <TouchableOpacity
            testID="button-rate-app"
            style={s.navRow}
            onPress={handleRateApp}
            activeOpacity={0.7}
          >
            <Ionicons name="star-outline" size={18} color="#f59e0b" style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Rate Spendly</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-share-app"
            style={s.navRow}
            onPress={handleShareApp}
            activeOpacity={0.7}
          >
            <Ionicons name="share-social-outline" size={18} color="#10b981" style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Share with Friends</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Group 4: Data Management */}
        <Text style={s.groupLabel}>Data & Portability</Text>
        <View style={s.card}>
          <TouchableOpacity
            testID="button-export-pdf"
            style={s.navRow}
            onPress={handleExportPDF}
            activeOpacity={0.7}
          >
            <Ionicons name="document-outline" size={18} color="#ef4444" style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Export Transactions (PDF)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-export-csv"
            style={s.navRow}
            onPress={handleExportCSV}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={18} color="#10b981" style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Export Transactions (CSV)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-export-json"
            style={s.navRow}
            onPress={handleExportJSON}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-download-outline" size={18} color={colors.primary} style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Backup Data (JSON)</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-restore-json"
            style={s.navRow}
            onPress={() => setRestoreModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#3b82f6" style={s.rowIcon} />
            <Text style={[s.rowLabel, { flex: 1 }]}>Restore Backup</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity
            testID="button-clear-all-data"
            style={s.navRow}
            onPress={handleClearAllData}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color={colors.destructive} style={s.rowIcon} />
            <Text style={[s.rowLabel, { color: colors.destructive, flex: 1 }]}>Clear All Data</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Currency Selector Modal */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <Pressable
          style={s.modalOverlay}
          onPress={() => setCurrencyModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={s.modalContainer}
          >
            <Pressable style={s.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Select Currency</Text>
                <TouchableOpacity onPress={() => setCurrencyModalVisible(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={s.currencyList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {SUPPORTED_CURRENCIES.map((curr) => {
                  const isSel = currency === curr.symbol;
                  return (
                    <TouchableOpacity
                      key={curr.code}
                      onPress={async () => {
                        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        await setProfile({
                          name: profile?.name ?? "",
                          salary: profile?.salary ?? 0,
                          currency: curr.symbol,
                        });
                        setCurrencyModalVisible(false);
                      }}
                      style={[
                        s.currencyOptionRow,
                        isSel && s.currencyOptionRowActive,
                      ]}
                    >
                      <Text style={[s.currencyOptionText, isSel && s.currencyOptionTextActive]}>
                        {curr.label}
                      </Text>
                      {isSel && (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

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
              style={s.restoreBtn}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={s.restoreBtnText}>Restore Now</Text>
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      flex: 1,
    },
    scroll: {
      padding: 16,
      paddingTop: 20,
    },
    avatarZone: {
      alignItems: "center",
      marginBottom: 24,
    },
    avatarCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    avatarInitial: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
    },
    avatarName: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    avatarBudget: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    groupLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: 20,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginLeft: 48,
    },
    rowIcon: {
      marginRight: 12,
    },
    rowLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    rowSubLabel: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      height: 48,
    },
    rowInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      textAlign: "right",
      padding: 0,
      marginLeft: 12,
    },
    salaryInput: {
      fontFamily: "Inter_600SemiBold",
    },
    inputRupee: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginLeft: "auto",
    },
    errorMargin: {
      marginTop: -16,
      marginBottom: 16,
      marginLeft: 16,
    },
    collapsibleHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    collapsibleContent: {
      backgroundColor: colors.background + "10",
    },
    budgetRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    catIconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    catLabelText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    catSpentText: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    rowLimitInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 8,
      height: 30,
      width: 90,
      marginLeft: 12,
    },
    limitRupee: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginRight: 2,
    },
    limitInputText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      padding: 0,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
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
      borderWidth: StyleSheet.hairlineWidth,
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
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      height: 150,
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
      fontSize: 12,
    },
    restoreBtn: {
      marginTop: 18,
      backgroundColor: colors.destructive,
      borderRadius: 12,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    restoreBtnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    modalOverlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalContainer: {
      width: "100%",
      maxHeight: "70%",
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingBottom: Platform.OS === "ios" ? 40 : 24,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    currencyList: {
      maxHeight: 320,
    },
    currencyOptionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: colors.background + "20",
    },
    currencyOptionRowActive: {
      backgroundColor: colors.primary + "12",
    },
    currencyOptionText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    currencyOptionTextActive: {
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    rowValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
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