import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, ExpenseCategory, CustomCategory } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getLastExpenseCategory, setLastExpenseCategory } from '@/lib/uxPrefs';
import { evaluateMathExpression } from '@/lib/split';

const GREEN = '#18633f';
const GREEN_DARK = '#134830';

type CategoryItem = {
  key: string;
  label: string;
  icon: string;
  iconSet?: 'ion' | 'mci';
  color: string;
  bg: string;
};

const BUILTIN_CATEGORIES: CategoryItem[] = [
  { key: 'food',          label: 'Food',          icon: 'silverware-fork-knife', iconSet: 'mci', color: '#f97316', bg: '#fff5e6' },
  { key: 'travel',        label: 'Travel',        icon: 'airplane',              iconSet: 'ion', color: '#10b981', bg: '#e6f7f0' },
  { key: 'shopping',      label: 'Shopping',      icon: 'bag-handle',            iconSet: 'ion', color: '#a855f7', bg: '#f5ebff' },
  { key: 'entertainment', label: 'Fun',           icon: 'game-controller',       iconSet: 'ion', color: '#ec4899', bg: '#fdf0f5' },
  { key: 'healthcare',    label: 'Health',        icon: 'heart',                 iconSet: 'ion', color: '#ef4444', bg: '#fdebeb' },
  { key: 'others',        label: 'Others',        icon: 'ellipsis-horizontal',   iconSet: 'ion', color: '#6b7280', bg: '#f0f2f5' },
];

function CatIcon({ icon, iconSet, color, size = 20 }: { icon: string; iconSet?: 'ion' | 'mci'; color: string; size?: number }) {
  if (iconSet === 'mci') return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
  return <Ionicons name={icon as any} size={size} color={color} />;
}

