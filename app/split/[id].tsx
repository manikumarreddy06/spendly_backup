import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  Clipboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, SplitExpense, SplitMode, parseGroupName } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import {
  getExpenseMemberShare,
  isExpenseSettledFor,
  isSameMember,
  resolveMemberInGroup,
  evaluateMathExpression,
} from "@/lib/split";

const CATEGORY_EMOJIS: Record<string, string> = {
  travel: "✈️",
  food: "🍔",
  shopping: "🛍️",
  entertainment: "🎮",
  healthcare: "🏥",
  others: "🧾",
};

const CATEGORIES = [
  { key: "travel", label: "Travel", icon: "airplane", color: "#10b981", bg: "#e6f7f0" },
  { key: "food", label: "Food", icon: "restaurant", color: "#f97316", bg: "#fff5e6" },
  { key: "shopping", label: "Shopping", icon: "bag-handle", color: "#a855f7", bg: "#f5ebff" },
  { key: "entertainment", label: "Fun", icon: "game-controller", color: "#ec4899", bg: "#fdf0f5" },
  { key: "healthcare", label: "Health", icon: "heart", color: "#ef4444", bg: "#fdebeb" },
  { key: "others", label: "Others", icon: "ellipsis-horizontal", color: "#6b7280", bg: "#f0f2f5" },
];

