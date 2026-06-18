import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, useEffect, useMemo } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, ExpenseCategory, useCurrency } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { setLastExpenseCategory } from "@/lib/uxPrefs";
import { evaluateMathExpression } from "@/lib/split";

const CAT_META: Record<
  ExpenseCategory,
  { label: string; icon: string; gradient: [string, string] }
> = {
  travel:        { label: "Travel",        icon: "airplane",                   gradient: ["#10b981", "#047857"] },
  food:          { label: "Food",          icon: "restaurant",                 gradient: ["#f97316", "#ea580c"] },
  shopping:      { label: "Shopping",      icon: "bag-handle",                 gradient: ["#a855f7", "#7c3aed"] },
  entertainment: { label: "Coffee",        icon: "cafe",                       gradient: ["#b45309", "#78350f"] },
  healthcare:    { label: "Fuel",          icon: "car",                        gradient: ["#0ea5e9", "#0284c7"] },
  others:        { label: "Others",        icon: "ellipsis-horizontal-circle", gradient: ["#6b7280", "#4b5563"] },
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function AddExpense() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currency = useCurrency();
  const { category } = useLocalSearchParams<{ category: string }>();
  const { addExpense, customCategories, expenses } = useApp();

  const cat = category || "others";
  const amountRef = useRef<TextInput>(null);
  const custom = customCategories.find((c) => c.id === cat);

  const hasActiveRecurringBill = useMemo(() => {
    return expenses.some(e => e.recurring === "monthly" && !e.recurringGroupId && e.category === cat);
  }, [expenses, cat]);
  const meta = custom
    ? {
        label: custom.name,
        icon: custom.icon,
        gradient: [custom.color, custom.color + "cc"] as [string, string],
      }
    : CAT_META[cat as ExpenseCategory] ?? CAT_META.others;

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [amtFocused, setAmtFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [success, setSuccess] = useState(false);
  const isSavingRef = useRef(false);

  useEffect(() => {
    const isCatRecur = !!custom?.isRecurring || expenses.some(
      (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === cat
    );
    if (isCatRecur) {
      setIsRecurring(true);
    } else {
      setIsRecurring(false);
    }
  }, [custom, cat, expenses]);

  const scale = useSharedValue(1);
  const checkScale = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSubmit = async () => {
    if (isSavingRef.current) return;

    const resolvedAmt = evaluateMathExpression(amount);
    const amt = resolvedAmt !== null ? Math.round(resolvedAmt * 100) / 100 : parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      amountRef.current?.focus();
      return;
    }

    isSavingRef.current = true;
    scale.value = withSequence(
      withSpring(0.95, { damping: 15 }),
      withSpring(1, { damping: 10 })
    );

    try {
      await addExpense({
        category: cat,
        amount: Math.round(amt * 100) / 100,
        description: description.trim() || meta.label,
        date: date.toISOString(),
        recurring: isRecurring ? "monthly" : null,
      });
      await setLastExpenseCategory(cat);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      checkScale.value = withSpring(1, { damping: 12 });
      setSuccess(true);
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 1200);
    } catch (e) {
      isSavingRef.current = false;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const s = addStyles(colors, topPad, bottomPad);

  return (
    <View style={s.root}>
      <LinearGradient colors={meta.gradient} style={s.header}>
        <View style={s.headerContent}>
          <TouchableOpacity
            testID="button-back"
            onPress={() => router.back()}
            style={s.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.85)" />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
          <View style={s.catRow}>
            <View style={s.catIconWrap}>
              <Ionicons name={meta.icon as "home"} size={28} color="#fff" />
            </View>
            <View>
              <Text style={s.catSub}>Adding expense for</Text>
              <Text style={s.catName}>{meta.label}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {success ? (
            <View style={s.successWrap}>
              <Animated.View style={[s.checkCircle, checkStyle]}>
                <Ionicons name="checkmark" size={48} color={meta.gradient[0]} />
              </Animated.View>
              <Text style={s.successText}>Expense Added!</Text>
            </View>
          ) : (
            <View style={s.card}>
              {/* Amount */}
              <Text style={s.label}>Amount</Text>
              <View style={[s.amtWrap, amtFocused && { borderColor: meta.gradient[0] }]}>
                <Text style={[s.rupeeSymbol, { color: amtFocused ? meta.gradient[0] : colors.mutedForeground }]}>{currency}</Text>
                <TextInput
                  ref={amountRef}
                  testID="input-amount"
                  style={s.amtInput}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={() => setAmtFocused(true)}
                  onBlur={() => {
                    setAmtFocused(false);
                    if (amount.trim()) {
                      const resolved = evaluateMathExpression(amount);
                      if (resolved !== null) {
                        setAmount(resolved.toFixed(2));
                      }
                    }
                  }}
                  keyboardType="numbers-and-punctuation"
                  autoFocus
                />
              </View>
              {(() => {
                if (amount.trim() && (amount.includes('+') || amount.includes('-') || amount.includes('*') || amount.includes('/'))) {
                  const resolved = evaluateMathExpression(amount);
                  if (resolved !== null && !isNaN(resolved) && resolved > 0) {
                    return (
                      <View style={s.mathPreviewContainer}>
                        <Ionicons name="calculator-outline" size={12} color={meta.gradient[0]} />
                        <Text style={[s.mathPreviewText, { color: meta.gradient[0] }]}>Total: {currency}{Math.round(resolved).toLocaleString()}</Text>
                      </View>
                    );
                  }
                }
                return null;
              })()}

              {/* Description */}
              <Text style={[s.label, { marginTop: 20 }]}>Description <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional)</Text></Text>
              <View style={[s.inputWrap, descFocused && { borderColor: meta.gradient[0] }]}>
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={descFocused ? meta.gradient[0] : colors.mutedForeground}
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  testID="input-description"
                  style={s.input}
                  placeholder="e.g. Lunch at cafe"
                  placeholderTextColor={colors.mutedForeground}
                  value={description}
                  onChangeText={setDescription}
                  onFocus={() => setDescFocused(true)}
                  onBlur={() => setDescFocused(false)}
                  returnKeyType="done"
                />
              </View>

              {/* Date */}
              <Text style={[s.label, { marginTop: 20 }]}>Date</Text>
              <TouchableOpacity
                testID="button-date-picker"
                onPress={() => setShowDatePicker(true)}
                style={s.dateBtn}
              >
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={s.dateText}>{formatDate(date)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* iOS inline picker */}
              {Platform.OS === "ios" && showDatePicker && (
                <View style={s.iosPickerWrap}>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display="inline"
                    maximumDate={new Date()}
                    onChange={(_, d) => { if (d) setDate(d); }}
                    accentColor={meta.gradient[0]}
                  />
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(false)}
                    style={[s.doneBtn, { backgroundColor: meta.gradient[0] }]}
                  >
                    <Text style={s.doneBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Android date picker modal */}
              {Platform.OS === "android" && showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  maximumDate={new Date()}
                  onChange={(_, d) => {
                    setShowDatePicker(false);
                    if (d) setDate(d);
                  }}
                />
              )}

              {/* Web date picker */}
              {Platform.OS === "web" && showDatePicker && (
                <Modal
                  visible={showDatePicker}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <Pressable
                    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" }}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 24, width: 300 }}>
                      <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 16 }}>Pick a Date</Text>
                      <DateTimePicker
                        value={date}
                        mode="date"
                        display="default"
                        maximumDate={new Date()}
                        onChange={(_, d) => {
                          setShowDatePicker(false);
                          if (d) setDate(d);
                        }}
                      />
                    </View>
                  </Pressable>
                </Modal>
              )}

              {/* Recurring Toggle */}
              <View style={s.toggleRow}>
                <View style={s.toggleLeft}>
                  <Ionicons name="repeat-outline" size={18} color={meta.gradient[0]} style={{ marginRight: 8 }} />
                  <View>
                    <Text style={s.toggleLabel}>Repeat Monthly</Text>
                    <Text style={s.toggleSub}>Rent, subscription, EMI, etc.</Text>
                  </View>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={setIsRecurring}
                  trackColor={{ false: colors.border, true: meta.gradient[0] + '60' }}
                  thumbColor={isRecurring ? meta.gradient[0] : colors.mutedForeground}
                />
              </View>

              {isRecurring && hasActiveRecurringBill && (
                <View style={s.recurringAlert}>
                  <Ionicons name="information-circle" size={16} color={meta.gradient[0]} />
                  <Text style={s.recurringAlertText}>
                    This category already has an active recurring bill setup. It logs automatically every month.
                  </Text>
                </View>
              )}

              <Animated.View style={animStyle}>
                <TouchableOpacity
                  testID="button-submit-expense"
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  style={[s.submitBtn, { backgroundColor: meta.gradient[0] }]}
                >
                  <Text style={s.submitText}>Save Expense</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const addStyles = (
  colors: ReturnType<typeof useColors>,
  topPad: number,
  bottomPad: number
) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerContent: {
      paddingTop: topPad + 12,
      paddingBottom: 24,
      paddingHorizontal: 20,
    },
    backBtn: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
      gap: 4,
    },
    backText: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    catRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    catIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    catSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.65)",
    },
    catName: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginTop: 2,
    },
    scroll: {
      padding: 20,
      paddingBottom: bottomPad + 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    amtWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 16,
      height: 64,
      backgroundColor: colors.background,
    },
    rupeeSymbol: {
      fontSize: 24,
      fontFamily: "Inter_600SemiBold",
      marginRight: 8,
    },
    amtInput: {
      flex: 1,
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 52,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    dateBtn: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 52,
      backgroundColor: colors.background,
      gap: 10,
    },
    dateText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      marginTop: 20,
      marginBottom: 10,
    },
    toggleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    toggleLabel: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
    },
    toggleSub: {
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
      color: colors.mutedForeground,
      marginTop: 1,
    },
    iosPickerWrap: {
      marginTop: 8,
      backgroundColor: colors.background,
      borderRadius: colors.radius,
      overflow: "hidden",
    },
    doneBtn: {
      margin: 12,
      borderRadius: colors.radius,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    doneBtnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    submitBtn: {
      marginTop: 28,
      borderRadius: colors.radius,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
      elevation: 4,
    },
    submitText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    successWrap: {
      alignItems: "center",
      paddingTop: 60,
      gap: 16,
    },
    checkCircle: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 6,
    },
    successText: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    mathPreviewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: colors.background !== '#f4faf6' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 6,
    },
    mathPreviewText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    recurringAlert: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.primary + "12",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.primary + "20",
      marginTop: 4,
      marginBottom: 20,
      gap: 8,
    },
    recurringAlertText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 16,
    },
  });
