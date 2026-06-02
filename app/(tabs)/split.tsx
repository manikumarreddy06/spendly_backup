import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState, useMemo, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
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
  KeyboardAvoidingView,
  useColorScheme,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, SplitGroup, parseGroupName, formatGroupName } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SUPABASE_ENABLED } from "@/lib/config";
import { useThemePreference } from "@/hooks/useThemePreference";
import {
  getExpenseMemberShare,
  isExpenseSettledFor,
  resolveMemberInGroup,
} from "@/lib/split";

const GREEN = "#18633f";

const PRESET_EMOJIS = ["🏖", "🏠", "🍻", "🚗", "🍕", "🎒", "💸", "🎮", "🍿", "🍽", "✈", "🎸"];
const PRESET_COLORS = ["#2d7a52", "#3b82f6", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444"];

function SplitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { splitGroups, createSplitGroup, deleteSplitGroup, getOweSummary, joinGroupFromInvite, profile, getBalances, refreshGroup } = useApp();

  const [modalVisible, setModalVisible] = useState(false);
  const [createStep, setCreateStep] = useState(1); // 1: Info, 2: Members
  const [groupName, setGroupName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🏖");
  const [selectedColor, setSelectedColor] = useState("#2d7a52");
  
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [nameFocus, setNameFocus] = useState(false);
  const [membersFocus, setMembersFocus] = useState(false);

  // Success view state after group creation
  const [createdGroup, setCreatedGroup] = useState<SplitGroup | null>(null);

  // States for Joining Group via Code
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [inviteCodeFocus, setInviteCodeFocus] = useState(false);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [clipboardCode, setClipboardCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    if (!SUPABASE_ENABLED) return;
    setRefreshing(true);
    try {
      await Promise.all(splitGroups.map((g) => refreshGroup(g.id)));
    } catch (err) {
      console.warn("[refresh] Dashboard pull-to-refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (joinModalVisible) {
      const checkClipboard = async () => {
        try {
          const text = await Clipboard.getString();
          if (text) {
            const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
            const match = text.match(uuidRegex);
            if (match) {
              setClipboardCode(match[0]);
            } else {
              setClipboardCode(null);
            }
          }
        } catch (err) {
          console.warn("Clipboard reading failed:", err);
        }
      };
      checkClipboard();
    } else {
      setClipboardCode(null);
    }
  }, [joinModalVisible]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const tabClearance = 72 + (Platform.OS === "ios" ? insets.bottom : 12);

  const myName = profile?.name ?? "You";

  // Dashboard Search & Filter states
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<'all' | 'owe' | 'owed'>('all');

  const filteredGroups = splitGroups.filter((g) => {
    const { name } = parseGroupName(g.name);
    const matchesSearch = name.toLowerCase().includes(groupSearchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'all') return true;

    const groupBalances = getBalances(g);
    const meInGroup = resolveMemberInGroup(myName, g.members) ?? myName;
    const myGroupBalance = groupBalances[meInGroup] ?? 0;

    if (filterMode === 'owe') {
      return myGroupBalance < -0.1;
    }
    if (filterMode === 'owed') {
      return myGroupBalance > 0.1;
    }
    return true;
  });

  const sortedGroups = useMemo(() => {
    return [...filteredGroups].sort((a, b) => {
      const meA = resolveMemberInGroup(myName, a.members) ?? myName;
      const meB = resolveMemberInGroup(myName, b.members) ?? myName;
      const balA = getBalances(a)[meA] ?? 0;
      const balB = getBalances(b)[meB] ?? 0;

      // 1. You owe money (negative balance)
      const owesA = balA < -0.1;
      const owesB = balB < -0.1;
      if (owesA && !owesB) return -1;
      if (!owesA && owesB) return 1;
      if (owesA && owesB) {
        return balA - balB; // larger debt first (more negative balance comes first)
      }

      // 2. You are owed money (positive balance)
      const owedA = balA > 0.1;
      const owedB = balB > 0.1;
      if (owedA && !owedB) return -1;
      if (!owedA && owedB) return 1;
      if (owedA && owedB) {
        return balB - balA; // larger credit first
      }

      // 3. Recently active groups
      const dateA = a.expenses[0] ? new Date(a.expenses[0].date).getTime() : 0;
      const dateB = b.expenses[0] ? new Date(b.expenses[0].date).getTime() : 0;
      if (dateA !== dateB) return dateB - dateA;

      return 0;
    });
  }, [filteredGroups, getBalances, myName]);

  const handleSummaryFilter = (mode: 'all' | 'owe' | 'owed') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (filterMode === mode) {
      setFilterMode('all');
    } else {
      setFilterMode(mode);
    }
  };

  const handleMemberInputChange = (text: string) => {
    if (text.includes(",")) {
      const parts = text.split(",");
      const finished = parts.slice(0, -1).map((m) => m.trim()).filter(Boolean);
      const lastPart = parts[parts.length - 1];

      if (finished.length > 0) {
        setMembers((prev) => {
          const next = [...prev];
          finished.forEach((f) => {
            if (!next.some((m) => m.trim().toLowerCase() === f.toLowerCase())) {
              next.push(f);
            }
          });
          return next;
        });
      }
      setMemberInput(lastPart);
    } else {
      setMemberInput(text);
    }
  };

  const handleMemberInputSubmit = () => {
    const trimmed = memberInput.trim();
    if (trimmed) {
      if (!members.some((m) => m.trim().toLowerCase() === trimmed.toLowerCase())) {
        setMembers([...members, trimmed]);
      }
      setMemberInput("");
    }
  };

  const handleRemoveMember = (name: string) => {
    setMembers(members.filter((m) => m !== name));
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert("Missing name", "Please enter a group name.");
      return;
    }
    let finalMembers = [...members];
    const leftover = memberInput.trim();
    if (leftover && !finalMembers.some((m) => m.trim().toLowerCase() === leftover.toLowerCase())) {
      finalMembers.push(leftover);
    }

    if (finalMembers.length === 0) {
      Alert.alert("Missing members", "Add at least one member.");
      return;
    }

    // Auto-include current user in members list if not present
    if (!finalMembers.some((m) => m.trim().toLowerCase() === myName.trim().toLowerCase())) {
      finalMembers.unshift(myName);
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const rawName = formatGroupName(groupName.trim(), selectedEmoji, selectedColor);
    
    // Call Context creation method
    const newGroup = await createSplitGroup(rawName, finalMembers);
    setCreatedGroup(newGroup);
    
    // Reset inputs
    setGroupName("");
    setMembers([]);
    setMemberInput("");
    setCreateStep(1);
    setModalVisible(false);
  };

  const [successCopied, setSuccessCopied] = useState(false);

  const getGroupRelativeTime = (g: SplitGroup) => {
    let newestDate = g.createdAt ? new Date(g.createdAt) : null;
    if (g.expenses && g.expenses.length > 0) {
      g.expenses.forEach((e) => {
        const d = new Date(e.date);
        if (!newestDate || d.getTime() > newestDate.getTime()) {
          newestDate = d;
        }
      });
    }

    if (!newestDate) return "Updated recently";
    
    const now = new Date();
    const diffMs = now.getTime() - newestDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays <= 0) {
      const diffHours = Math.floor(diffMs / 3600000);
      if (diffHours <= 0) {
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins <= 1) return "Updated just now";
        return `Updated ${diffMins}m ago`;
      }
      return `Updated ${diffHours}h ago`;
    }
    if (diffDays === 1) return "Updated yesterday";
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    return `Updated on ${newestDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;
  };

  const handleSettleUpMain = () => {
    if (splitGroups.length === 0) return;

    let targetGroup: SplitGroup | null = null;
    let maxOwedAmt = 0;
    let maxGetsAmt = 0;
    let worstOweGroup: SplitGroup | null = null;
    let bestOwedGroup: SplitGroup | null = null;

    splitGroups.forEach((g) => {
      const me = resolveMemberInGroup(myName, g.members) ?? myName;
      const bal = getBalances(g)[me] ?? 0;
      if (bal < -0.1) {
        const absBal = Math.abs(bal);
        if (absBal > maxOwedAmt) {
          maxOwedAmt = absBal;
          worstOweGroup = g;
        }
      } else if (bal > 0.1) {
        if (bal > maxGetsAmt) {
          maxGetsAmt = bal;
          bestOwedGroup = g;
        }
      }
    });

    targetGroup = worstOweGroup || bestOwedGroup;

    if (targetGroup) {
      router.push(`/split/${(targetGroup as SplitGroup).id}`);
    } else {
      router.push(`/split/${splitGroups[0].id}`);
    }
  };

  const handleDelete = (group: SplitGroup) => {
    const { name } = parseGroupName(group.name);
    const groupBalances = getBalances(group);
    const isSettled = Object.values(groupBalances).every((val) => Math.abs(val) < 0.5);

    const title = isSettled ? "Delete Group" : "⚠️ Unsettled Balances";
    const message = isSettled 
      ? `Delete "${name}"? This cannot be undone.`
      : `This group "${name}" still has unsettled balances. Delete anyway?`;

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            deleteSplitGroup(group.id);
          },
        },
      ]
    );
  };

  const handleShareInvite = async (g: SplitGroup) => {
    const { name } = parseGroupName(g.name);
    const lines = [
      `Join my Split group "${name}" on Spendly!`,
      `Invite Code: ${g.id}`,
      "",
      "(Copy the Invite Code above, open Spendly Split, and tap 'Join')",
    ];
    await Share.share({ message: lines.join("\n") });
  };

  const handleWhatsAppShare = async (g: SplitGroup) => {
    const { name } = parseGroupName(g.name);
    const text = `Join my Split group "${name}" on Spendly!\nInvite Code: ${g.id}`;
    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "WhatsApp is not installed on this device.");
    });
  };

  const handleJoinGroup = async () => {
    let code = inviteCodeInput.trim();
    if (!code) {
      Alert.alert("Missing Code", "Please enter or paste the Group Join Code.");
      return;
    }

    // Try to extract a UUID if they pasted a full invite message or extra text
    const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    const match = code.match(uuidRegex);
    if (match) {
      code = match[0];
    } else {
      Alert.alert("Invalid Code", "Please enter a valid group invite code.");
      return;
    }

    if (splitGroups.some((g) => g.id === code)) {
      setJoinModalVisible(false);
      setInviteCodeInput("");
      router.push(`/split/${code}`);
      return;
    }

    setJoiningGroup(true);
    try {
      const successGroup = await joinGroupFromInvite(code);
      setJoiningGroup(false);
      if (successGroup) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setJoinModalVisible(false);
        setInviteCodeInput("");
        router.push(`/split/${code}`);
      } else {
        Alert.alert("Not Found", "Could not find a split group with this invite code. Please verify the code.");
      }
    } catch (err) {
      setJoiningGroup(false);
      Alert.alert("Error", "An unexpected error occurred while joining the group.");
    }
  };

  const { totalOwed, totalOwe } = getOweSummary();
  const netBalance = totalOwed - totalOwe;
  const s = splitStyles(colors, topPad, bottomPad);

  const scheme = useColorScheme();
  const { mode: themeMode } = useThemePreference();
  const effectiveTheme = themeMode === "system" ? scheme : themeMode;

  const gradientColors = effectiveTheme === "dark"
    ? ["#0b1610", "#080c09", "#080c09"]
    : ["#dff5e8", "#ecf7f0", "#f4faf6"];

  return (
    <View style={s.root}>
      <LinearGradient
        colors={gradientColors as any}
        locations={[0, 0.35, 1]}
        style={s.headerBg}
      />
      <View style={[s.headerBlob, effectiveTheme === "dark" && { backgroundColor: "#122d1f", opacity: 0.3 }]} />
      <View style={s.leavesWrap}>
        <Ionicons
          name="leaf"
          size={14}
          color={effectiveTheme === "dark" ? "#0f766e" : "#86efac"}
          style={{ transform: [{ rotate: "-40deg" }] }}
        />
        <Ionicons
          name="leaf"
          size={22}
          color={effectiveTheme === "dark" ? "#10b981" : "#4ade80"}
          style={{ marginLeft: 4, marginTop: -8 }}
        />
      </View>

      <View style={s.header}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={s.headerTitle}>Split</Text>
          <Text style={s.headerSub} numberOfLines={1}>
            Track shared expenses
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            testID="button-join-group-trigger"
            onPress={() => setJoinModalVisible(true)}
            style={s.headerActionBtnSecondary}
          >
            <Ionicons name="enter-outline" size={16} color={GREEN} />
            <Text style={[s.headerActionText, { color: GREEN }]}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="button-new-group"
            onPress={() => {
              setCreateStep(1);
              setSelectedEmoji("🏖");
              setSelectedColor("#2d7a52");
              setModalVisible(true);
            }}
            style={s.headerActionBtnPrimary}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={[s.headerActionText, { color: "#fff" }]}>New Group</Text>
          </TouchableOpacity>
        </View>
      </View>

      {splitGroups.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIconBg}>
            <Ionicons name="people-outline" size={44} color={colors.primary} />
          </View>
          <Text style={s.emptyTitle}>Split Expenses Seamlessly</Text>
          <Text style={s.emptyText}>
            Create a group to split trip expenses, bills, or rent with friends, or join an existing group.
          </Text>
          <View style={s.emptyActionsRow}>
            <TouchableOpacity
              testID="button-empty-create-group"
              onPress={() => {
                setCreateStep(1);
                setSelectedEmoji("🏖");
                setSelectedColor("#2d7a52");
                setModalVisible(true);
              }}
              style={s.emptyActionBtnPrimary}
            >
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={s.emptyActionTextPrimary}>Create Group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="button-empty-join-group"
              onPress={() => setJoinModalVisible(true)}
              style={s.emptyActionBtnSecondary}
            >
              <Ionicons name="enter-outline" size={18} color={colors.primary} />
              <Text style={s.emptyActionTextSecondary}>Join Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          style={s.list}
          data={sortedGroups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 16, paddingBottom: tabClearance + 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {/* Redesigned Premium Summary Card */}
              <View style={[
                s.dashboardCard,
                {
                  borderColor: netBalance > 0 ? "#def7ec" : netBalance < 0 ? "#fde8e8" : colors.border,
                  backgroundColor: netBalance > 0 ? "#f3faf7" : netBalance < 0 ? "#fdf8f8" : colors.card,
                }
              ]}>
                <View style={s.dbRow}>
                  <TouchableOpacity
                    onPress={() => handleSummaryFilter('owed')}
                    style={[s.dbCol, filterMode === 'owed' && s.dbColActive]}
                  >
                    <Text style={[s.dbLabel, filterMode === 'owed' && { color: colors.primary }]}>YOU ARE OWED</Text>
                    <Text style={[s.dbAmount, { color: colors.primary }]}>₹{totalOwed.toLocaleString("en-IN")}</Text>
                  </TouchableOpacity>
                  <View style={s.dbDivider} />
                  <TouchableOpacity
                    onPress={() => handleSummaryFilter('owe')}
                    style={[s.dbCol, filterMode === 'owe' && s.dbColActive]}
                  >
                    <Text style={[s.dbLabel, filterMode === 'owe' && { color: colors.destructive }]}>YOU OWE</Text>
                    <Text style={[s.dbAmount, { color: colors.destructive }]}>₹{totalOwe.toLocaleString("en-IN")}</Text>
                  </TouchableOpacity>
                  <View style={s.dbDivider} />
                  <TouchableOpacity
                    onPress={() => handleSummaryFilter('all')}
                    style={[s.dbCol, filterMode === 'all' && s.dbColActive]}
                  >
                    <Text style={s.dbLabel}>NET BALANCE</Text>
                    <Text style={[
                      s.dbAmount,
                      { color: netBalance > 0 ? colors.primary : netBalance < 0 ? colors.destructive : colors.mutedForeground }
                    ]}>
                      {netBalance > 0 ? "+" : netBalance < 0 ? "-" : ""}₹{Math.abs(netBalance).toLocaleString("en-IN")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Primary dynamic action depending on state */}
                <TouchableOpacity
                  testID="button-summary-action"
                  style={[s.summaryCtaBtn, { backgroundColor: netBalance !== 0 ? colors.primary : colors.primary + "22" }]}
                  onPress={() => {
                    if (netBalance !== 0) {
                      handleSettleUpMain();
                    } else {
                      setCreateStep(1);
                      setSelectedEmoji("🏖");
                      setSelectedColor("#2d7a52");
                      setModalVisible(true);
                    }
                  }}
                >
                  <Text style={[s.summaryCtaBtnText, { color: netBalance !== 0 ? "#fff" : colors.primary }]}>
                    {netBalance !== 0 ? "Settle Up" : "Add Group"}
                  </Text>
                  <Ionicons
                    name={netBalance !== 0 ? "cash-outline" : "add-outline"}
                    size={16}
                    color={netBalance !== 0 ? "#fff" : colors.primary}
                    style={{ marginLeft: 6 }}
                  />
                </TouchableOpacity>
              </View>

              {/* Active Filter Pill */}
              {filterMode !== 'all' && (
                <View style={s.activeFilterRow}>
                  <Text style={s.activeFilterText}>
                    Showing {filterMode === 'owe' ? "groups where you owe money" : "groups where you are owed money"}
                  </Text>
                  <TouchableOpacity onPress={() => setFilterMode('all')} style={s.clearFilterBtn}>
                    <Text style={s.clearFilterText}>Clear</Text>
                    <Ionicons name="close" size={14} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Group Search Bar */}
              <View style={s.searchBarContainer}>
                <Ionicons name="search-outline" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                <TextInput
                  style={s.searchBarInput}
                  placeholder="Search groups..."
                  placeholderTextColor={colors.mutedForeground}
                  value={groupSearchQuery}
                  onChangeText={setGroupSearchQuery}
                />
                {groupSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setGroupSearchQuery("")}>
                    <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.searchEmptyCard}>
              <Ionicons name="search-outline" size={24} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
              <Text style={s.searchEmptyText}>No matching groups found</Text>
              <Text style={s.searchEmptySub}>Try checking the spelling or typing a different name.</Text>
            </View>
          }
          renderItem={({ item: group }) => {
            const { name: cleanName, emoji, coverColor } = parseGroupName(group.name);
            const groupBalances = getBalances(group);
            const meInGroup = resolveMemberInGroup(myName, group.members) ?? myName;
            const myGroupBalance = groupBalances[meInGroup] ?? 0;

            const unsettledSum = group.expenses.reduce((sum, e) => {
              const pending = e.splitAmong
                .filter((m) => !isExpenseSettledFor(e, m, group.members))
                .reduce(
                  (s, m) => s + getExpenseMemberShare(e, m, group.members),
                  0
                );
              return sum + pending;
            }, 0);

            // Find last active activity
            const lastExpense = group.expenses[0];
            const activityText = lastExpense 
              ? `Added "${lastExpense.description}"` 
              : "Created group";

            return (
              <TouchableOpacity
                testID={`button-open-group-${group.id}`}
                onPress={() => router.push(`/split/${group.id}`)}
                activeOpacity={0.8}
                style={[s.groupCard, { borderLeftColor: coverColor }]}
              >
                <View style={[s.groupIcon, { backgroundColor: coverColor + "15" }]}>
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </View>
                
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={s.groupName}>{cleanName}</Text>
                  <Text style={s.groupActivity} numberOfLines={1}>{activityText}</Text>
                  <Text style={s.groupUpdated}>{getGroupRelativeTime(group)}</Text>
                  
                  {/* Member avatars horizontal line */}
                  <View style={s.membersRow}>
                    {group.members.slice(0, 4).map((m, idx) => (
                      <View 
                        key={m} 
                        style={[
                          s.avatarBubble, 
                          { 
                            backgroundColor: PRESET_COLORS[idx % PRESET_COLORS.length],
                            marginLeft: idx > 0 ? -6 : 0
                          }
                        ]}
                      >
                        <Text style={s.avatarText}>{m[0].toUpperCase()}</Text>
                      </View>
                    ))}
                    {group.members.length > 4 && (
                      <View style={[s.avatarBubble, { backgroundColor: colors.mutedForeground, marginLeft: -6 }]}>
                        <Text style={s.avatarText}>+{group.members.length - 4}</Text>
                      </View>
                    )}
                    <Text style={s.memberCountText}>
                      {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                
                <View style={{ alignItems: "flex-end", justifyContent: "space-between", height: 75 }}>
                  <TouchableOpacity
                    testID={`button-delete-group-${group.id}`}
                    onPress={() => handleDelete(group)}
                    style={s.deleteBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[
                      s.netStatusText, 
                      { color: myGroupBalance > 0 ? colors.primary : myGroupBalance < 0 ? colors.destructive : colors.mutedForeground }
                    ]}>
                      {myGroupBalance > 0 
                        ? `You get ₹${myGroupBalance.toFixed(0)}` 
                        : myGroupBalance < 0 
                        ? `You owe ₹${Math.abs(myGroupBalance).toFixed(0)}` 
                        : "All settled"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Create Group Modal (Wizard Step 1 & 2) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={s.overlay}
          onPress={() => setModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[s.sheet, { paddingBottom: bottomPad + 16 }]}>
          <View style={s.sheetHandle} />
          
          <View style={s.wizardHeader}>
            <Text style={s.sheetTitle}>
              {createStep === 1 ? "Create Group (1/2)" : "Add Members (2/2)"}
            </Text>
            {createStep === 2 && (
              <TouchableOpacity onPress={() => setCreateStep(1)} style={s.backWizardBtn}>
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
                <Text style={s.backWizardText}>Back</Text>
              </TouchableOpacity>
            )}
          </View>

          {createStep === 1 ? (
            /* Step 1: Info selection */
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 350 }}>
              <Text style={s.fieldLabel}>Group Name</Text>
              <View style={[s.inputWrap, nameFocus && s.inputFocused]}>
                <Ionicons name="people-outline" size={18} color={nameFocus ? colors.primary : colors.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  testID="input-group-name"
                  style={s.input}
                  placeholder="e.g. Goa Trip, Flatmates"
                  placeholderTextColor={colors.mutedForeground}
                  value={groupName}
                  onChangeText={setGroupName}
                  onFocus={() => setNameFocus(true)}
                  onBlur={() => setNameFocus(false)}
                />
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Select Icon / Emoji</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.emojiScroll}>
                {PRESET_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedEmoji(emoji);
                    }}
                    style={[
                      s.emojiBtn,
                      selectedEmoji === emoji && { borderColor: colors.primary, backgroundColor: colors.primary + "10" }
                    ]}
                  >
                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Optional Theme Color</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.colorScroll}>
                {PRESET_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setSelectedColor(color);
                    }}
                    style={[
                      s.colorBtn,
                      { backgroundColor: color },
                      selectedColor === color && { borderColor: colors.foreground, borderWidth: 2.5 }
                    ]}
                  />
                ))}
              </ScrollView>

              <TouchableOpacity
                testID="button-wizard-next"
                onPress={() => {
                  if (!groupName.trim()) {
                    Alert.alert("Missing name", "Please enter a group name.");
                    return;
                  }
                  setCreateStep(2);
                }}
                style={s.createBtn}
                activeOpacity={0.85}
              >
                <Text style={s.createBtnText}>Next: Add Members</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            /* Step 2: Add Members */
            <View>
              <Text style={s.fieldLabel}>Add Members</Text>
              <View style={[s.inputWrap, membersFocus && s.inputFocused]}>
                <Ionicons name="person-outline" size={18} color={membersFocus ? colors.primary : colors.mutedForeground} style={{ marginRight: 10 }} />
                <TextInput
                  testID="input-group-members"
                  style={s.input}
                  placeholder="Type name & press enter or comma"
                  placeholderTextColor={colors.mutedForeground}
                  value={memberInput}
                  onChangeText={handleMemberInputChange}
                  onSubmitEditing={handleMemberInputSubmit}
                  onFocus={() => setMembersFocus(true)}
                  onBlur={() => setMembersFocus(false)}
                />
                {memberInput.trim().length > 0 && (
                  <TouchableOpacity onPress={handleMemberInputSubmit} style={s.addMemberBtn}>
                    <Ionicons name="add-circle" size={22} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {members.length > 0 ? (
                <View style={s.chipsContainer}>
                  {members.map((m) => (
                    <View key={m} style={s.chip}>
                      <Text style={s.chipText}>{m}</Text>
                      <TouchableOpacity onPress={() => handleRemoveMember(m)} style={s.chipRemove}>
                        <Ionicons name="close" size={12} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={s.noMembersText}>No members added yet. Type a name above.</Text>
              )}

              <TouchableOpacity
                testID="button-create-group"
                onPress={handleCreate}
                style={[s.createBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={s.createBtnText}>Create Group & Sync</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Group Creation Success Bottom Sheet */}
      <Modal
        visible={createdGroup !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCreatedGroup(null)}
      >
        <Pressable
          style={s.overlay}
          onPress={() => setCreatedGroup(null)}
        />
        <View style={[s.sheet, { paddingBottom: bottomPad + 24 }]}>
          <View style={s.sheetHandle} />
          
          <View style={{ alignItems: "center", marginVertical: 12 }}>
            <View style={s.successBadge}>
              <Ionicons name="checkmark-circle" size={48} color="#2d7a52" />
            </View>
            <Text style={s.successTitle}>
              {createdGroup ? parseGroupName(createdGroup.name).name : ""} Created!
            </Text>
            <Text style={s.successSub}>
              Group is synced successfully. Share code with friends to join.
            </Text>
          </View>

          <View style={s.successCodeBox}>
            <Text style={s.successCodeLabel}>GROUP JOIN CODE</Text>
            <Text style={s.successCodeText}>{createdGroup?.id}</Text>
          </View>

          <View style={{ gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => {
                if (createdGroup) handleWhatsAppShare(createdGroup);
              }}
              style={[s.shareBtn, { backgroundColor: "#25d366" }]}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={s.shareBtnText}>Share to WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (createdGroup) handleShareInvite(createdGroup);
              }}
              style={[s.shareBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="share-social" size={18} color="#fff" />
              <Text style={s.shareBtnText}>Share Invite Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (createdGroup) {
                  Clipboard.setString(createdGroup.id);
                  Alert.alert("Copied", "Code copied to clipboard!");
                }
              }}
              style={[s.shareBtn, { backgroundColor: colors.muted }]}
            >
              <Ionicons name="copy-outline" size={18} color={colors.foreground} />
              <Text style={[s.shareBtnText, { color: colors.foreground }]}>Copy Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const targetId = createdGroup?.id;
                setCreatedGroup(null);
                if (targetId) router.push(`/split/${targetId}`);
              }}
              style={s.goGroupBtn}
            >
              <Text style={s.goGroupBtnText}>Go to Group Dashboard</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Group Modal */}
      <Modal
        visible={joinModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setJoinModalVisible(false)}
      >
        <Pressable
          style={s.overlay}
          onPress={() => setJoinModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View style={[s.sheet, { paddingBottom: bottomPad + 24 }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Join Group via Code</Text>

          <Text style={s.fieldLabel}>Group Invite Code</Text>
          <View style={[s.inputWrap, inviteCodeFocus && s.inputFocused]}>
            <Ionicons name="key-outline" size={18} color={inviteCodeFocus ? colors.primary : colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput
              testID="input-group-invite-code"
              style={s.input}
              placeholder="Paste invite code (UUID format)"
              placeholderTextColor={colors.mutedForeground}
              value={inviteCodeInput}
              onChangeText={(text) => {
                const uuidRegex = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
                const match = text.match(uuidRegex);
                if (match) {
                  setInviteCodeInput(match[1]);
                } else {
                  setInviteCodeInput(text);
                }
              }}
              onFocus={() => setInviteCodeFocus(true)}
              onBlur={() => setInviteCodeFocus(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {clipboardCode && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setInviteCodeInput(clipboardCode);
                setClipboardCode(null);
              }}
              style={s.clipboardPill}
              testID="button-clipboard-paste"
            >
              <Ionicons name="clipboard-outline" size={14} color={colors.primary} />
              <Text style={s.clipboardPillText} numberOfLines={1}>
                Paste copied code: <Text style={{ fontFamily: "Inter_700Bold" }}>{clipboardCode.slice(0, 8)}...</Text>
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            testID="button-confirm-join-group"
            onPress={handleJoinGroup}
            style={[s.createBtn, { backgroundColor: colors.secondary, shadowColor: colors.secondary }]}
            activeOpacity={0.85}
            disabled={joiningGroup}
          >
            {joiningGroup ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.createBtnText}>Join Group</Text>
            )}
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const splitStyles = (
  colors: ReturnType<typeof useColors>,
  topPad: number,
  bottomPad: number
) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    headerBg: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 280,
    },
    headerBlob: {
      position: "absolute",
      right: -50,
      top: topPad - 20,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: "#c8edd8",
      opacity: 0.55,
    },
    leavesWrap: {
      position: "absolute",
      right: 16,
      top: topPad + 4,
      flexDirection: "row",
      zIndex: 1,
    },
    header: {
      paddingTop: topPad + 8,
      paddingBottom: 14,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 2,
    },
    headerTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    headerSub: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    list: {
      flex: 1,
    },
    headerActionBtnPrimary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: GREEN,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
      shadowColor: GREEN,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    headerActionBtnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerActionText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      paddingHorizontal: 40,
    },
    emptyIconBg: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary + "10",
      alignItems: "center",
      justifyContent: "center",
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 21,
    },
    groupCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    groupIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    groupName: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    groupActivity: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    groupUpdated: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    membersRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
    },
    avatarBubble: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.card,
    },
    avatarText: {
      color: "#fff",
      fontSize: 8,
      fontFamily: "Inter_700Bold",
    },
    memberCountText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginLeft: 6,
    },
    netStatusText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    unsettledSumText: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    deleteBtn: { padding: 4 },
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
    },
    wizardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    },
    backWizardBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      padding: 4,
    },
    backWizardText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
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
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 50,
      backgroundColor: colors.background,
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    addMemberBtn: {
      padding: 4,
    },
    chipsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 10,
      marginBottom: 16,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.primary + "12",
      borderColor: colors.primary + "30",
      borderWidth: 1.2,
      borderRadius: 16,
      paddingLeft: 12,
      paddingRight: 6,
      paddingVertical: 5,
    },
    chipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      marginRight: 4,
    },
    chipRemove: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
    },
    noMembersText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 6,
      marginBottom: 16,
      fontStyle: "italic",
    },
    emojiScroll: {
      gap: 10,
      paddingVertical: 4,
      marginBottom: 4,
    },
    emojiBtn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    colorScroll: {
      gap: 12,
      paddingVertical: 4,
      marginBottom: 16,
    },
    colorBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    createBtn: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
    },
    createBtnText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    dashboardCard: {
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 18,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.02,
      shadowRadius: 3,
      elevation: 1,
    },
    dbRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dbCol: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 6,
      borderRadius: 8,
    },
    dbColActive: {
      backgroundColor: colors.primary + "12",
      borderWidth: 1,
      borderColor: colors.primary + "33",
    },
    dbDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
    },
    dbLabel: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    dbAmount: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
    },
    summaryCtaBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      height: 40,
      marginTop: 12,
      width: "100%",
    },
    summaryCtaBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    activeFilterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.primary + "10",
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.primary + "22",
    },
    activeFilterText: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
    },
    clearFilterBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
    },
    clearFilterText: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    emptyActionsRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 16,
      width: "100%",
      justifyContent: "center",
    },
    emptyActionBtnPrimary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flex: 1,
      maxWidth: 160,
    },
    emptyActionBtnSecondary: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      flex: 1,
      maxWidth: 160,
    },
    emptyActionTextPrimary: {
      color: "#fff",
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    emptyActionTextSecondary: {
      color: colors.primary,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    successBadge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "#2d7a5215",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    successTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    successSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginTop: 4,
      paddingHorizontal: 16,
    },
    successCodeBox: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      marginVertical: 14,
    },
    successCodeLabel: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
      letterSpacing: 0.8,
    },
    successCodeText: {
      fontSize: 14,
      fontFamily: "monospace",
      color: colors.foreground,
      marginTop: 4,
      fontWeight: "bold",
    },
    shareBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 12,
      height: 48,
    },
    shareBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    goGroupBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 48,
      marginTop: 6,
    },
    goGroupBtnText: {
      color: "#fff",
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
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
      marginTop: 16,
      marginBottom: 8,
    },
    searchBarInput: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      paddingVertical: 8,
    },
    searchEmptyCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 20,
    },
    searchEmptyText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    searchEmptySub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    clipboardPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary + "12",
      borderWidth: 1,
      borderColor: colors.primary + "40",
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginTop: 10,
      marginBottom: 6,
      alignSelf: "flex-start",
    },
    clipboardPillText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
  });

export default function SplitScreenWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <SplitScreen />
    </ErrorBoundary>
  );
}