function customToItem(c: CustomCategory): CategoryItem {
  return {
    key: c.id,
    label: c.name,
    icon: c.icon,
    iconSet: 'ion',
    color: c.color,
    bg: c.color + '18',
  };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function QuickLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addExpense, customCategories = [] } = useApp();
  const amountRef = useRef<TextInput>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Success animation
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // Slide-up entrance animation
  const slideY = useRef(new Animated.Value(300)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const allCategories: CategoryItem[] = useMemo(() => [
    ...BUILTIN_CATEGORIES.map(c => ({
      ...c,
      bg: colors.background !== '#f4faf6' ? c.color + '25' : c.bg,
    })),
    ...(customCategories || []).map(customToItem),
  ], [colors.background, customCategories]);

  useEffect(() => {
    let mounted = true;
    getLastExpenseCategory('food').then((category) => {
      if (!mounted) return;
      const nextCategory = allCategories.some((cat) => cat.key === category)
        ? category
        : allCategories[0]?.key || 'food';
      setSelectedCategory(nextCategory);
    });
    const timer = setTimeout(() => amountRef.current?.focus(), 260);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [allCategories]);

  const activeCat = allCategories.find(c => c.key === selectedCategory) || allCategories[0];

  const isDark = colors.background !== '#f4faf6';

  const dismiss = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 400, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
    ]).start(() => router.back());
  }, [router]);

  const handleSave = useCallback(async () => {
    const resolvedAmt = evaluateMathExpression(amount);
    const parsed = resolvedAmt !== null ? resolvedAmt : parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await addExpense({
        category: selectedCategory as ExpenseCategory,
        amount: parsed,
        description: description.trim() || activeCat.label,
        date: new Date().toISOString(),
      });
      await setLastExpenseCategory(selectedCategory);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);

      // Play success animation then close
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
        Animated.timing(successOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => dismiss(), 900);
      });
    } catch (e) {
      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [amount, selectedCategory, description, addExpense, dismiss]);

  const s = styles(colors, insets, isDark);

  return (
    <View style={s.root}>
      {/* Dimmed background — tapping dismisses */}
      <Animated.View style={[s.backdrop, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient
          colors={isDark ? ['#0d1f16', '#0b1610'] : ['#f0faf5', '#ffffff']}
          style={s.sheetGradient}
        />

        {/* Handle bar */}
        <View style={s.handle} />

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={[s.headerIcon, { backgroundColor: GREEN + '18' }]}>
              <Ionicons name="flash" size={18} color={GREEN} />
            </View>
            <Text style={s.headerTitle}>Quick Log</Text>
          </View>
          <TouchableOpacity onPress={dismiss} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

          <View style={s.content}>
            {/* Amount Input */}
            <View style={s.amountRow}>
              <View style={[s.amountCatIcon, { backgroundColor: activeCat.color + '18' }]}>
                <CatIcon icon={activeCat.icon} iconSet={activeCat.iconSet} color={activeCat.color} size={15} />
              </View>
              <Text style={s.amountCatLabel}>{activeCat.label}</Text>
              <View style={s.amountDivider} />
              <Text style={s.rupee}>₹</Text>
              <TextInput
                ref={amountRef}
                style={s.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numbers-and-punctuation"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground + '60'}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                maxLength={10}
                onBlur={() => {
                  if (amount.trim()) {
                    const resolved = evaluateMathExpression(amount);
                    if (resolved !== null) {
                      setAmount(resolved.toFixed(2));
                    }
                  }
                }}
              />
            </View>

            {/* Category Chips */}
            <Text style={s.label}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.catRow}
              keyboardShouldPersistTaps="handled"
            >
              {allCategories.map(cat => {
                const active = selectedCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      s.catChip,
                      {
                        backgroundColor: active ? cat.color : cat.bg,
                        borderColor: active ? cat.color : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat.key);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.75}
                  >
                    <CatIcon icon={cat.icon} iconSet={cat.iconSet} color={active ? '#fff' : cat.color} size={16} />
                    <Text style={[s.catChipLabel, { color: active ? '#fff' : cat.color }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ height: 16 }} />

            {/* Save Button */}
            <TouchableOpacity
              style={[s.saveBtn, { opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving || saved}
            >
              <LinearGradient
                colors={[GREEN, GREEN_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.saveBtnGradient}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>
                  {saving ? 'Saving…' : 'Save Expense'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

        {/* Success Overlay */}
        {saved && (
          <Animated.View
            style={[s.successOverlay, { opacity: successOpacity }]}
            pointerEvents="none"
          >
            <Animated.View style={[s.successCircle, { transform: [{ scale: successScale }] }]}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </Animated.View>
            <Animated.Text style={[s.successText, { transform: [{ scale: successScale }] }]}>
              Logged! ✨
            </Animated.Text>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

function styles(
  colors: ReturnType<typeof useColors>,
  insets: { top: number; bottom: number },
  isDark: boolean
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      maxHeight: SCREEN_HEIGHT * 0.82,
      overflow: 'hidden',
      paddingBottom: insets.bottom + 16,
    },
    sheetGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    headerIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.muted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : '#f8fffe',
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderWidth: 2,
      borderColor: colors.primary + '30',
      marginBottom: 24,
    },
    amountCatIcon: {
      width: 28,
      height: 28,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    amountCatLabel: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.foreground,
      marginLeft: 6,
    },
    amountDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.border,
      marginHorizontal: 10,
    },
    rupee: {
      fontSize: 36,
      fontFamily: 'Inter_600SemiBold',
      color: GREEN,
      marginRight: 4,
    },
    amountInput: {
      flex: 1,
      fontSize: 48,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      letterSpacing: -1,
    },
    label: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    optional: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      textTransform: 'none',
      letterSpacing: 0,
    },
    catRow: {
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 24,
    },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 24,
      borderWidth: 1.5,
    },
    catChipLabel: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    noteWrap: {
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 4,
      marginBottom: 28,
      minHeight: 46,
      justifyContent: 'center',
    },
    noteInput: {
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      minHeight: 38,
    },
    saveBtn: {
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: GREEN,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },
    saveBtnGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 17,
    },
    saveBtnText: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: '#fff',
      letterSpacing: -0.3,
    },
    successOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(11,22,16,0.92)' : 'rgba(255,255,255,0.92)',
    },
    successCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: GREEN,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: GREEN,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 12,
    },
    successText: {
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
      color: colors.foreground,
      marginTop: 16,
    },
  });
}
