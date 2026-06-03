import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import {
  ReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  loadReminderSettings,
  applyReminderSettings,
  requestNotificationPermissions,
  isNotificationsSupported,
} from "@/hooks/useNotifications";

interface ReminderModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ReminderModal({ visible, onClose }: ReminderModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [showTimePicker, setShowTimePicker] = useState<number | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      loadReminderSettings().then(setReminders);
    }
  }, [visible]);

  const updateReminderTime = (index: number, date: Date) => {
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const newTimes = [...reminders.times];
    newTimes[index] = `${hh}:${mm}`;
    setReminders((prev) => ({ ...prev, times: newTimes }));
  };

  const openTimePickerAndroid = (index: number) => {
    const timeStr = reminders.times[index] ?? "09:00";
    const [h, m] = timeStr.split(":").map(Number);
    const timeDate = new Date();
    timeDate.setHours(h, m, 0, 0);

    DateTimePickerAndroid.open({
      value: timeDate,
      mode: "time",
      is24Hour: false,
      onChange: (event, date) => {
        if (event.type === "set" && date) {
          updateReminderTime(index, date);
        }
      },
    });
  };

  const handleSaveReminders = async () => {
    setReminderSaving(true);
    try {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          "Permission Required",
          "Please enable notifications for Spendly in your device Settings to receive expense reminders.",
          [{ text: "OK" }]
        );
        setReminderSaving(false);
        return;
      }
      await applyReminderSettings(reminders);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const times = reminders.times.slice(0, reminders.count);
      const timeStr = times
        .map((t) => {
          const [h, m] = t.split(":").map(Number);
          const d = new Date();
          d.setHours(h, m);
          return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        })
        .join(" & ");
      Alert.alert(
        reminders.enabled ? "✅ Reminders Set!" : "🔕 Reminders Disabled",
        reminders.enabled
          ? `You'll be reminded daily at ${timeStr}.`
          : "You won't receive expense reminders.",
        [{ text: "Great!" }]
      );
      onClose();
    } catch (e) {
      Alert.alert("Error", "Failed to save reminder settings. Please try again.");
    } finally {
      setReminderSaving(false);
    }
  };

  const s = createStyles(colors);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={s.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <View style={[s.reminderSheet, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 16 }]}>
          <View style={s.reminderSheetHandle} />
          <Text style={s.reminderSheetTitle}>🔔 Expense Reminders</Text>
          <Text style={s.reminderSheetHint}>
            Get daily nudges to log your expenses. Never forget a transaction.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
            {!isNotificationsSupported && (
              <View style={s.unsupportedWarning}>
                <Ionicons name="warning-outline" size={16} color={colors.background === "#f4faf6" ? "#c2410c" : "#ea580c"} />
                <Text style={s.unsupportedWarningText}>
                  Reminders are not supported on this platform. To receive daily expense notifications, please run Spendly on a mobile device.
                </Text>
              </View>
            )}
            {/* Enable Toggle */}
            <View style={s.reminderToggleRow}>
              <View style={s.reminderToggleLeft}>
                <View style={[s.reminderIcon, { backgroundColor: reminders.enabled ? colors.primary + "18" : colors.muted }]}>
                  <Ionicons
                    name={reminders.enabled ? "notifications" : "notifications-off-outline"}
                    size={18}
                    color={reminders.enabled ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <View>
                  <Text style={s.reminderToggleLabel}>Enable Reminders</Text>
                  <Text style={s.reminderToggleSub}>
                    {reminders.enabled ? "Active — reminders are on" : "Tap to turn on reminders"}
                  </Text>
                </View>
              </View>
              <Switch
                value={reminders.enabled}
                onValueChange={(v) => setReminders((prev) => ({ ...prev, enabled: v }))}
                trackColor={{ false: colors.border, true: colors.primary + "60" }}
                thumbColor={reminders.enabled ? colors.primary : colors.mutedForeground}
              />
            </View>

            {reminders.enabled && (
              <>
                <View style={s.reminderDivider} />
                <Text style={s.reminderSubLabel}>How many times per day?</Text>
                <View style={s.countRow}>
                  {([1, 2, 3] as const).map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[
                        s.countChip,
                        reminders.count === n && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => {
                        setReminders((prev) => ({ ...prev, count: n }));
                        Haptics.selectionAsync();
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.countChipText, reminders.count === n && { color: "#fff" }]}>
                        {n === 1 ? "Once" : n === 2 ? "Twice" : "3×"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {Array.from({ length: reminders.count }).map((_, i) => {
                  const timeStr = reminders.times[i] ?? "09:00";
                  const [h, m] = timeStr.split(":").map(Number);
                  const timeDate = new Date();
                  timeDate.setHours(h, m, 0, 0);
                  const label = i === 0 ? "First reminder" : i === 1 ? "Second reminder" : "Third reminder";
                  return (
                    <View key={i}>
                      <View style={s.timeRow}>
                        <Text style={s.timeLabel}>{label}</Text>
                        <TouchableOpacity
                          style={s.timeBtn}
                          onPress={() => {
                            if (Platform.OS === "android") {
                              openTimePickerAndroid(i);
                            } else {
                              setShowTimePicker(showTimePicker === i ? null : i);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="time-outline" size={15} color={colors.primary} />
                          <Text style={s.timeBtnText}>
                            {timeDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                      {Platform.OS === "ios" && showTimePicker === i && (
                        <DateTimePicker
                          value={timeDate}
                          mode="time"
                          is24Hour={false}
                          display="spinner"
                          onChange={(_, date) => {
                            if (date) updateReminderTime(i, date);
                          }}
                        />
                      )}
                    </View>
                  );
                })}
              </>
            )}

            <TouchableOpacity
              style={[s.reminderSaveBtn, { opacity: reminderSaving ? 0.7 : 1 }]}
              onPress={handleSaveReminders}
              activeOpacity={0.85}
              disabled={reminderSaving}
            >
              <Ionicons name="alarm-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={s.reminderSaveBtnText}>
                {reminderSaving ? "Saving…" : "Save Reminders"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    reminderSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 14,
      paddingHorizontal: 20,
      paddingBottom: 24,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderBottomWidth: 0,
      maxHeight: "90%",
    },
    reminderSheetHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    reminderSheetTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    reminderSheetHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 16,
      lineHeight: 18,
    },
    unsupportedWarning: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.background === "#f4faf6" ? "#fff7ed" : "rgba(234,88,12,0.12)",
      borderColor: colors.background === "#f4faf6" ? "#ffedd5" : "rgba(234,88,12,0.25)",
      borderWidth: 1,
      padding: 12,
      borderRadius: 10,
      marginBottom: 14,
    },
    unsupportedWarningText: {
      flex: 1,
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.background === "#f4faf6" ? "#c2410c" : "#f97316",
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
    reminderSaveBtn: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    reminderSaveBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
