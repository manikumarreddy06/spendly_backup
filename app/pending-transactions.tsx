import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import { useApp, useCurrency } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { BUILTIN_CATEGORIES, resolveExpenseMeta } from "@/constants/categories";

export default function PendingTransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currency = useCurrency();
  const {
    detectedTransactions,
    pendingTransactionCount,
    customCategories,
    approveTransaction,
    rejectTransaction,
    approveAllTransactions,
    rejectAllTransactions,
    syncDetectedTransactions,
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Sync from native on mount
  useEffect(() => {
    syncDetectedTransactions();
  }, []);

  // Edit modal state
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMerchant, setEditMerchant] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const allCategories = useMemo(() => {
    const builtin = BUILTIN_CATEGORIES.map((c) => ({
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

  const openEdit = useCallback((tx: any) => {
    setEditingTx(tx);
    setEditAmount(tx.amount.toString());
    setEditMerchant(tx.merchant);
    setEditCategory(tx.category);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleApprove = useCallback(async (tx: any) => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await approveTransaction(tx.id);
  }, [approveTransaction]);

  const handleReject = useCallback(async (tx: any) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await rejectTransaction(tx.id);
  }, [rejectTransaction]);

  const handleEditApprove = useCallback(async () => {
    if (!editingTx) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await approveTransaction(editingTx.id, {
      amount,
      merchant: editMerchant.trim() || editingTx.merchant,
      category: editCategory || editingTx.category,
    });
    setEditingTx(null);
  }, [editingTx, editAmount, editMerchant, editCategory, approveTransaction]);

  const handleApproveAll = useCallback(async () => {
    Alert.alert(
      "Approve All",
      `Add ${pendingTransactionCount} transactions to your expense ledger?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve All",
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            await approveAllTransactions();
          },
        },
      ]
    );
  }, [pendingTransactionCount, approveAllTransactions]);

  const handleRejectAll = useCallback(async () => {
    Alert.alert(
      "Reject All",
      `Dismiss ${pendingTransactionCount} pending transactions? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject All",
          style: "destructive",
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            await rejectAllTransactions();
          },
        },
      ]
    );
  }, [pendingTransactionCount, rejectAllTransactions]);

  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const s = createStyles(colors, topPad, bottomPad);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Pending Review</Text>
          {pendingTransactionCount > 0 && (
            <View style={[s.badge, { backgroundColor: colors.primary }]}>
              <Text style={s.badgeText}>{pendingTransactionCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 30 }} />
      </View>

      {pendingTransactionCount === 0 ? (
        /* Empty State */
        <View style={s.emptyContainer}>
          <View style={[s.emptyIcon, { backgroundColor: colors.primary + "12" }]}>
            <Ionicons name="checkmark-done" size={48} color={colors.primary} />
          </View>
          <Text style={s.emptyTitle}>All caught up! 🎉</Text>
          <Text style={s.emptySubtitle}>
            No pending transactions to review. New transactions will appear here automatically when detected.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={s.list}
            contentContainerStyle={[s.listContent, { paddingBottom: bottomPad + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Info banner */}
            <View style={[s.infoBanner, { backgroundColor: colors.primary + "0a", borderColor: colors.primary + "20" }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Text style={[s.infoBannerText, { color: colors.primary }]}>
                Tap to edit • Swipe buttons to approve or reject
              </Text>
            </View>

            {detectedTransactions.map((tx) => {
              const catMeta = resolveExpenseMeta(tx.category, customCategories, null);
              return (
                <TouchableOpacity
                  key={tx.id}
                  style={s.txCard}
                  onPress={() => openEdit(tx)}
                  activeOpacity={0.75}
                >
                  <View style={s.txLeft}>
                    <View style={[s.txIconBox, { backgroundColor: catMeta.color + "18" }]}>
                      <Ionicons name={catMeta.icon as any} size={20} color={catMeta.color} />
                    </View>
                    <View style={s.txInfo}>
                      <Text style={s.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                      <View style={s.txMetaRow}>
                        <Text style={s.txSource}>via {tx.sourceApp}</Text>
                        <Text style={s.txDot}>•</Text>
                        <Text style={s.txTime}>{getRelativeTime(tx.detectedAt)}</Text>
                      </View>
                      <View style={[s.txCategoryChip, { backgroundColor: catMeta.color + "12", borderColor: catMeta.color + "25" }]}>
                        <Text style={[s.txCategoryText, { color: catMeta.color }]}>{catMeta.label}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.txRight}>
                    <Text style={s.txAmount}>{currency}{tx.amount.toLocaleString()}</Text>
                    <View style={s.txActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, s.approveBtn]}
                        onPress={(e) => { e.stopPropagation(); handleApprove(tx); }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Approve ${tx.merchant} ${currency}${tx.amount}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, s.rejectBtn]}
                        onPress={(e) => { e.stopPropagation(); handleReject(tx); }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Reject ${tx.merchant} ${currency}${tx.amount}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bulk Actions */}
          <View style={[s.bulkBar, { paddingBottom: bottomPad + 12 }]}>
            <TouchableOpacity
              style={[s.bulkBtn, { backgroundColor: colors.primary }]}
              onPress={handleApproveAll}
              activeOpacity={0.85}
              accessibilityLabel={`Approve all ${pendingTransactionCount} pending transactions`}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={s.bulkBtnText}>Approve All ({pendingTransactionCount})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.bulkBtn, s.bulkRejectBtn]}
              onPress={handleRejectAll}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={16} color={colors.destructive} />
              <Text style={[s.bulkBtnText, { color: colors.destructive }]}>Reject All</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Edit Modal */}
      {editingTx && (
        <Modal
          visible={!!editingTx}
          transparent
          animationType="slide"
          onRequestClose={() => setEditingTx(null)}
        >
          <Pressable style={s.editOverlay} onPress={() => setEditingTx(null)} />
          <View style={[s.editSheet, { paddingBottom: bottomPad + 16 }]}>
            <View style={s.editHandle} />
            <Text style={s.editTitle}>Edit Transaction</Text>
            <Text style={s.editHint}>Adjust details before adding to your ledger</Text>

            {/* Merchant */}
            <Text style={s.editFieldLabel}>Merchant</Text>
            <TextInput
              style={s.editInput}
              value={editMerchant}
              onChangeText={setEditMerchant}
              placeholder="Merchant name"
              placeholderTextColor={colors.mutedForeground}
            />

            {/* Amount */}
            <Text style={s.editFieldLabel}>Amount</Text>
            <View style={s.editAmountRow}>
              <Text style={s.editCurrency}>{currency}</Text>
              <TextInput
                style={[s.editInput, { flex: 1 }]}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            {/* Category */}
            <Text style={s.editFieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {allCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    s.catChip,
                    editCategory === cat.key && { backgroundColor: cat.color, borderColor: cat.color },
                  ]}
                  onPress={() => {
                    setEditCategory(cat.key);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={editCategory === cat.key ? "#fff" : cat.color}
                  />
                  <Text
                    style={[
                      s.catChipText,
                      editCategory === cat.key && { color: "#fff" },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Source info */}
            <View style={s.editSourceRow}>
              <Ionicons name="phone-portrait-outline" size={14} color={colors.mutedForeground} />
              <Text style={s.editSourceText}>
                Detected via {editingTx.sourceApp} • {getRelativeTime(editingTx.detectedAt)}
              </Text>
            </View>

            {/* Actions */}
            <View style={s.editBtnRow}>
              <TouchableOpacity
                style={[s.editBtn, { backgroundColor: colors.border }]}
                onPress={() => setEditingTx(null)}
                activeOpacity={0.85}
              >
                <Text style={[s.editBtnText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.editBtn, { backgroundColor: colors.primary, flex: 2 }]}
                onPress={handleEditApprove}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[s.editBtnText, { color: "#fff" }]}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>, topPad: number, bottomPad: number) {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    container: { flex: 1 },
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
    backBtn: { padding: 4 },
    headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },

    // Empty state
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
    },
    emptyIcon: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },

    // List
    list: { flex: 1 },
    listContent: { padding: 16 },

    // Info banner
    infoBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 12,
    },
    infoBannerText: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },

    // Transaction card
    txCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    txLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    txIconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    txInfo: { flex: 1 },
    txMerchant: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 2,
    },
    txMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
    txSource: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    txDot: { fontSize: 10, color: colors.mutedForeground },
    txTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    txCategoryChip: {
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    txCategoryText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
    txRight: { alignItems: "flex-end", marginLeft: 8 },
    txAmount: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    txActions: { flexDirection: "row", gap: 8 },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    approveBtn: { backgroundColor: "#10b981" },
    rejectBtn: { backgroundColor: "#ef4444" },

    // Bulk bar
    bulkBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    bulkBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 46,
      borderRadius: 14,
    },
    bulkRejectBtn: {
      flex: 0.6,
      backgroundColor: "transparent",
      borderWidth: 1.5,
      borderColor: colors.destructive + "40",
    },
    bulkBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

    // Edit modal
    editOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    editSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 14,
      paddingHorizontal: 20,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderBottomWidth: 0,
    },
    editHandle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    editTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    editHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 18,
    },
    editFieldLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 6,
      marginTop: 8,
    },
    editInput: {
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    editAmountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    editCurrency: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    catScroll: { marginVertical: 8 },
    catChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      marginRight: 8,
    },
    catChipText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    editSourceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 14,
      marginBottom: 6,
    },
    editSourceText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    editBtnRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    editBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 48,
      borderRadius: 14,
    },
    editBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
  });
}
