import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemePreference } from "@/hooks/useThemePreference";
import {
  useApp,
  Expense,
  ExpenseCategory,
  CustomCategory,
  SplitGroup,
  parseGroupName,
} from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { isSameMember, getExpenseMemberConsumptionShare, evaluateMathExpression } from "@/lib/split";

const BUILTIN_META: Record<
  ExpenseCategory,
  { label: string; icon: string; color: string; bg: string }
> = {
  travel: { label: "Travel", icon: "airplane", color: "#10b981", bg: "#e6f7f0" },
  food: { label: "Food", icon: "restaurant", color: "#f97316", bg: "#fff5e6" },
  shopping: { label: "Shopping", icon: "bag-handle", color: "#a855f7", bg: "#f5ebff" },
  entertainment: { label: "Fun", icon: "game-controller", color: "#ec4899", bg: "#fdf0f5" },
  healthcare: { label: "Health", icon: "heart", color: "#ef4444", bg: "#fdebeb" },
  others: { label: "Others", icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5" },
};

const BUILTIN_KEYS = Object.keys(BUILTIN_META) as ExpenseCategory[];

type CatMeta = { label: string; icon: string; color: string; bg: string };

function resolveExpenseMeta(
  category: string | null | undefined,
  customCategories: CustomCategory[],
  colors: ReturnType<typeof useColors>
): CatMeta {
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
      label: custom.name,
      icon: custom.icon,
      color: custom.color,
      bg: custom.color + "18",
    };
  }
  const defaultColor = colors.mutedForeground;
  return {
    label: "Others",
    icon: "ellipsis-horizontal",
    color: defaultColor,
    bg: defaultColor + "18",
  };
}

type FilterChip = { key: string; meta: CatMeta };

interface HistoryItem {
  id: string;
  description: string;
  date: string;
  category: string;
  amount: number;
  isDebit: boolean;
  subtitle: string;
}

