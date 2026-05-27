import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const GREEN = "#18633f";
const GREEN_LIGHT = "#1a5e3d";
const ICON_COLS = 5;
const ICON_GAP = 8;

const PALETTE = [
  "#18633f",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#3b82f6",
  "#14b8a6",
];

const ICONS: { name: string; set?: "ion" | "mci" }[] = [
  { name: "grid", set: "ion" },
  { name: "bag-handle", set: "ion" },
  { name: "gift", set: "ion" },
  { name: "school", set: "ion" },
  { name: "car-sport", set: "ion" },
  { name: "car", set: "ion" },
  { name: "home", set: "ion" },
  { name: "game-controller", set: "ion" },
  { name: "airplane", set: "ion" },
  { name: "musical-notes", set: "ion" },
  { name: "paw", set: "ion" },
  { name: "briefcase", set: "ion" },
  { name: "camera", set: "ion" },
  { name: "leaf", set: "ion" },
  { name: "ellipsis-horizontal", set: "ion" },
];

function CategoryIcon({
  name,
  iconSet,
  color,
  size = 20,
}: {
  name: string;
  iconSet?: "ion" | "mci";
  color: string;
  size?: number;
}) {
  if (iconSet === "mci") {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

export default function AddCategoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addCustomCategory, setBudgetLimit } = useApp();
  const colors = useColors();
  const isDark = colors.background !== "#f4faf6";

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const screenWidth = Dimensions.get("window").width;
  const formPad = 20;
  const iconTileSize =
    (screenWidth - formPad * 2 - ICON_GAP * (ICON_COLS - 1)) / ICON_COLS;

  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(ICONS[0].name);
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]);
  const [monthlyLimit, setMonthlyLimit] = useState("");

  const limitNum = parseInt(monthlyLimit.replace(/,/g, ""), 10);
  const hasLimit = !isNaN(limitNum) && limitNum > 0;
  const previewName = name.trim() || "Your Category";

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter a category name.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = await addCustomCategory(name.trim(), selectedColor, selectedIcon);
    if (hasLimit) {
      await setBudgetLimit(id, limitNum);
    }
    router.back();
  };

  const s = useMemo(() => createStyles(colors, topPad, bottomPad), [colors, topPad, bottomPad]);

  return (
    <View style={s.root}>
      {/* Green header zone */}
      <View style={[s.topZone, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>

        <View style={s.titleRow}>
          <View style={s.titleBlock}>
            <Text style={s.title}>Add Category</Text>
            <Text style={s.subtitle}>Create your own space to track expenses 🌿</Text>
          </View>

          <View style={s.headerArt} pointerEvents="none">
            <View style={s.artGlow} />
            <Ionicons name="leaf" size={12} color={isDark ? "#34d399" : "#86efac"} style={s.artLeaf1} />
            <Ionicons name="leaf" size={18} color={isDark ? "#059669" : "#4ade80"} style={s.artLeaf2} />
            <Ionicons name="sparkles" size={10} color={isDark ? "#34d399" : "#86efac"} style={s.artSparkle1} />
            <Ionicons name="sparkles" size={8} color={isDark ? "#6ee7b7" : "#a7f3d0"} style={s.artSparkle2} />
            <View style={s.artSquare}>
              <Ionicons name="add" size={22} color={colors.primary} />
            </View>
          </View>
        </View>
      </View>

      {/* White/Dark sheet form */}
      <KeyboardAvoidingView
        style={s.sheetWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={s.sheetScroll}
          contentContainerStyle={[s.sheetContent, { paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.label}>Category Name</Text>
          <View style={s.inputWrap}>
            <TextInput
              testID="input-category-name"
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Gifts, Education, Fuel"
              placeholderTextColor={colors.mutedForeground + "80"}
              autoCapitalize="words"
              maxLength={24}
            />
            <Text style={s.aaIcon}>Aa</Text>
          </View>

          <Text style={s.label}>Choose an Icon</Text>
          <View style={s.iconGrid}>
            {ICONS.map((icon) => {
              const isSelected = selectedIcon === icon.name;
              return (
                <TouchableOpacity
                  key={icon.name}
                  testID={`button-icon-${icon.name}`}
                  style={[
                    s.iconTile,
                    { width: iconTileSize, height: iconTileSize },
                    isSelected && s.iconTileSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedIcon(icon.name);
                  }}
                  activeOpacity={0.8}
                >
                  <CategoryIcon
                    name={icon.name}
                    iconSet={icon.set}
                    color={isSelected ? colors.primary : colors.mutedForeground}
                    size={20}
                  />
                  {isSelected && (
                    <View style={s.iconCheck}>
                      <Ionicons name="checkmark" size={9} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>Choose a Color</Text>
          <View style={s.colorRow}>
            {PALETTE.map((color) => {
              const isSelected = selectedColor === color;
              return (
                <TouchableOpacity
                  key={color}
                  testID={`button-color-${color}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSelectedColor(color);
                  }}
                  activeOpacity={0.85}
                  style={[s.colorOuter, isSelected && s.colorOuterSelected]}
                >
                  <View style={[s.colorCircle, { backgroundColor: color }]}>
                    {isSelected && <View style={s.colorDot} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>
            Set Monthly Limit <Text style={s.labelOptional}>(Optional)</Text>
          </Text>
          <View style={s.inputWrap}>
            <Text style={s.rupeePrefix}>₹</Text>
            <TextInput
              testID="input-monthly-limit"
              style={s.input}
              value={monthlyLimit}
              onChangeText={(t) => setMonthlyLimit(t.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 2,000"
              placeholderTextColor={colors.mutedForeground + "80"}
              keyboardType="number-pad"
              maxLength={8}
            />
            <Ionicons name="wallet-outline" size={18} color={colors.mutedForeground} />
          </View>

          <Text style={s.label}>Category Preview</Text>
          <View style={s.previewBox}>
            <View style={[s.previewIcon, { backgroundColor: selectedColor + "18" }]}>
              <CategoryIcon name={selectedIcon} color={selectedColor} size={18} />
            </View>
            <View style={s.previewText}>
              <Text style={s.previewTitle}>{previewName}</Text>
              <Text style={s.previewSub}>₹0 spent this month</Text>
            </View>
            <View style={[s.previewBadge, { backgroundColor: selectedColor + "14" }]}>
              <Text style={[s.previewBadgePct, { color: selectedColor }]}>0%</Text>
              <Text style={[s.previewBadgeSub, { color: selectedColor }]}>of limit</Text>
            </View>
          </View>

          <TouchableOpacity
            testID="button-create-category"
            onPress={handleCreate}
            activeOpacity={0.9}
            style={s.createBtnWrap}
          >
            <LinearGradient
              colors={[colors.primary, colors.primary + "dd"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.createBtn}
            >
              <Text style={s.createBtnText}>Create Category</Text>
              <Ionicons name="sparkles" size={14} color="#fff" style={{ marginLeft: 6 }} />
              <Ionicons name="sparkles" size={11} color="rgba(255,255,255,0.75)" />
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>, topPad: number, bottomPad: number) {
  const isDark = colors.background !== "#f4faf6";
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: isDark ? colors.background : "#e8f5ec",
    },
    topZone: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
    },
    titleBlock: {
      flex: 1,
      paddingRight: 12,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.4,
    },
    subtitle: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
      lineHeight: 18,
    },
    headerArt: {
      width: 72,
      height: 72,
      alignItems: "center",
      justifyContent: "center",
    },
    artGlow: {
      position: "absolute",
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDark ? colors.primary + "18" : "#c8edd8",
      opacity: 0.8,
    },
    artLeaf1: {
      position: "absolute",
      top: 2,
      right: 4,
      transform: [{ rotate: "-25deg" }],
    },
    artLeaf2: {
      position: "absolute",
      top: 10,
      right: 20,
      transform: [{ rotate: "12deg" }],
    },
    artSparkle1: {
      position: "absolute",
      top: 0,
      right: 16,
    },
    artSparkle2: {
      position: "absolute",
      bottom: 10,
      left: 2,
    },
    artSquare: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 8,
      elevation: 3,
      zIndex: 1,
    },
    sheetWrap: {
      flex: 1,
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: isDark ? 0.25 : 0.06,
      shadowRadius: 12,
      elevation: 8,
    },
    sheetScroll: {
      flex: 1,
    },
    sheetContent: {
      paddingHorizontal: 20,
      paddingTop: 22,
    },
    label: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 10,
    },
    labelOptional: {
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      fontSize: 14,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      backgroundColor: colors.background,
      marginBottom: 18,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    aaIcon: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    rupeePrefix: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      marginRight: 4,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: ICON_GAP,
      marginBottom: 18,
    },
    iconTile: {
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.15 : 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    iconTileSelected: {
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: colors.primary + "18",
    },
    iconCheck: {
      position: "absolute",
      top: -5,
      right: -5,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    colorRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 18,
      paddingHorizontal: 2,
    },
    colorOuter: {
      padding: 2,
      borderRadius: 20,
    },
    colorOuterSelected: {
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 22,
    },
    colorCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    colorDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "#fff",
    },
    previewBox: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      backgroundColor: colors.background,
      marginBottom: 20,
    },
    previewIcon: {
      width: 40,
      height: 40,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    previewText: {
      flex: 1,
      marginLeft: 10,
    },
    previewTitle: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    previewSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    previewBadge: {
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 8,
    },
    previewBadgePct: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
    },
    previewBadgeSub: {
      fontSize: 8,
      fontFamily: "Inter_500Medium",
    },
    createBtnWrap: {
      marginBottom: 8,
    },
    createBtn: {
      height: 52,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    createBtnText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
  });
}