export default function SplitGroupDetail() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    splitGroups,
    addSplitExpense,
    settleUp,
    settleAllDebtsBetween,
    addGroupMember,
    removeGroupMember,
    getBalances,
    getSimplifiedBalances,
    deleteSplitExpense,
    profile,
    customCategories,
  } = useApp();

  const getCategoryVisuals = (catKey: string) => {
    const builtin = CATEGORIES.find((c) => c.key === catKey);
    if (builtin) {
      return {
        label: builtin.label,
        color: builtin.color,
        icon: builtin.icon,
        emoji: CATEGORY_EMOJIS[catKey] || "🧾",
        bg: builtin.bg,
      };
    }
    const custom = (customCategories || []).find((c) => c.id === catKey);
    if (custom) {
      return {
        label: custom.name,
        color: custom.color,
        icon: custom.icon,
        emoji: "🧾",
        bg: custom.color + "18",
      };
    }
    return {
      label: "Others",
      color: "#6b7280",
      icon: "ellipsis-horizontal",
      emoji: "🧾",
      bg: "#f0f2f5",
    };
  };

  const allCategories = useMemo(() => {
    const custom = (customCategories || []).map((c) => ({
      key: c.id,
      label: c.name,
      icon: c.icon,
      color: c.color,
      bg: c.color + "18",
    }));
    return [...CATEGORIES, ...custom];
  }, [customCategories]);

  const group = splitGroups.find((g) => g.id === id);

  // States for Add Expense Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [desc, setDesc] = useState("");
  const [totalAmt, setTotalAmt] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("others");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [lastUsedSettings, setLastUsedSettings] = useState<{
    splitMode: SplitMode;
    category: string;
    paidBy?: string;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    const loadLastUsedSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(`@last_settings_${id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            setLastUsedSettings({
              splitMode: (parsed.splitMode || "equal") as SplitMode,
              category: (parsed.category || "others") as string,
              paidBy: typeof parsed.paidBy === "string" ? parsed.paidBy : undefined,
            });
          }
        } else {
          setLastUsedSettings(null);
        }
      } catch (e) {
        console.error("Error loading last used settings:", e);
      }
    };
    loadLastUsedSettings();
  }, [id]);

  // Add Member Modal states
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberFocus, setNewMemberFocus] = useState(false);

  // Settle Up Modal/Bottom Sheet states
  const [settleSheetVisible, setSettleSheetVisible] = useState(false);
  const [settleFrom, setSettleFrom] = useState("");
  const [settleTo, setSettleTo] = useState("");
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleAmountInput, setSettleAmountInput] = useState("");

  const [showSimplified, setShowSimplified] = useState(true);
  const [showSimplifiedAll, setShowSimplifiedAll] = useState(false);
  const [showOtherDebts, setShowOtherDebts] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Mobile interaction states
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);

  // Search & Filter timeline states
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");

  const toggleCard = (expenseId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setExpandedCards((prev) => ({ ...prev, [expenseId]: !prev[expenseId] }));
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!group) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 15, fontFamily: "Inter_400Regular" }}>Group not found.</Text>
      </View>
    );
  }

  const { name: cleanName, emoji, coverColor } = parseGroupName(group.name);
  const balances = getBalances(group);
  const simplified = getSimplifiedBalances(group);
  const myName = profile?.name ?? "You";
  const meInGroup = resolveMemberInGroup(myName, group.members) ?? myName;
  const myBalance = balances[meInGroup] ?? 0;

  const userInvolvedDebts = useMemo(() => {
    return simplified.filter(
      (payment) =>
        isSameMember(payment.from, myName, group.members) ||
        isSameMember(payment.to, myName, group.members)
    );
  }, [simplified, myName, group.members]);

  const otherDebts = useMemo(() => {
    return simplified.filter(
      (payment) =>
        !isSameMember(payment.from, myName, group.members) &&
        !isSameMember(payment.to, myName, group.members)
    );
  }, [simplified, myName, group.members]);

  // Calculate Group Total Spent (exclude settlements)
  const totalSpent = (group.expenses || [])
    .filter((e) => e.category !== "settlement")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  // Calculate spending per category (exclude settlements)
  const categoryTotals = (group.expenses || [])
    .filter((e) => e.category !== "settlement")
    .reduce<Record<string, number>>((acc, e) => {
      const cat = e.category || "others";
      acc[cat] = (acc[cat] ?? 0) + e.totalAmount;
      return acc;
    }, {});

  // Filtered expenses based on search and category tab, sorted newest first
  const filteredExpenses = (group.expenses || [])
    .filter((exp) => {
      const matchesSearch = exp.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategoryFilter === "all" || exp.category === activeCategoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const openModal = () => {
    setDesc("");
    setTotalAmt("");
    
    // Smart Default Payer Selection: Find the member who paid most often historically (ignoring settlements)
    const payerCounts = (group.expenses || [])
      .filter((e) => e.category !== "settlement")
      .reduce<Record<string, number>>((acc, e) => {
        acc[e.paidBy] = (acc[e.paidBy] || 0) + 1;
        return acc;
      }, {});
    
    let defaultPayer =
      (lastUsedSettings?.paidBy && group.members.includes(lastUsedSettings.paidBy)
        ? lastUsedSettings.paidBy
        : resolveMemberInGroup(profile?.name ?? "You", group.members)) ??
      group.members[0] ??
      "";
    let maxCount = 0;
    Object.entries(payerCounts).forEach(([payer, count]) => {
      if (count > maxCount && group.members.includes(payer)) {
        maxCount = count;
        defaultPayer = payer;
      }
    });
    setPaidBy(defaultPayer);
    
    setSplitAmong([...group.members]);

    // Use last-used settings if they exist, otherwise default to equal split and others category
    const initialSplitMode = lastUsedSettings?.splitMode ?? "equal";
    const initialCategory = lastUsedSettings?.category ?? "others";
    setSplitMode(initialSplitMode);
    setSelectedCategory(initialCategory);

    // Pre-populate customShares for percentage split mode
    const nextShares: Record<string, string> = {};
    if (initialSplitMode === "percentage" && group.members.length > 0) {
      const eq = (100 / group.members.length).toFixed(1);
      group.members.forEach((m) => {
        nextShares[m] = eq;
      });
    }
    setCustomShares(nextShares);

    setShowCategoryPicker(false);
    setFocusedField(null);
    setModalVisible(true);
  };

  const handleAdd = async () => {
    const resolvedAmt = evaluateMathExpression(totalAmt);
    const amt = resolvedAmt !== null ? resolvedAmt : parseFloat(totalAmt);
    if (!totalAmt || isNaN(amt) || amt <= 0) { Alert.alert("Invalid amount", "Please enter a valid amount."); return; }
    if (!paidBy) { Alert.alert("Select Payer", "Select who paid for this expense."); return; }
    if (splitAmong.length === 0) { Alert.alert("Select members", "Select at least one member to split with."); return; }
    const fallbackDesc = getCategoryVisuals(selectedCategory).label;
    const finalDesc = desc.trim() || fallbackDesc;

    if (splitMode !== "equal") {
      const shares = splitAmong.reduce<Record<string, number>>((acc, m) => {
        const val = parseFloat(customShares[m] ?? "0");
        if (isNaN(val) || val <= 0) acc[m] = 0;
        else acc[m] = val;
        return acc;
      }, {});

      const hasAllValid = splitAmong.every((m) => (shares[m] ?? 0) > 0);
      if (!hasAllValid) {
        Alert.alert("Invalid shares", "Enter a valid amount/percentage for every member.");
        return;
      }

      if (splitMode === "percentage") {
        const total = Object.values(shares).reduce((s, v) => s + v, 0);
        if (Math.abs(total - 100) > 1) {
          Alert.alert("Percentages don't add up", `Total: ${total}%. Must equal 100%.`);
          return;
        }
      } else if (splitMode === "custom") {
        const total = Object.values(shares).reduce((s, v) => s + v, 0);
        if (Math.abs(total - amt) > 1) {
          Alert.alert("Amounts don't add up", `Total: ₹${total}. Must equal ₹${amt}.`);
          return;
        }
      }

      try {
        await addSplitExpense(group.id, {
          description: finalDesc,
          totalAmount: amt,
          paidBy,
          splitAmong,
          customShares: shares,
          splitMode,
          category: selectedCategory,
          date: new Date().toISOString(),
        });
      } catch (err: any) {
        Alert.alert("Split Error", err.message || "Could not add expense.");
        return;
      }
    } else {
      try {
        await addSplitExpense(group.id, {
          description: finalDesc,
          totalAmount: amt,
          paidBy,
          splitAmong,
          splitMode: "equal",
          category: selectedCategory,
          date: new Date().toISOString(),
        });
      } catch (err: any) {
        Alert.alert("Split Error", err.message || "Could not add expense.");
        return;
      }
    }
    try {
      const settings = { splitMode, category: selectedCategory, paidBy };
      await AsyncStorage.setItem(`@last_settings_${group.id}`, JSON.stringify(settings));
      setLastUsedSettings(settings);
    } catch (e) {
      console.error("Failed to save split settings", e);
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModalVisible(false);
  };

  const handleShare = async () => {
    const lines: string[] = [];
    lines.push(`Spendly Split Group: ${cleanName}`);
    lines.push(`Members: ${group.members.join(", ")}`);
    lines.push("");

    lines.push("Balances:");
    group.members.forEach((m) => {
      const bal = balances[m] ?? 0;
      if (bal > 0) lines.push(`  ${m}: gets back ₹${bal.toFixed(0)}`);
      else if (bal < 0) lines.push(`  ${m}: owes ₹${Math.abs(bal).toFixed(0)}`);
      else lines.push(`  ${m}: settled`);
    });

    lines.push("");
    lines.push(`Invite Code: ${group.id}`);
    lines.push("");
    lines.push("Join via Spendly Split tab -> Join Group!");

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({ message: lines.join("\n") });
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) { Alert.alert("Missing name", "Enter a member name."); return; }
    if (
      group.members.some(
        (m) => m.trim().toLowerCase() === name.toLowerCase()
      )
    ) {
      Alert.alert("Already a member", `${name} is already in this group.`);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addGroupMember(group.id, name);
    setNewMemberName("");
    setInviteSheetVisible(false);
  };

  const handleRemoveMember = (member: string) => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${member} from this group?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const success = await removeGroupMember(group.id, member);
            if (success) {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", `${member} was removed from the group.`);
            } else {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Cannot Remove Member", `${member} has unsettled balances and cannot be removed.`);
            }
          },
        },
      ]
    );
  };

  const handleSettle = async (exp: SplitExpense, member: string) => {
    Alert.alert(
      "Settle Expense",
      `Mark ${member} as settled for "${exp.description}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle",
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await settleUp(group.id, exp.id, member);
          },
        },
      ]
    );
  };

  const handleDeleteExpense = (exp: SplitExpense) => {
    Alert.alert(
      "Delete Expense",
      `Delete "${exp.description}" (₹${exp.totalAmount.toLocaleString("en-IN")})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deleteSplitExpense(group.id, exp.id);
          },
        },
      ]
    );
  };

  const handleSettleAll = async (from: string, to: string, amount: number) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await settleAllDebtsBetween(group.id, from, to, amount);
    setSettleSheetVisible(false);
    Alert.alert("Success", `Debts from ${from} to ${to} are now marked settled.`);
  };

  const handleAllocateEqually = () => {
    if (splitAmong.length === 0) {
      Alert.alert("No members selected", "Select members to split among.");
      return;
    }
    const amtVal = parseFloat(totalAmt) || 0;
    const nextShares: Record<string, string> = {};
    if (splitMode === "percentage") {
      const eq = (100 / splitAmong.length).toFixed(1);
      splitAmong.forEach((m) => {
        nextShares[m] = eq;
      });
    } else if (splitMode === "custom") {
      if (amtVal <= 0) {
        Alert.alert("Invalid amount", "Enter a total amount first to allocate equally.");
        return;
      }
      const eq = (amtVal / splitAmong.length).toFixed(1);
      splitAmong.forEach((m) => {
        nextShares[m] = eq;
      });
    }
    setCustomShares(nextShares);
  };

  const s = detailStyles(colors, topPad, bottomPad);

  // Sum calculations for Add Expense custom entries
  const amtValue = parseFloat(totalAmt) || 0;
  let remainingText = "";
  let isBalanced = true;
  let allocatedSum = 0;

  if (splitMode === "percentage") {
    allocatedSum = splitAmong.reduce((sum, m) => sum + (parseFloat(customShares[m] ?? "0") || 0), 0);
    const remPct = 100 - allocatedSum;
    isBalanced = Math.abs(remPct) < 0.01;
    if (!isBalanced) {
      remainingText = `${remPct > 0 ? "Remaining" : "Over allocated"}: ${Math.abs(remPct).toFixed(0)}% of 100%`;
    } else {
      remainingText = "Balanced: 100% allocated";
    }
  } else if (splitMode === "custom") {
    allocatedSum = splitAmong.reduce((sum, m) => sum + (parseFloat(customShares[m] ?? "0") || 0), 0);
    const remAmt = amtValue - allocatedSum;
    isBalanced = Math.abs(remAmt) < 0.01;
    if (!isBalanced) {
      remainingText = `${remAmt > 0 ? "Remaining" : "Over allocated"}: ₹${Math.abs(remAmt).toLocaleString("en-IN")} of ₹${amtValue.toLocaleString("en-IN")}`;
    } else {
      remainingText = "Balanced: All expenses allocated";
    }
  }

  // Count fully settled group status
  const isFullySettled = Object.values(balances).every((val) => Math.abs(val) < 0.5);

  return (
    <View style={s.root}>
      {/* Lightweight cover hero header */}
      <LinearGradient 
        colors={[coverColor, coverColor + "dd"]} 
        style={[s.header, { paddingTop: topPad + 10, paddingBottom: 14 }]}
      >
        <View style={s.headerTopRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
              <Text style={s.groupName}>{cleanName}</Text>
            </View>
            <View style={s.headerSubRow}>
              {/* Member avatars */}
              <View style={s.memberAvatarsRow}>
                {group.members.slice(0, 3).map((m, idx) => (
                  <View 
                    key={m} 
                    style={[
                      s.memberAvatar,
                      { 
                        backgroundColor: "rgba(255,255,255,0.25)",
                        marginLeft: idx > 0 ? -4 : 0
                      }
                    ]}
                  >
                    <Text style={s.memberAvatarText}>{m[0].toUpperCase()}</Text>
                  </View>
                ))}
                {group.members.length > 3 && (
                  <View style={[s.memberAvatar, { backgroundColor: "rgba(255,255,255,0.4)", marginLeft: -4 }]}>
                    <Text style={s.memberAvatarText}>+{group.members.length - 3}</Text>
                  </View>
                )}
              </View>
              <Text style={s.headerSeparator}>·</Text>
              {/* Balance hint */}
              <Text style={s.balanceHint}>
                {myBalance > 0 
                  ? `You are owed ₹${myBalance.toFixed(0)}` 
                  : myBalance < 0 
                    ? `You owe ₹${Math.abs(myBalance).toFixed(0)}` 
                    : "All settled up"
                }
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Who Owes Whom Simplified Collapsible Panel */}
        {!isFullySettled && simplified.length > 0 && (
          <View style={s.simplifiedDebtsSection}>
            <View style={s.simplifiedDebtsHeader}>
              <Text style={s.sectionTitle}>Who owes whom</Text>
            </View>
            <View style={s.simplifiedDebtsCard}>
              {userInvolvedDebts.length === 0 ? (
                <View style={{ padding: 14, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    🎉 You are all settled up with everyone!
                  </Text>
                </View>
              ) : (
                userInvolvedDebts.map((payment, index) => {
                  const isIowe = isSameMember(payment.from, myName, group.members);
                  const isIget = isSameMember(payment.to, myName, group.members);
                  
                  let textContent = "";
                  let highlightColor = colors.foreground;
                  if (isIowe) {
                    textContent = `You owe ${payment.to} ₹${Math.round(payment.amount).toLocaleString("en-IN")}`;
                    highlightColor = colors.destructive;
                  } else if (isIget) {
                    textContent = `${payment.from} pays You ₹${Math.round(payment.amount).toLocaleString("en-IN")}`;
                    highlightColor = colors.primary;
                  }

                  return (
                    <View key={`${payment.from}-${payment.to}-${index}`} style={[s.simplifiedDebtRow, index > 0 && s.simplifiedDebtRowDivider]}>
                      <View style={s.simplifiedDebtTextCol}>
                        <Ionicons
                          name={isIowe ? "arrow-forward" : "checkmark-circle-outline"}
                          size={16}
                          color={isIowe ? colors.destructive : colors.primary}
                        />
                        <Text style={[s.simplifiedDebtText, { color: highlightColor }]}>
                          {textContent}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setSettleFrom(payment.from);
                          setSettleTo(payment.to);
                          setSettleAmount(payment.amount);
                          setSettleAmountInput(Math.round(payment.amount).toString());
                          setSettleSheetVisible(true);
                        }}
                        style={s.simplifiedDebtSettleBtn}
                      >
                        <Text style={s.simplifiedDebtSettleText}>Settle</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              {/* Collapsible Other Debts Section */}
              {otherDebts.length > 0 && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowOtherDebts(!showOtherDebts);
                    }}
                    style={[
                      s.collapsibleHeader,
                      userInvolvedDebts.length > 0 && { borderTopWidth: 1, borderTopColor: colors.border }
                    ]}
                  >
                    <Ionicons name="people-outline" size={16} color={colors.mutedForeground} />
                    <Text style={s.collapsibleHeaderText}>All group balances ({otherDebts.length})</Text>
                    <Ionicons 
                      name={showOtherDebts ? "chevron-up" : "chevron-down"} 
                      size={16} 
                      color={colors.mutedForeground} 
                      style={{ marginLeft: "auto" }} 
                    />
                  </TouchableOpacity>

                  {showOtherDebts && (
                    <View style={s.collapsibleContent}>
                      {otherDebts.map((payment, index) => {
                        const textContent = `${payment.from} pays ${payment.to} ₹${Math.round(payment.amount).toLocaleString("en-IN")}`;
                        return (
                          <View key={`${payment.from}-${payment.to}-${index}`} style={[s.simplifiedDebtRow, index > 0 && s.simplifiedDebtRowDivider]}>
                            <View style={s.simplifiedDebtTextCol}>
                              <Ionicons
                                name="arrow-forward"
                                size={14}
                                color={colors.mutedForeground}
                              />
                              <Text style={[s.simplifiedDebtText, { color: colors.foreground }]}>
                                {textContent}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                setSettleFrom(payment.from);
                                setSettleTo(payment.to);
                                setSettleAmount(payment.amount);
                                setSettleAmountInput(Math.round(payment.amount).toString());
                                setSettleSheetVisible(true);
                              }}
                              style={s.simplifiedDebtSettleBtn}
                            >
                              <Text style={s.simplifiedDebtSettleText}>Settle</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* Settled Empty State inside group detail */}
        {isFullySettled && (
          <View style={s.settledEmptyCard}>
            <LinearGradient
              colors={[colors.primary + "10", colors.primary + "03"]}
              style={s.settledEmptyGradient}
            >
              <View style={s.settledSparkleBg}>
                <Ionicons name="sparkles" size={22} color={colors.primary} />
              </View>
              <Text style={s.settledEmptyTitle}>All balances are settled!</Text>
              <Text style={s.settledEmptySub}>No pending payments in this group. Everyone is even.</Text>
              <View style={s.settledEmptyActions}>
                <TouchableOpacity
                  onPress={openModal}
                  style={s.settledEmptyBtnPrimary}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={s.settledEmptyBtnTextPrimary}>Add Expense</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setNewMemberName("");
                    setInviteSheetVisible(true);
                  }}
                  style={s.settledEmptyBtnSecondary}
                >
                  <Ionicons name="person-add-outline" size={14} color={colors.primary} />
                  <Text style={s.settledEmptyBtnTextSecondary}>Invite Friends</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        )}
        
        {/* Group Spending Breakdown */}
        {totalSpent > 0 && (
          <View style={s.breakdownSection}>
            <Text style={s.sectionTitle}>Group Spending Breakdown</Text>
            <View style={s.breakdownCard}>
              <Text style={s.breakdownTotalText}>
                Total Spent: <Text style={s.boldText}>₹{totalSpent.toLocaleString("en-IN")}</Text>
              </Text>
              <View style={s.breakdownBarsWrap}>
                {Object.entries(categoryTotals).map(([cat, amount]) => {
                  const catMeta = getCategoryVisuals(cat);
                  const pct = (amount / totalSpent) * 100;
                  return (
                    <View key={cat} style={s.breakdownRow}>
                      <View style={s.breakdownLabelRow}>
                        <Text style={s.breakdownLabel}>
                          {catMeta.emoji} {catMeta.label}
                        </Text>
                        <Text style={s.breakdownValue}>
                          ₹{amount.toLocaleString("en-IN")} ({pct.toFixed(0)}%)
                        </Text>
                      </View>
                      <View style={s.progressBarBackground}>
                        <View style={[s.progressBarFill, { width: `${pct}%`, backgroundColor: catMeta.color }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
            <View style={s.sectionDivider} />
          </View>
        )}

        {/* Section 1: Timeline Expense Feed (Priority Content) */}
        <View style={s.timelineSectionHeader}>
          <Text style={s.sectionTitle}>Shared Expense Timeline</Text>
          {group.expenses.length > 0 && (
            <TouchableOpacity 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setShowSearch(!showSearch);
                if (showSearch) setSearchQuery("");
              }}
              style={s.timelineSearchToggleBtn}
              testID="button-toggle-search"
            >
              <Ionicons name="search-outline" size={18} color={showSearch ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        {group.expenses.length > 0 && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterScroll}
              style={{ marginBottom: 12 }}
            >
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setActiveCategoryFilter("all");
                }}
                style={[
                  s.filterPill,
                  activeCategoryFilter === "all" && s.filterPillActive,
                ]}
              >
                <Text
                  style={[
                    s.filterPillText,
                    activeCategoryFilter === "all" && s.filterPillTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {allCategories.map((cat) => {
                const isActive = activeCategoryFilter === cat.key;
                const catVisuals = getCategoryVisuals(cat.key);
                return (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setActiveCategoryFilter(cat.key);
                    }}
                    style={[
                      s.filterPill,
                      isActive && {
                        borderColor: catVisuals.color,
                        backgroundColor: catVisuals.color + "12",
                      },
                    ]}
                  >
                    <Text style={{ marginRight: 4 }}>{catVisuals.emoji}</Text>
                    <Text
                      style={[
                        s.filterPillText,
                        isActive && { color: catVisuals.color, fontFamily: "Inter_600SemiBold" },
                      ]}
                    >
                      {catVisuals.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {showSearch && (
              <View style={s.searchBarContainer}>
                <Ionicons name="search-outline" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  style={s.searchBarInput}
                  placeholder="Search expenses..."
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} style={{ marginRight: 4 }} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}

        {(!group.expenses || group.expenses.length === 0) ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={24} color={colors.mutedForeground} />
            </View>
            <Text style={s.emptyText}>Shared timeline is empty.</Text>
            <Text style={[s.emptyText, { fontSize: 12, marginTop: 4 }]}>Tap 'Add Expense' below to log a transaction.</Text>
          </View>
        ) : filteredExpenses.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconCircle}>
              <Ionicons name="search-outline" size={24} color={colors.mutedForeground} />
            </View>
            <Text style={s.emptyText}>No matching expenses found.</Text>
            <Text style={[s.emptyText, { fontSize: 12, marginTop: 4 }]}>Try adjusting your search query or category filter.</Text>
          </View>
        ) : (
          filteredExpenses.map((exp) => {
            if (exp.category === "settlement") {
              return (
                <View 
                  key={exp.id} 
                  testID={`card-split-expense-${exp.id}`} 
                  style={[s.timelineCard, s.timelineSettlementCard]}
                >
                  <View style={s.timelineCardTop}>
                    <View style={[s.catIconBg, { backgroundColor: colors.muted }]}>
                      <Text style={{ fontSize: 16 }}>🤝</Text>
                    </View>
                    
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[s.expenseDesc, s.settlementDesc]}>
                        {exp.description}
                      </Text>
                      <Text style={s.expenseMeta}>
                        Settled ₹{exp.totalAmount.toLocaleString("en-IN")}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", marginRight: 4 }}>
                      <Text style={s.expenseDate}>
                        {new Date(exp.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </Text>
                    </View>

                    <TouchableOpacity
                      testID={`button-delete-expense-${exp.id}`}
                      onPress={() => handleDeleteExpense(exp)}
                      style={s.trashBtn}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            const others = exp.splitAmong.filter(
              (m) => !isSameMember(m, exp.paidBy, group.members)
            );
            const settledCount = others.filter((m) => isExpenseSettledFor(exp, m, group.members)).length;
            const allSettled = others.length > 0 && settledCount === others.length;
            const partiallySettled = settledCount > 0 && settledCount < others.length;
            const catVisuals = getCategoryVisuals(exp.category || "others");
            const totalSplitCount = exp.splitAmong.length;
            const isCardExpanded = !!expandedCards[exp.id];

            return (
              <Pressable 
                key={exp.id} 
                testID={`card-split-expense-${exp.id}`} 
                onPress={() => toggleCard(exp.id)}
                style={[s.timelineCard, allSettled && s.expCardSettled]}
              >
                <View style={s.timelineCardTop}>
                  <View style={[s.catIconBg, { backgroundColor: catVisuals.color + "12" }]}>
                    <Text style={{ fontSize: 18 }}>{catVisuals.emoji}</Text>
                  </View>
                  
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={s.timelineCardHeaderRow}>
                      <Text style={[s.expenseDesc, allSettled && s.textStrikethrough]}>{exp.description}</Text>
                      
                      {/* Status Badge Pill */}
                      <View style={[
                        s.badgePill,
                        allSettled 
                          ? s.badgeSettled 
                          : partiallySettled 
                            ? s.badgePartiallySettled 
                            : s.badgeUnsettled
                      ]}>
                        <Text style={[
                          s.badgeText,
                          allSettled 
                            ? { color: colors.primary } 
                            : partiallySettled 
                              ? { color: "#f97316" } 
                              : { color: colors.mutedForeground }
                        ]}>
                          {allSettled ? "Settled" : partiallySettled ? "Partially Settled" : "Unsettled"}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={s.timelineCardMetaRow}>
                      <Text style={s.expenseMeta}>
                        {exp.paidBy} paid <Text style={s.boldText}>₹{exp.totalAmount.toLocaleString("en-IN")}</Text> · Split among {totalSplitCount}
                      </Text>
                      <Text style={s.expenseDate}>
                        {new Date(exp.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    testID={`button-delete-expense-${exp.id}`}
                    onPress={() => handleDeleteExpense(exp)}
                    style={s.trashBtn}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Sub owed breakdown line if card is expanded and not fully settled */}
                {isCardExpanded && others.length > 0 && !allSettled && (
                  <View style={s.splitOweBreakdown}>
                    {others.map((member) => {
                      const isSettled = isExpenseSettledFor(exp, member, group.members);
                      const share = getExpenseMemberShare(exp, member, group.members);
                      const shareText = `₹${Math.round(share).toLocaleString("en-IN")}`;

                      return (
                        <View key={member} style={s.owesRowItem}>
                          <Ionicons 
                            name={isSettled ? "checkmark-circle" : "ellipse-outline"} 
                            size={14} 
                            color={isSettled ? colors.primary : colors.mutedForeground} 
                          />
                          <Text style={[s.owesTextText, isSettled && s.textStrikethrough]}>
                            {member} {isSettled ? "has settled" : `still owes ${shareText}`}
                          </Text>
                          {!isSettled && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <TouchableOpacity
                                testID={`button-settle-direct-${exp.id}-${member}`}
                                onPress={async () => {
                                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                                  await settleUp(group.id, exp.id, member);
                                }}
                                style={s.inlineDirectSettleBtn}
                              >
                                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                              </TouchableOpacity>

                              <TouchableOpacity
                                testID={`button-settle-${exp.id}-${member}`}
                                onPress={() => handleSettle(exp, member)}
                                style={s.inlineSettleBtn}
                              >
                                <Text style={s.inlineSettleText}>Settle</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {isCardExpanded && allSettled && (
                  <View style={s.timelineSettledBanner}>
                    <Ionicons name="checkmark-done-circle" size={14} color={colors.primary} />
                    <Text style={s.settledText}>Fully Settled</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        <View style={s.sectionDivider} />

        {/* Section 2: Balances & Simplified Settlements (Below timeline) */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Balances & Settlement</Text>
          {simplified.length > 0 && (
            <TouchableOpacity onPress={() => setShowSimplified(!showSimplified)}>
              <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
                {showSimplified ? "Show Raw" : "Show Simplified"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isFullySettled ? (
          <View style={s.settledAllCard}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.primary} />
            <Text style={s.settledAllText}>✅ All settled up</Text>
          </View>
        ) : showSimplified && simplified.length > 0 ? (
          /* Simplified debts list */
          <View style={s.balancesCard}>
            {simplified.map((payment, i) => (
              <View key={`${payment.from}-${payment.to}`} style={[s.balanceRow, i > 0 && s.balDivider]}>
                <View style={{ flex: 1 }}>
                  <View style={s.paymentPathRow}>
                    <Text style={s.debtorName}>{payment.from}</Text>
                    <Ionicons name="arrow-forward-outline" size={12} color={colors.destructive} style={{ marginHorizontal: 6 }} />
                    <Text style={s.creditorName}>{payment.to}</Text>
                  </View>
                  <Text style={s.debtAmount}>owes ₹{payment.amount.toLocaleString("en-IN")}</Text>
                </View>
                
                <TouchableOpacity
                  onPress={() => {
                    setSettleFrom(payment.from);
                    setSettleTo(payment.to);
                    setSettleAmount(payment.amount);
                    setSettleAmountInput(Math.round(payment.amount).toString());
                    setSettleSheetVisible(true);
                  }}
                  style={s.settleUpBtn}
                >
                  <Text style={s.settleUpBtnText}>Settle Up</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          /* Raw balances list */
          <View style={s.balancesCard}>
            {group.members.map((member, i) => {
              const bal = balances[member] ?? 0;
              return (
                <View key={member} style={[s.balanceRow, i > 0 && s.balDivider]}>
                  <View style={[s.avatarCircle, { backgroundColor: bal > 0 ? colors.primary + "15" : bal < 0 ? colors.destructive + "15" : colors.muted }]}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: bal > 0 ? colors.primary : bal < 0 ? colors.destructive : colors.mutedForeground }}>
                      {member[0].toUpperCase()}
                    </Text>
                  </View>
                  
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.memberNameText}>{member}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                      {bal > 0 ? "gets back" : bal < 0 ? "owes" : "settled"}
                    </Text>
                  </View>

                  <Text style={[s.memberBalanceText, { color: bal > 0 ? colors.primary : bal < 0 ? colors.destructive : colors.mutedForeground }]}>
                    {bal === 0 ? "" : bal > 0 ? "+" : "-"}₹{Math.abs(bal).toFixed(0)}
                  </Text>

                  {group.members.length > 1 && !isSameMember(member, myName, group.members) && (
                    Math.abs(bal) >= 0.1 ? (
                      <View style={s.settleFirstBadge}>
                        <Text style={s.settleFirstText}>Settle first</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleRemoveMember(member)}
                        style={s.removeMemberBtn}
                        testID={`button-remove-member-${member}`}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.destructive} />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: bottomPad + 40 }} />
      </ScrollView>

      {/* Settle Up Bottom Sheet Modal */}
      <Modal
        visible={settleSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSettleSheetVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setSettleSheetVisible(false)} />
        <View style={[s.sheet, { paddingBottom: bottomPad + 24 }]}>
          <View style={s.sheetHandle} />
          
          <Text style={s.sheetTitle}>Confirm Settlement</Text>
          <Text style={s.settleModalSub}>
            Marks all unsettled expenses between these members as paid. Amount shown is the simplified balance.
          </Text>

          <View style={s.settleFlowCard}>
            <View style={s.settlePerson}>
              <View style={[s.settleAvatar, { backgroundColor: colors.destructive + "15" }]}>
                <Text style={{ color: colors.destructive, fontWeight: "bold" }}>{settleFrom[0]?.toUpperCase()}</Text>
              </View>
              <Text style={s.settleName}>{settleFrom}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Payer</Text>
            </View>

            <Ionicons name="arrow-forward" size={24} color={colors.primary} />

            <View style={s.settlePerson}>
              <View style={[s.settleAvatar, { backgroundColor: colors.primary + "15" }]}>
                <Text style={{ color: colors.primary, fontWeight: "bold" }}>{settleTo[0]?.toUpperCase()}</Text>
              </View>
              <Text style={s.settleName}>{settleTo}</Text>
              <Text style={{ fontSize: 10, color: colors.mutedForeground }}>Receiver</Text>
            </View>
          </View>

          <Text style={s.fLabel}>Settlement Amount</Text>
          <View style={s.fAmtWrap}>
            <Text style={s.fRupee}>₹</Text>
            <TextInput
              style={s.fAmtInput}
              keyboardType="numeric"
              value={settleAmountInput}
              onChangeText={setSettleAmountInput}
              placeholder="0"
            />
          </View>
 
          <TouchableOpacity
            onPress={() => {
              const parsedVal = parseFloat(settleAmountInput) || 0;
              handleSettleAll(settleFrom, settleTo, parsedVal);
            }}
            style={[s.confirmSettleBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={s.confirmSettleText}>Confirm Settlement & Sync</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Add Expense Modal (Premium Bottom Sheet) */}
      <Modal 
        visible={modalVisible} 
        animationType="slide" 
        transparent 
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[s.sheet, { paddingBottom: bottomPad + 12 }]}>
            <View style={s.sheetHandle} />
            
            <Text style={s.sheetTitle}>New Shared Expense</Text>
          
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
            {/* Amount input block at top */}
            <View style={s.largeAmountBlock}>
              <Text style={s.largeRupeeSymbol}>₹</Text>
              <TextInput
                testID="input-split-amount"
                style={s.largeAmtInput}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground + "aa"}
                value={totalAmt}
                onChangeText={setTotalAmt}
                keyboardType="numbers-and-punctuation"
                autoFocus
                onBlur={() => {
                  if (totalAmt.trim()) {
                    const resolved = evaluateMathExpression(totalAmt);
                    if (resolved !== null) {
                      setTotalAmt(resolved.toFixed(2));
                    }
                  }
                }}
              />
            </View>

            {/* Title / Description */}
            <View style={[s.sheetInputWrap, focusedField === "desc" && s.inputFocused]}>
              <Ionicons
                name="create-outline"
                size={18}
                color={focusedField === "desc" ? colors.primary : colors.mutedForeground}
                style={{ marginRight: 8 }}
              />
              <TextInput
                testID="input-split-description"
                style={s.sheetTextInput}
                placeholder="What is this expense for? (e.g. Dinner, Rent)"
                placeholderTextColor={colors.mutedForeground}
                value={desc}
                onChangeText={setDesc}
                onFocus={() => setFocusedField("desc")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {/* Category picker row (Always visible for discoverability) */}
            <Text style={s.fLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.catPickerScroll}
              style={{ marginBottom: 12, marginTop: 4 }}
            >
              {allCategories.map((cat) => {
                const isSelected = selectedCategory === cat.key;
                const catVisuals = getCategoryVisuals(cat.key);
                return (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => setSelectedCategory(cat.key)}
                    style={[
                      s.catPickerItem,
                      isSelected && { borderColor: catVisuals.color, backgroundColor: catVisuals.color + "12" },
                    ]}
                  >
                    <Ionicons
                      name={catVisuals.icon as any}
                      size={16}
                      color={isSelected ? catVisuals.color : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        s.catPickerText,
                        { color: isSelected ? catVisuals.color : colors.mutedForeground },
                      ]}
                    >
                      {catVisuals.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Paid By Selector Pills */}
            <Text style={s.fLabel}>PAID BY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paidByScroll}>
              {group.members.map((member) => {
                const isSelected = paidBy === member;
                return (
                  <TouchableOpacity
                    key={member}
                    testID={`button-paid-by-${member}`}
                    onPress={() => setPaidBy(member)}
                    style={[
                      s.paidByPill,
                      isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + "12" }
                    ]}
                  >
                    <View style={[s.pillAvatar, { backgroundColor: isSelected ? colors.primary : colors.mutedForeground }]}>
                      <Text style={s.pillAvatarText}>{member[0].toUpperCase()}</Text>
                    </View>
                    <Text style={[s.paidByText, isSelected && { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>
                      {member}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Split Mode segmented controls */}
            <Text style={s.fLabel}>SPLIT MODE</Text>
            <View style={s.modePickerRow}>
              {["equal", "percentage", "custom"].map((mode) => {
                const isActive = splitMode === mode;
                const modeLabel = mode === "equal" ? "Equal" : mode === "percentage" ? "Percentage" : "Custom";
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSplitMode(mode as SplitMode);

                      // Auto pre-populate shares evenly when switching modes
                      if (splitAmong.length > 0) {
                        const nextShares: Record<string, string> = {};
                        if (mode === "percentage") {
                          const eq = (100 / splitAmong.length).toFixed(1);
                          splitAmong.forEach((m) => {
                            nextShares[m] = eq;
                          });
                          setCustomShares(nextShares);
                        } else if (mode === "custom") {
                          const amtVal = parseFloat(totalAmt) || 0;
                          if (amtVal > 0) {
                            const eq = (amtVal / splitAmong.length).toFixed(1);
                            splitAmong.forEach((m) => {
                              nextShares[m] = eq;
                            });
                            setCustomShares(nextShares);
                          }
                        }
                      }
                    }}
                    style={[s.modeOption, isActive && s.modeOptionActive]}
                  >
                    <Text style={[s.modeOptionText, isActive && s.modeOptionTextActive]}>
                      {modeLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Live feedback mathematics card */}
            {splitMode !== "equal" && (
              <View style={[s.liveFeedbackCard, { borderColor: isBalanced ? colors.primary + "50" : colors.destructive + "50", backgroundColor: isBalanced ? colors.primary + "0d" : colors.destructive + "0d" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.liveFeedbackTitle, { color: isBalanced ? colors.primary : colors.destructive }]}>
                    {isBalanced ? "Allocation Balanced" : "Allocation Pending"}
                  </Text>
                  <Text style={[s.liveFeedbackText, { color: isBalanced ? colors.primary : colors.destructive }]}>
                    {remainingText}
                  </Text>
                </View>
                <TouchableOpacity onPress={handleAllocateEqually} style={s.allocateEqBtn}>
                  <Text style={s.allocateEqBtnText}>Allocate Evenly</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Split Among avatar checkboxes */}
            <Text style={s.fLabel}>SPLIT AMONG</Text>
            <View style={s.splitAmongContainer}>
              {group.members.map((member) => {
                const isChecked = splitAmong.includes(member);
                const showInput = splitMode !== "equal" && isChecked;
                
                return (
                  <View key={member} style={s.splitAmongMemberRow}>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        if (isChecked) setSplitAmong((prev) => prev.filter((x) => x !== member));
                        else setSplitAmong((prev) => [...prev, member]);
                      }}
                      style={[s.splitAmongAvatarCircle, isChecked && { borderColor: colors.primary, backgroundColor: colors.primary + "12" }]}
                    >
                      <View style={[s.memberDotInitials, { backgroundColor: isChecked ? colors.primary : colors.mutedForeground }]}>
                        <Text style={s.memberDotInitialsText}>{member[0].toUpperCase()}</Text>
                      </View>
                      <Text style={[s.memberDotName, isChecked && { fontFamily: "Inter_600SemiBold", color: colors.primary }]}>
                        {member}
                      </Text>
                    </TouchableOpacity>

                    {showInput && (
                      <View style={s.splitShareInputWrap}>
                        {splitMode === "custom" && (
                          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginRight: 2 }}>
                            ₹
                          </Text>
                        )}
                        <TextInput
                          style={s.splitShareTextInput}
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="decimal-pad"
                          value={customShares[member] ?? ""}
                          onChangeText={(v) => setCustomShares((prev) => ({ ...prev, [member]: v }))}
                        />
                        {splitMode === "percentage" && (
                          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginLeft: 2 }}>
                            %
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Confirm Submit Expense */}
            <TouchableOpacity
              testID="button-submit-split-expense"
              onPress={handleAdd}
              style={s.submitExpenseBtn}
              activeOpacity={0.85}
            >
              <Text style={s.submitExpenseBtnText}>
                Create Split
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite & Add Members Bottom Sheet */}
      <Modal 
        visible={inviteSheetVisible} 
        animationType="slide" 
        transparent 
        onRequestClose={() => setInviteSheetVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setInviteSheetVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[s.sheet, { paddingBottom: bottomPad + 24 }]}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Invite & Add Members</Text>
          <Text style={s.sheetDesc}>
            Add people manually to split expenses, or share the group code.
          </Text>

          {/* Section A: Add local member manually */}
          <Text style={s.fLabel}>Add Member Manually</Text>
          <View style={[s.fAmtWrap, newMemberFocus && { borderColor: colors.primary }]}>
            <Ionicons name="person-outline" size={18} color={newMemberFocus ? colors.primary : colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              testID="input-new-member-name"
              style={[s.fAmtInput, { fontSize: 16 }]}
              placeholder="e.g. Sam, Gana"
              placeholderTextColor={colors.mutedForeground}
              value={newMemberName}
              onChangeText={setNewMemberName}
              onFocus={() => setNewMemberFocus(true)}
              onBlur={() => setNewMemberFocus(false)}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={async () => {
                if (!newMemberName.trim()) return;
                await handleAddMember();
              }}
            />
            {newMemberName.trim().length > 0 && (
              <TouchableOpacity 
                onPress={async () => {
                  await handleAddMember();
                }}
                style={s.sheetAddBtn}
              >
                <Text style={s.sheetAddBtnText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.dockDivider} />

          {/* Section B: Share/Copy Group invite code */}
          <Text style={s.fLabel}>Invite via Group Code</Text>
          
          <View style={s.inviteCodeContainer}>
            <Text selectTextOnFocus style={s.inviteCodeText}>{group.id}</Text>
            <TouchableOpacity 
              onPress={() => {
                Clipboard.setString(group.id);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                setIsCopied(true);
                setTimeout(() => {
                  setIsCopied(false);
                }, 2000);
              }}
              style={s.inviteCopyBtn}
            >
              <Ionicons name={isCopied ? "checkmark-circle" : "copy-outline"} size={16} color={colors.primary} />
              <Text style={s.inviteCopyBtnText}>{isCopied ? "Copied!" : "Copy"}</Text>
            </TouchableOpacity>
          </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  const { name } = parseGroupName(group.name);
                  const text = `Join my Split group "${name}" on Spendly!\nInvite Code: ${group.id}`;
                  await Share.share({ message: text });
                }}
                style={s.inviteShareLinkBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="share-social-outline" size={16} color={colors.primary} />
                <Text style={s.inviteShareLinkText}>Share Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  const { name } = parseGroupName(group.name);
                  const text = `Join my Split group "${name}" on Spendly!\nInvite Code: ${group.id}`;
                  const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
                  Linking.openURL(url).catch(() => {
                    Alert.alert("Error", "WhatsApp is not installed on this device.");
                  });
                }}
                style={[s.inviteShareLinkBtn, { borderColor: "#25d366" }]}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#25d366" />
                <Text style={[s.inviteShareLinkText, { color: "#25d366" }]}>WhatsApp</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Floating Interaction Dock at the Bottom */}
      <View style={[s.dockWrapper, { bottom: bottomPad + 12 }]}>
        <View style={s.dockContainer}>
          {/* Optional small icon: Invite */}
          <TouchableOpacity 
            onPress={() => {
              setNewMemberName("");
              setInviteSheetVisible(true);
            }} 
            style={s.dockInviteIconBtn}
            activeOpacity={0.7}
            testID="button-invite-trigger"
          >
            <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          {/* Primary Action: Add Expense */}
          <TouchableOpacity
            testID="button-add-split-expense"
            onPress={openModal}
            activeOpacity={0.85}
            style={s.dockPrimaryTouchFlex}
          >
            <LinearGradient
              colors={["#10b981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.dockPrimaryGradient}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.dockPrimaryText}>Add Expense</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Secondary Action: Settle */}
          <TouchableOpacity 
            onPress={() => {
              if (simplified.length > 0) {
                const payment = simplified[0];
                setSettleFrom(payment.from);
                setSettleTo(payment.to);
                setSettleAmount(payment.amount);
                setSettleAmountInput(Math.round(payment.amount).toString());
              } else {
                setSettleFrom(group.members[0] || "");
                setSettleTo(group.members[1] || "");
                setSettleAmount(0);
                setSettleAmountInput("0");
              }
              setSettleSheetVisible(true);
            }} 
            style={s.dockSecondaryBtnStyle}
            activeOpacity={0.7}
            testID="button-settle-up-trigger"
          >
            <Ionicons name="cash-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={s.dockSecondaryBtnTextStyle}>Settle</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const detailStyles = (
  colors: ReturnType<typeof useColors>,
  topPad: number,
  bottomPad: number
) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingBottom: 16,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center",
      justifyContent: "center",
    },
    groupName: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginLeft: 4,
    },
    headerSubRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
    },
    headerSeparator: {
      color: "rgba(255,255,255,0.5)",
      marginHorizontal: 6,
      fontSize: 14,
    },
    balanceHint: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "rgba(255,255,255,0.9)",
    },
    memberAvatarsRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    memberAvatar: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.6)",
    },
    memberAvatarText: {
      fontSize: 8,
      color: "#fff",
      fontFamily: "Inter_700Bold",
    },
    viewSplitTrigger: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 4,
    },
    scroll: {
      padding: 16,
      paddingBottom: bottomPad + 115,
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    timelineCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.02,
      shadowRadius: 3,
      elevation: 1,
    },
    expCardSettled: {
      opacity: 0.7,
    },
    timelineCardTop: {
      flexDirection: "row",
      alignItems: "center",
    },
    catIconBg: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    expenseDesc: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    expenseMeta: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    expenseTotal: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "right",
    },
    expenseDate: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
      textAlign: "right",
    },
    trashBtn: {
      padding: 6,
      marginLeft: 8,
    },
    textStrikethrough: {
      textDecorationLine: "line-through",
      color: colors.mutedForeground,
    },
    boldText: {
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    splitOweBreakdown: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 10,
      paddingTop: 8,
      gap: 6,
    },
    owesRowItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    owesTextText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    inlineSettleBtn: {
      backgroundColor: colors.primary + "12",
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    inlineDirectSettleBtn: {
      padding: 4,
      justifyContent: "center",
      alignItems: "center",
    },
    inlineSettleText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    timelineSettledBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 10,
      paddingTop: 8,
    },
    settledText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 18,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 10,
    },
    settledAllCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary + "0d",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary + "25",
      padding: 16,
    },
    settledAllText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    balancesCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    balanceRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
    },
    balDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    paymentPathRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    debtorName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.destructive,
    },
    creditorName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    debtAmount: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 1,
    },
    settleUpBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    settleUpBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    avatarCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    memberNameText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    memberBalanceText: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingTop: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 12,
    },
    settleModalSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 16,
    },
    settleFlowCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-around",
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    settlePerson: {
      alignItems: "center",
      gap: 4,
    },
    settleAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    settleName: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    fLabel: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 14,
    },
    fAmtWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 50,
      backgroundColor: colors.background,
    },
    fRupee: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginRight: 8,
    },
    fAmtInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    confirmSettleBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
    },
    confirmSettleText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    largeAmountBlock: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "baseline",
      marginVertical: 14,
    },
    largeRupeeSymbol: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginRight: 4,
    },
    largeAmtInput: {
      fontSize: 36,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      minWidth: 120,
    },
    sheetInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 50,
      backgroundColor: colors.background,
      marginBottom: 12,
    },
    sheetTextInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    inputFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "08",
    },
    catPickerScroll: {
      gap: 8,
      paddingBottom: 4,
    },
    catPickerItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.background,
    },
    catPickerText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    accordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      marginBottom: 8,
    },
    accordionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    paidByScroll: {
      gap: 10,
      paddingBottom: 4,
    },
    paidByPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 20,
      paddingLeft: 4,
      paddingRight: 12,
      paddingVertical: 4,
      backgroundColor: colors.background,
    },
    pillAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    pillAvatarText: {
      color: "#fff",
      fontSize: 10,
      fontFamily: "Inter_700Bold",
    },
    paidByText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    modePickerRow: {
      flexDirection: "row",
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
    },
    modeOption: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      height: 38,
      borderRadius: 10,
    },
    modeOptionActive: {
      backgroundColor: colors.primary,
    },
    modeOptionText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    modeOptionTextActive: {
      color: "#fff",
    },
    splitAmongContainer: {
      gap: 10,
      marginTop: 4,
    },
    splitAmongMemberRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      height: 48,
    },
    splitAmongAvatarCircle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 24,
      paddingLeft: 4,
      paddingRight: 16,
      height: 42,
      backgroundColor: colors.background,
    },
    memberDotInitials: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    memberDotInitialsText: {
      color: "#fff",
      fontSize: 11,
      fontFamily: "Inter_700Bold",
    },
    memberDotName: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    splitShareInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 8,
      height: 36,
      width: 90,
      backgroundColor: colors.background,
    },
    splitShareTextInput: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "right",
      padding: 0,
    },
    submitExpenseBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
      marginBottom: 8,
    },
    submitExpenseBtnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    chip: {
      backgroundColor: colors.muted,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    memberChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 16,
    },
    dockWrapper: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 10,
    },
    dockContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.card === "#ffffff" ? "rgba(255,255,255,0.95)" : "rgba(28,28,30,0.95)",
      borderRadius: 28,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      width: "92%",
      maxWidth: 420,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 8,
    },
    dockInviteIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + "12",
      alignItems: "center",
      justifyContent: "center",
    },
    dockPrimaryTouchFlex: {
      flex: 1,
      borderRadius: 20,
      shadowColor: "#059669",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 3,
    },
    dockPrimaryGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 40,
      borderRadius: 20,
    },
    dockPrimaryText: {
      color: "#fff",
      fontSize: 13,
      fontFamily: "Inter_700Bold",
    },
    dockSecondaryBtnStyle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "12",
      borderRadius: 20,
      height: 40,
      paddingHorizontal: 14,
    },
    dockSecondaryBtnTextStyle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    timelineCardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    timelineCardMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
    },
    badgePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    badgeSettled: {
      backgroundColor: colors.primary + "15",
    },
    badgePartiallySettled: {
      backgroundColor: "#f9731615",
    },
    badgeUnsettled: {
      backgroundColor: colors.muted,
    },
    badgeText: {
      fontSize: 9,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    timelineSettlementCard: {
      opacity: 0.55,
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    settlementDesc: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    timelineSectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    timelineSearchToggleBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    simplifiedDebtsSection: {
      marginBottom: 16,
    },
    simplifiedDebtsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    simplifiedDebtsToggleText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    simplifiedDebtsCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      paddingHorizontal: 14,
    },
    simplifiedDebtRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
    },
    simplifiedDebtRowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    simplifiedDebtTextCol: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
      marginRight: 12,
    },
    simplifiedDebtText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
    },
    simplifiedDebtSettleBtn: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    simplifiedDebtSettleText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    sheetDesc: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 16,
      lineHeight: 18,
    },
    sheetAddBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sheetAddBtnText: {
      color: "#fff",
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    dockDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 16,
    },
    inviteCodeContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingLeft: 14,
      height: 50,
      backgroundColor: colors.background,
    },
    inviteCodeText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
    },
    inviteCopyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary + "12",
      height: "100%",
      paddingHorizontal: 16,
      borderTopRightRadius: 12,
      borderBottomRightRadius: 12,
    },
    inviteCopyBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    inviteShareLinkBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      height: 48,
      backgroundColor: colors.background,
    },
    inviteShareLinkText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    breakdownSection: {
      marginBottom: 16,
    },
    breakdownCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    breakdownTotalText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 16,
    },
    breakdownBarsWrap: {
      gap: 12,
    },
    breakdownRow: {
      gap: 6,
    },
    breakdownLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    breakdownLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    breakdownValue: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    progressBarBackground: {
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 4,
    },
    searchBarContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      backgroundColor: colors.card,
      marginBottom: 12,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      paddingVertical: 8,
    },
    filterScroll: {
      gap: 8,
      paddingRight: 16,
    },
    filterPill: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    filterPillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "12",
    },
    filterPillText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    filterPillTextActive: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    removeMemberBtn: {
      marginLeft: 12,
      padding: 4,
    },
    collapsibleHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.card,
    },
    collapsibleHeaderText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    collapsibleContent: {
      paddingHorizontal: 14,
      backgroundColor: colors.background + "40",
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    settleFirstBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settleFirstText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    settledEmptyCard: {
      marginBottom: 16,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1.5,
      borderColor: colors.primary + "30",
    },
    settledEmptyGradient: {
      paddingVertical: 20,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    settledSparkleBg: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    settledEmptyTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    settledEmptySub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 16,
      paddingHorizontal: 20,
    },
    settledEmptyActions: {
      flexDirection: "row",
      gap: 10,
    },
    settledEmptyBtnPrimary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    settledEmptyBtnTextPrimary: {
      color: "#fff",
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    settledEmptyBtnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1.5,
      borderColor: colors.primary + "40",
      backgroundColor: colors.primary + "0c",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    settledEmptyBtnTextSecondary: {
      color: colors.primary,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
  });