type Section = { title: string; total: number; data: HistoryItem[] };

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { expenses, editExpense, deleteExpense, customCategories, splitGroups, profile, getCurrentMonthExpenses } = useApp();

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Edit Modal States
  const [editingExpense, setEditingExpense] = useState<HistoryItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const tabClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();
  const effectiveTheme = themeMode === "system" ? scheme : themeMode;

  const filterChips = useMemo<FilterChip[]>(() => {
    const builtin: FilterChip[] = BUILTIN_KEYS.map((key) => {
      const color = (colors as any)[key] || colors.primary;
      return {
        key,
        meta: {
          ...BUILTIN_META[key],
          color,
          bg: color + "18",
        },
      };
    });
    const custom: FilterChip[] = customCategories.map((c) => ({
      key: c.id,
      meta: {
        label: c.name,
        icon: c.icon,
        color: c.color,
        bg: c.color + "18",
      },
    }));
    return [...builtin, ...custom];
  }, [customCategories, colors]);

  const myName = profile?.name ?? "You";

  const allItems = useMemo<HistoryItem[]>(() => {
    // 1. Personal expenses (always Debit)
    const personal: HistoryItem[] = expenses.map((e) => ({
      id: e.id,
      description: e.description || resolveExpenseMeta(e.category, customCategories, colors).label,
      date: e.date,
      category: e.category,
      amount: e.amount,
      isDebit: true,
      subtitle: "Personal",
    }));

    // 2. Shared group expenses and settlements
    const shared: HistoryItem[] = splitGroups.flatMap((group) => {
      const gMembers = group.members || [];
      const cleanGroupName = parseGroupName(group.name).name;
      return (group.expenses || []).map((exp) => {
        // A. Handle Settlement Records
        if (exp.category === "settlement") {
          const isPayer = isSameMember(exp.paidBy, myName, gMembers);
          const isRecipient = (exp.splitAmong || []).some((m) => isSameMember(m, myName, gMembers));
          
          if (isPayer) {
            return {
              id: `${group.id}-${exp.id}`,
              description: "Sent Settlement",
              date: exp.date,
              category: "settlement",
              amount: exp.totalAmount,
              isDebit: true,
              subtitle: `Paid to ${(exp.splitAmong || []).join(", ")} · Group: ${cleanGroupName}`,
            };
          } else if (isRecipient) {
            return {
              id: `${group.id}-${exp.id}`,
              description: "Received Settlement",
              date: exp.date,
              category: "settlement",
              amount: exp.totalAmount,
              isDebit: false,
              subtitle: `Received from ${exp.paidBy} · Group: ${cleanGroupName}`,
            };
          }
          return null;
        }

        // B. Handle Standard Split Expenses
        const iPaid = isSameMember(exp.paidBy, myName, gMembers);
        const userInSplit = (exp.splitAmong || []).some((m) => isSameMember(m, myName, gMembers));

        if (!userInSplit && !iPaid) return null;

        const share = getExpenseMemberConsumptionShare(exp, myName, gMembers);
        if (share <= 0) return null;

        const subtitle = iPaid
          ? `${cleanGroupName} · You paid`
          : `${cleanGroupName} · Paid by ${exp.paidBy}`;

        return {
          id: `${group.id}-${exp.id}`,
          description: exp.description || cleanGroupName,
          date: exp.date,
          category: exp.category || "others",
          amount: Math.round(share),
          isDebit: true,
          subtitle,
        };
      }).filter(Boolean) as HistoryItem[];
    });

    return [...personal, ...shared];
  }, [expenses, splitGroups, myName, customCategories, colors]);

  const filtered = allItems.filter((e) => {
    const matchCat = activeFilter ? e.category === activeFilter : true;
    const matchQ = query.trim()
      ? e.description.toLowerCase().includes(query.toLowerCase()) ||
        e.subtitle.toLowerCase().includes(query.toLowerCase())
      : true;
    return matchCat && matchQ;
  });

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const grouped: Record<string, HistoryItem[]> = {};
  sorted.forEach((item) => {
    const key = new Date(item.date).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  const sections: Section[] = Object.entries(grouped).map(([title, data]) => ({
    title,
    total: data.reduce((s, e) => s + (e.isDebit ? e.amount : 0), 0),
    data,
  }));

  const currentMonthKey = new Date().toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const handleShareMonthlyReport = async () => {
    const currentExps = getCurrentMonthExpenses();

    if (currentExps.length === 0) {
      Alert.alert("No Data", "No expenses this month to share.");
      return;
    }

    const total = currentExps.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    currentExps.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    });

    const lines = [
      `Spendly Monthly Report`,
      currentMonthKey,
      ``,
      `Total Spent: ₹${total.toLocaleString("en-IN")}`,
      `Transactions: ${currentExps.length}`,
      ``,
      `By Category:`,
      ...Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([cat, amt]) =>
            `  ${resolveExpenseMeta(cat, customCategories, colors).label}: ₹${amt.toLocaleString("en-IN")}`
        ),
      ``,
      `Top Expenses:`,
      ...[...currentExps]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((e) => `  ${e.description}: ₹${e.amount.toLocaleString("en-IN")}`),
      ``,
      `Tracked with Spendly`,
    ];

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({ message: lines.join("\n") });
  };

  const handleDelete = (exp: HistoryItem) => {
    Alert.alert("Delete Expense", `Delete "${exp.description}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteExpense(exp.id);
        },
      },
    ]);
  };

  const handleEditExpensePress = (item: HistoryItem) => {
    setEditingExpense(item);
    setEditDesc(item.description);
    setEditAmount(item.amount.toString());
    setEditCategory(item.category);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingExpense) return;
    if (!editDesc.trim()) {
      Alert.alert("Missing description", "Please enter a description.");
      return;
    }
    const resolvedAmt = evaluateMathExpression(editAmount);
    const amt = resolvedAmt !== null ? resolvedAmt : parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }

    try {
      await editExpense(editingExpense.id, {
        description: editDesc.trim(),
        amount: amt,
        category: editCategory,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
      setEditingExpense(null);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update expense.");
    }
  };

  const s = histStyles(colors, topPad);

  const renderItem = (exp: HistoryItem) => {
    const isSettlement = exp.category === "settlement";
    const cat = resolveExpenseMeta(exp.category, customCategories, colors);
    const isDebit = exp.isDebit;

    // Dynamically choose icon, color, and background to match debits vs credits
    let iconName: any = cat.icon;
    let iconColor = cat.color;
    let iconBg = cat.bg;

    if (isSettlement) {
      if (isDebit) {
        iconName = "arrow-up-circle-outline";
        iconColor = colors.destructive;
        iconBg = colors.destructive + "12";
      } else {
        iconName = "arrow-down-circle-outline";
        iconColor = "#10b981";
        iconBg = "#10b98112";
      }
    }

    return (
      <View testID={`row-history-${exp.id}`} style={s.txRow}>
        <View style={[s.txIcon, { backgroundColor: iconBg }]}>
          <Ionicons 
            name={iconName} 
            size={18} 
            color={iconColor} 
          />
        </View>
        <View style={{ flex: 1, marginLeft: 13 }}>
          <Text style={s.txDesc} numberOfLines={1}>
            {exp.description}
          </Text>
          <Text style={s.txDate}>
            {exp.subtitle}
          </Text>
        </View>
        <Text style={[s.txAmt, { color: isDebit ? colors.destructive : "#10b981" }]}>
          {isDebit ? "-" : "+"}₹{exp.amount.toLocaleString("en-IN")}
        </Text>
        {isDebit && !exp.id.includes("-") ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <TouchableOpacity
              testID={`button-edit-${exp.id}`}
              onPress={() => handleEditExpensePress(exp)}
              style={{ padding: 4 }}
            >
              <Ionicons name="create-outline" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              testID={`button-delete-${exp.id}`}
              onPress={() => handleDelete(exp)}
              style={{ padding: 4 }}
            >
              <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>History</Text>
            <Text style={s.headerSub}>All your transactions</Text>
          </View>
          <TouchableOpacity
            testID="button-share-monthly-report"
            onPress={handleShareMonthlyReport}
            style={s.shareBtn}
          >
            <BlurView intensity={90} tint={effectiveTheme === "dark" ? "dark" : "light"} style={s.shareBtnBlur}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={s.shareBtnText}>Report</Text>
            </BlurView>
          </TouchableOpacity>
        </View>

        <View style={[s.searchWrap, searchFocused && s.searchFocused]}>
          <BlurView intensity={Platform.OS === "web" ? 0 : 85} tint={effectiveTheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Ionicons
            name="search-outline"
            size={17}
            color={searchFocused ? colors.primary : "rgba(255,255,255,0.6)"}
          />
          <TextInput
            testID="input-search"
            style={s.searchInput}
            placeholder="Search expenses..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={s.chipBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
        >
          <TouchableOpacity
            testID="filter-all"
            onPress={() => setActiveFilter(null)}
            style={[s.chip, !activeFilter && s.chipActive]}
          >
            <Text style={[s.chipText, !activeFilter && s.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {filterChips.map(({ key, meta }) => {
            const isActive = activeFilter === key;
            return (
              <TouchableOpacity
                key={key}
                testID={`filter-${key}`}
                onPress={() => setActiveFilter(isActive ? null : key)}
                style={[
                  s.chip,
                  isActive && { backgroundColor: meta.color, borderColor: meta.color },
                ]}
              >
                <Ionicons
                  name={meta.icon as "home"}
                  size={12}
                  color={isActive ? "#fff" : meta.color}
                />
                <Text style={[s.chipText, isActive && s.chipTextActive]}>{meta.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {sections.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="receipt-outline" size={50} color={colors.mutedForeground} />
          <Text style={s.emptyText}>
            {query || activeFilter ? "No matching transactions" : "No transactions yet"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.title}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: tabClearance + 16,
          }}
          renderItem={({ item: section }) => (
            <View style={{ marginBottom: 26 }}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                <Text style={s.sectionTotal}>
                  -₹{section.total.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={s.card}>
                <BlurView intensity={Platform.OS === "web" ? 0 : 85} tint={effectiveTheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
                {section.data.map((exp, i) => (
                  <View key={exp.id} style={i > 0 ? s.divider : undefined}>
                    {renderItem(exp)}
                  </View>
                ))}
              </View>
            </View>
          )}
        />
      )}

      {/* Edit Expense Modal (Premium Bottom Sheet) */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingExpense(null);
        }}
      >
        <Pressable
          style={s.overlay}
          onPress={() => {
            setEditModalVisible(false);
            setEditingExpense(null);
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[s.sheet, { paddingBottom: bottomPad + 16 }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Edit Personal Expense</Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              {/* Amount input block at top */}
              <View style={s.largeAmountBlock}>
                <Text style={s.largeRupeeSymbol}>₹</Text>
                <TextInput
                  testID="input-edit-amount"
                  style={s.largeAmtInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground + "aa"}
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="numbers-and-punctuation"
                  autoFocus
                  onBlur={() => {
                    if (editAmount.trim()) {
                      const resolved = evaluateMathExpression(editAmount);
                      if (resolved !== null) {
                        setEditAmount(resolved.toFixed(2));
                      }
                    }
                  }}
                />
              </View>

              {/* Title / Description */}
              <Text style={s.fieldLabel}>Description</Text>
              <View style={s.sheetInputWrap}>
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  testID="input-edit-description"
                  style={s.sheetTextInput}
                  placeholder="What was this for?"
                  placeholderTextColor={colors.mutedForeground}
                  value={editDesc}
                  onChangeText={setEditDesc}
                />
              </View>

              {/* Category picker row */}
              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.catPickerScroll}
                style={{ marginBottom: 16, marginTop: 4 }}
              >
                {filterChips.map(({ key, meta }) => {
                  const isSelected = editCategory === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setEditCategory(key)}
                      style={[
                        s.catPickerItem,
                        isSelected && { borderColor: meta.color, backgroundColor: meta.color + "12" },
                      ]}
                    >
                      <Ionicons
                        name={meta.icon as any}
                        size={16}
                        color={isSelected ? meta.color : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          s.catPickerText,
                          { color: isSelected ? meta.color : colors.mutedForeground },
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Save changes button */}
              <TouchableOpacity
                testID="button-submit-edit-expense"
                onPress={handleSaveEdit}
                style={s.submitEditBtn}
                activeOpacity={0.85}
              >
                <Text style={s.submitEditBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const histStyles = (colors: ReturnType<typeof useColors>, topPad: number) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingTop: topPad + 18,
      paddingBottom: 18,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#fff" },
    headerSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.65)",
      marginTop: 5,
    },
    shareBtn: {
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    shareBtnBlur: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    shareBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(255,255,255,0.18)",
      borderRadius: 13,
      paddingHorizontal: 13,
      height: 44,
      borderWidth: 1.5,
      borderColor: "transparent",
      overflow: "hidden",
    },
    searchFocused: {
      backgroundColor: "rgba(255,255,255,0.25)",
      borderColor: "rgba(255,255,255,0.6)",
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: "#fff",
    },
    chipBar: { backgroundColor: colors.background },
    chipScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 9 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 13,
      paddingVertical: 6,
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground },
    chipTextActive: { color: "#fff" },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    sectionTotal: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.destructive },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    divider: { borderTopWidth: 1, borderTopColor: colors.border },
    txRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    txIcon: {
      width: 40,
      height: 40,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    txDesc: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    txDate: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 3,
    },
    txAmt: { fontSize: 14, fontFamily: "Inter_700Bold" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
    emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 14,
      paddingHorizontal: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderBottomWidth: 0,
    },
    sheetHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 18,
    },
    largeAmountBlock: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 14,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.border,
      paddingBottom: 10,
    },
    largeRupeeSymbol: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginRight: 6,
    },
    largeAmtInput: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      minWidth: 120,
      textAlign: "left",
      padding: 0,
    },
    fieldLabel: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    sheetInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 48,
      backgroundColor: colors.background,
      marginBottom: 14,
    },
    sheetTextInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    catPickerScroll: {
      gap: 8,
      paddingRight: 16,
    },
    catPickerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    catPickerText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    submitEditBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 14,
      marginBottom: 8,
    },
    submitEditBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
  });
