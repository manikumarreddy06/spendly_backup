import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
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
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedListItem } from "@/components/AnimatedListItem";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isSameMember, getExpenseMemberConsumptionShare, evaluateMathExpression } from "@/lib/split";
import { BUILTIN_CATEGORIES, resolveExpenseMeta } from "@/constants/categories";
import { formatTable, formatKeyValue } from "@/lib/tableFormatter";
import { useRouter } from "expo-router";

const BUILTIN_KEYS = BUILTIN_CATEGORIES.map((c) => c.key);

type CatMeta = { label: string; icon: string; color: string; bg: string };

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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

const formatSpent = (amount: number) => {
  if (amount === 0) return "₹0";
  if (amount >= 100000) {
    const val = amount / 100000;
    return `₹${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}L`;
  }
  if (amount >= 1000) {
    const val = amount / 1000;
    return `₹${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}k`;
  }
  return `₹${amount}`;
};

function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { expenses, editExpense, deleteExpense, deleteSplitExpense, customCategories, splitGroups, profile, getCurrentMonthExpenses, lastDeleted, undoDelete, clearLastDeleted } = useApp();

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Month navigation states & helpers
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedDate.getFullYear());

  const handlePrevMonth = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
    setSelectedDate(newDate);
    setPickerYear(newDate.getFullYear());
  };

  const handleNextMonth = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
    setSelectedDate(newDate);
    setPickerYear(newDate.getFullYear());
  };

  const handleOpenDatePicker = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerYear(selectedDate.getFullYear());
    setShowDatePicker(true);
  };

  const handlePickerPrevYear = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerYear((prev) => prev - 1);
  };

  const handlePickerNextYear = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerYear((prev) => prev + 1);
  };

  const handleSelectMonth = async (monthIndex: number) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedDate(new Date(pickerYear, monthIndex, 1));
    setShowDatePicker(false);
  };

  // Edit Modal States
  const [editingExpense, setEditingExpense] = useState<HistoryItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");

  // Animated Toast states for undo
  const toastY = useRef(new Animated.Value(100)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (lastDeleted && lastDeleted.type === "expense") {
      Animated.parallel([
        Animated.spring(toastY, { toValue: 0, damping: 15, stiffness: 100, useNativeDriver: true }),
        Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(toastY, { toValue: 100, duration: 200, useNativeDriver: true }),
        Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start();
    }
  }, [lastDeleted]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();
  const effectiveTheme = themeMode === "system" ? scheme : themeMode;
  const isDark = effectiveTheme === "dark";
  const gradientColors = isDark 
    ? ["#0b1610", "#080c09", "#080c09"] 
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];

  const filterChips = useMemo<FilterChip[]>(() => {
    const builtin: FilterChip[] = BUILTIN_KEYS.map((key) => {
      return {
        key,
        meta: resolveExpenseMeta(key, customCategories, colors),
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

  const monthlySpentMap = useMemo(() => {
    const map = Array(12).fill(0);
    allItems.forEach((item) => {
      if (!item.isDebit) return;
      const d = new Date(item.date);
      if (d.getFullYear() === pickerYear) {
        const m = d.getMonth();
        if (m >= 0 && m < 12) {
          map[m] += item.amount;
        }
      }
    });
    return map;
  }, [allItems, pickerYear]);

  const filtered = useMemo(() => {
    return allItems.filter((e) => {
      const d = new Date(e.date);
      const matchMonth = d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth();
      const matchCat = activeFilter ? e.category === activeFilter : true;
      const matchQ = query.trim()
        ? e.description.toLowerCase().includes(query.toLowerCase()) ||
          e.subtitle.toLowerCase().includes(query.toLowerCase())
        : true;
      return matchMonth && matchCat && matchQ;
    });
  }, [allItems, selectedDate, activeFilter, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filtered]);

  const grouped = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};
    sorted.forEach((item) => {
      const key = new Date(item.date).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [sorted]);

  const sections = useMemo<Section[]>(() => {
    return Object.entries(grouped).map(([title, data]) => ({
      title,
      total: data.reduce((s, e) => s + (e.isDebit ? e.amount : 0), 0),
      data,
    }));
  }, [grouped]);

  const totalIncome = profile?.salary ?? 0;

  const totalExpense = useMemo(() => {
    return filtered.filter(e => e.isDebit).reduce((s, e) => s + e.amount, 0);
  }, [filtered]);

  const netBalance = totalIncome - totalExpense;

  const currentMonthKey = useMemo(() => {
    return selectedDate.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [selectedDate]);

  const handleShareMonthlyReport = async () => {
    const personalExps = filtered.filter(e => e.isDebit && !e.id.includes("-"));

    if (personalExps.length === 0) {
      Alert.alert("No Data", "No personal expenses this month to share.");
      return;
    }

    const total = personalExps.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    personalExps.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    });

        const mkLabel = (cat: string) => resolveExpenseMeta(cat, customCategories, colors).label;

    const catRows = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => [mkLabel(cat), `₹${amt.toLocaleString("en-IN")}`]);

    const catTable = formatTable("Spending by Category", [
      { header: "Category", width: 18, align: "left" as const },
      { header: "Amount", width: 12, align: "right" as const },
    ], catRows);

    const topExps = [...personalExps]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((e) => [e.description.slice(0, 30), `₹${e.amount.toLocaleString("en-IN")}`]);

    const topTable = formatTable("Top Expenses", [
      { header: "Description", width: 22, align: "left" as const },
      { header: "Amount", width: 12, align: "right" as const },
    ], topExps);

    const summary = formatKeyValue([
      ["Month", currentMonthKey],
      ["Total Spent", `₹${total.toLocaleString("en-IN")}`],
      ["Transactions", `${personalExps.length}`],
    ]);

    const message = [
      `Spendly Monthly Report`,
      ``,
      summary,
      ``,
      catTable,
      ``,
      topTable,
      ``,
      `Tracked with Spendly`,
    ].join("\n");

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({ message });

  };

  const handleDelete = (exp: HistoryItem) => {
    Alert.alert("Delete Expense", `Delete "${exp.description}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (exp.subtitle !== "Personal") {
            const expenseId = exp.id.slice(-36);
            const groupId = exp.id.slice(0, -37);
            await deleteSplitExpense(groupId, expenseId);
          } else {
            deleteExpense(exp.id);
          }
        },
      },
    ]);
  };

  const handleEditExpensePress = (item: HistoryItem) => {
    if (item.subtitle !== "Personal") {
      Alert.alert(
        "Edit Split Expense",
        "Split expenses must be edited in their respective split group.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go to Split Group",
            onPress: () => {
              const groupId = item.id.slice(0, -37);
              router.push(`/split/${groupId}`);
            },
          },
        ]
      );
      return;
    }
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
        {isDebit && exp.category !== "settlement" ? (
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
      {/* Premium Custom Month Selector Modal */}
      {showDatePicker && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <Pressable style={s.pickerOverlay} onPress={() => setShowDatePicker(false)}>
            <Pressable style={s.pickerCard} onPress={(e) => e.stopPropagation()}>
              {isDark && (
                <BlurView intensity={Platform.OS === "web" ? 0 : 90} tint="dark" style={StyleSheet.absoluteFill} />
              )}
              {/* Header: Select Month & Year Selector */}
              <View style={s.pickerHeader}>
                <Text style={s.pickerTitle}>Select Month</Text>
                
                {/* Year Switcher */}
                <View style={s.yearSwitcher}>
                  <TouchableOpacity onPress={handlePickerPrevYear} style={s.yearArrow} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons name="chevron-back" size={18} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={s.yearText}>{pickerYear}</Text>
                  <TouchableOpacity onPress={handlePickerNextYear} style={s.yearArrow} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3x4 Months Grid */}
              <View style={s.monthsGrid}>
                {MONTH_NAMES.map((monthName, index) => {
                  const isSelected = selectedDate.getFullYear() === pickerYear && selectedDate.getMonth() === index;
                  const spent = monthlySpentMap[index] || 0;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        s.monthGridCell,
                        isSelected && s.monthGridCellActive
                      ]}
                      onPress={() => handleSelectMonth(index)}
                    >
                      <Text style={[
                        s.monthNameText,
                        isSelected && s.monthNameTextActive
                      ]}>
                        {monthName}
                      </Text>
                      <Text style={[
                        s.monthSpentText,
                        isSelected ? s.monthSpentTextActive : (spent > 0 ? s.monthSpentTextValue : s.monthSpentTextZero)
                      ]} numberOfLines={1}>
                        {formatSpent(spent)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity style={s.pickerCloseBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={s.pickerCloseBtnText}>Cancel</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.35, 1]}
        style={s.headerBg}
      />

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
            <BlurView intensity={Platform.OS === "web" ? 0 : 90} tint={effectiveTheme === "dark" ? "dark" : "light"} style={s.shareBtnBlur}>
              <Ionicons name="share-outline" size={18} color={isDark ? "#fff" : colors.primary} />
              <Text style={s.shareBtnText}>Report</Text>
            </BlurView>
          </TouchableOpacity>
        </View>

        <View style={[s.searchWrap, searchFocused && s.searchFocused]}>
          <BlurView intensity={Platform.OS === "web" ? 0 : 85} tint={effectiveTheme === "dark" ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          <Ionicons
            name="search-outline"
            size={17}
            color={searchFocused ? colors.primary : (isDark ? "rgba(255,255,255,0.6)" : colors.mutedForeground)}
          />
          <TextInput
            testID="input-search"
            style={s.searchInput}
            placeholder="Search expenses..."
            placeholderTextColor={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color={isDark ? "rgba(255,255,255,0.6)" : colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {/* Month Selector Bar (Arrow picker + calendar trigger) */}
        <View style={s.monthSelectorBar}>
          <TouchableOpacity onPress={handlePrevMonth} style={s.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={colors.foreground} />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleOpenDatePicker} style={s.monthLabelBtn} activeOpacity={0.8}>
            <Ionicons name="calendar-outline" size={15} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={s.monthLabelText}>
              {selectedDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </Text>
            <Ionicons name="chevron-down" size={11} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNextMonth} style={s.arrowBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month Summary stats (Money Manager inspired) */}
      <View style={s.summaryStatsBar}>
        <View style={s.statCol}>
          <Text style={s.statColLabel}>Income</Text>
          <Text style={[s.statColVal, { color: "#10b981" }]}>₹{fmt(totalIncome)}</Text>
        </View>
        <View style={s.statColDivider} />
        <View style={s.statCol}>
          <Text style={s.statColLabel}>Expense</Text>
          <Text style={[s.statColVal, { color: "#f97316" }]}>₹{fmt(totalExpense)}</Text>
        </View>
        <View style={s.statColDivider} />
        <View style={s.statCol}>
          <Text style={s.statColLabel}>Total</Text>
          <Text style={[s.statColVal, { color: netBalance >= 0 ? colors.primary : colors.destructive }]}>
            {netBalance < 0 ? "-" : ""}₹{fmt(Math.abs(netBalance))}
          </Text>
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
                {isDark && (
                  <BlurView intensity={Platform.OS === "web" ? 0 : 85} tint="dark" style={StyleSheet.absoluteFill} />
                )}
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

              {(() => {
                if (editAmount.trim() && (editAmount.includes('+') || editAmount.includes('-') || editAmount.includes('*') || editAmount.includes('/'))) {
                  const resolved = evaluateMathExpression(editAmount);
                  if (resolved !== null && !isNaN(resolved) && resolved > 0) {
                    return (
                      <View style={s.mathPreviewContainer}>
                        <Ionicons name="calculator-outline" size={12} color={colors.primary} />
                        <Text style={s.mathPreviewText}>Total: ₹{Math.round(resolved).toLocaleString("en-IN")}</Text>
                      </View>
                    );
                  }
                }
                return null;
              })()}

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

      {lastDeleted && (lastDeleted.type === "expense" || lastDeleted.type === "split") && (
        <Animated.View style={[
          s.toastContainer, 
          { 
            transform: [{ translateY: toastY }], 
            opacity: toastOpacity,
            bottom: bottomPad + 76
          }
        ]}>
          <TouchableOpacity 
            style={s.toastContent} 
            onPress={async () => {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await undoDelete();
            }}
            activeOpacity={0.9}
          >
            <Text style={s.toastText}>Expense deleted.</Text>
            <Text style={s.undoText}>Tap to Undo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const histStyles = (colors: ReturnType<typeof useColors>, topPad: number) => {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    headerBg: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 280,
    },
    header: {
      backgroundColor: isDark ? "rgba(30, 41, 35, 0.45)" : "rgba(255, 255, 255, 0.65)",
      paddingTop: topPad + 18,
      paddingBottom: 16,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255, 255, 255, 0.12)" : colors.border,
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    headerTitle: { 
      fontSize: 26, 
      fontFamily: "Inter_700Bold", 
      color: isDark ? "#fff" : colors.foreground 
    },
    headerSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: isDark ? "rgba(255,255,255,0.65)" : colors.mutedForeground,
      marginTop: 5,
    },
    shareBtn: {
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.3)" : colors.border,
      backgroundColor: isDark ? "transparent" : colors.muted,
    },
    shareBtnBlur: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    shareBtnText: { 
      color: isDark ? "#fff" : colors.primary, 
      fontSize: 13, 
      fontFamily: "Inter_600SemiBold" 
    },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0, 0, 0, 0.05)",
      borderRadius: 13,
      paddingHorizontal: 13,
      height: 44,
      borderWidth: 1.5,
      borderColor: "transparent",
      overflow: "hidden",
    },
    searchFocused: {
      backgroundColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0, 0, 0, 0.08)",
      borderColor: colors.primary,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: isDark ? "#fff" : colors.foreground,
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
      backgroundColor: isDark ? "rgba(30, 41, 35, 0.45)" : colors.card,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : colors.border,
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
    mathPreviewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'center',
      backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      marginTop: -6,
      marginBottom: 16,
    },
    mathPreviewText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
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
    monthSelectorBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 14,
      paddingVertical: 2,
    },
    arrowBtn: {
      padding: 8,
      borderRadius: 8,
    },
    monthLabelBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    monthLabelText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    summaryStatsBar: {
      flexDirection: "row",
      backgroundColor: colors.card,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: "center",
      justifyContent: "space-around",
    },
    statCol: {
      alignItems: "center",
      flex: 1,
    },
    statColLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    statColVal: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      marginTop: 4,
    },
    statColDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    pickerCard: {
      backgroundColor: isDark ? "rgba(30, 41, 35, 0.65)" : colors.card,
      borderRadius: 24,
      padding: 20,
      width: "100%",
      maxWidth: 340,
      borderWidth: 1.5,
      borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
      overflow: "hidden",
    },
    pickerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 16,
    },
    pickerTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    yearSwitcher: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    yearArrow: {
      padding: 4,
    },
    yearText: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      minWidth: 40,
      textAlign: "center",
    },
    monthsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    monthGridCell: {
      width: "31%",
      height: 54,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
      marginBottom: 10,
    },
    monthGridCellActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "12",
    },
    monthNameText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 2,
    },
    monthNameTextActive: {
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    monthSpentText: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      textAlign: "center",
    },
    monthSpentTextActive: {
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    monthSpentTextValue: {
      color: colors.destructive,
    },
    monthSpentTextZero: {
      color: colors.mutedForeground,
    },
    pickerCloseBtn: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    pickerCloseBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    toastContainer: {
      position: "absolute",
      left: 20,
      right: 20,
      alignSelf: "center",
      zIndex: 9999,
    },
    toastContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: isDark ? "rgba(30, 41, 35, 0.95)" : "rgba(240, 249, 244, 0.95)",
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 6,
    },
    toastText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    undoText: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
  });
};

export default function HistoryScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <HistoryScreen />
    </ErrorBoundary>
  );
}
