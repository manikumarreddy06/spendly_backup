import { Ionicons } from '@expo/vector-icons';
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
  Alert,
  Switch,
} from 'react-native';
import { InlineError } from '@/components/InlineError';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, ExpenseCategory, CustomCategory, useCurrency } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { getLastExpenseCategory, setLastExpenseCategory, getRecentCategories } from '@/lib/uxPrefs';
import { evaluateMathExpression } from '@/lib/split';
import { BUILTIN_CATEGORIES, BUILTIN_INCOME_CATEGORIES } from '@/constants/categories';
import { recordDescription, getAutocompleteSuggestions, getQuickRepeatTemplates, type FrequentDescription } from '@/lib/smartDescriptions';



type CategoryItem = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  isRecurring?: boolean;
};

function CatIcon({ icon, color, size = 20 }: { icon: string; color: string; size?: number }) {
  return <Ionicons name={icon as any} size={size} color={color} />;
}

function customToItem(c: CustomCategory): CategoryItem {
  return {
    key: c.id,
    label: c.name,
    icon: c.icon,
    color: c.color,
    bg: c.color + '18',
    isRecurring: c.isRecurring,
  };
}

const KEYWORD_TO_CATEGORY: { category: string; keywords: string[] }[] = [
  {
    category: 'healthcare', // Fuel
    keywords: ['petrol', 'fuel', 'diesel', 'gas', 'cng', 'refuel', 'shell', 'hp petrol', 'indian oil'],
  },
  {
    category: 'entertainment', // Coffee
    keywords: ['coffee', 'starbucks', 'cafe', 'tea', 'chai', 'blue tokai', 'ccd', 'nescafe', 'espresso', 'cappuccino', 'latte', 'macchiato'],
  },
  {
    category: 'food', // Food
    keywords: ['food', 'lunch', 'dinner', 'breakfast', 'brunch', 'swiggy', 'zomato', 'restaurant', 'burger', 'pizza', 'kfc', 'mcdonald', 'grocery', 'groceries', 'maggi', 'supermarket', 'snack', 'snacks', 'eat'],
  },
  {
    category: 'shopping', // Shopping
    keywords: ['shopping', 'amazon', 'flipkart', 'myntra', 'zara', 'h&m', 'clothes', 'shoes', 'dress', 'mall', 'electronics', 'phone'],
  },
  {
    category: 'travel', // Travel
    keywords: ['travel', 'flight', 'train', 'bus', 'uber', 'ola', 'rapido', 'cab', 'taxi', 'hotel', 'airbnb', 'trip', 'vacation', 'ticket', 'indigo', 'irctc'],
  },
];

const INCOME_KEYWORD_TO_CATEGORY: { category: string; keywords: string[] }[] = [
  {
    category: 'salary',
    keywords: ['salary', 'paycheck', 'wages', 'stipend', 'pay', 'credited', 'payroll'],
  },
  {
    category: 'freelance',
    keywords: ['freelance', 'client', 'invoice', 'project', 'consulting', 'contract'],
  },
  {
    category: 'investment',
    keywords: ['dividend', 'interest', 'returns', 'profit', 'mutual fund', 'sip', 'stock', 'bond'],
  },
  {
    category: 'gifts',
    keywords: ['gift', 'birthday', 'bonus', 'reward', 'prize'],
  },
  {
    category: 'refunds',
    keywords: ['refund', 'reversal', 'cashback', 'reversal', 'returned', 'reimbursement'],
  },
];

function classifyText(
  text: string,
  customCategories: CustomCategory[],
  entryType: "expense" | "income" = "expense"
): string | null {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return null;

  // Income mode: only check income keywords (no custom categories)
  if (entryType === "income") {
    for (const item of INCOME_KEYWORD_TO_CATEGORY) {
      for (const kw of item.keywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(normalized)) {
          return item.category;
        }
      }
    }
    return null;
  }

  // Expense mode: check custom categories first
  for (const c of customCategories) {
    const catName = c.name.toLowerCase().trim();
    if (catName.length > 2) {
      const regex = new RegExp(`\\b${catName}\\b`, 'i');
      if (regex.test(normalized)) {
        return c.id;
      }
    }
  }

  // Then check default keyword mapping
  for (const item of KEYWORD_TO_CATEGORY) {
    for (const kw of item.keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(normalized)) {
        return item.category;
      }
    }
  }

  return null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function QuickLogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currency = useCurrency();
  const { addExpense, expenses = [], customCategories = [] } = useApp();
  const amountRef = useRef<TextInput>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [entryType, setEntryType] = useState<"expense" | "income">("expense");

  const hasActiveRecurringBill = useMemo(() => {
    return expenses.some(e => e.recurring === "monthly" && !e.recurringGroupId && e.category === selectedCategory);
  }, [expenses, selectedCategory]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [hasInitializedCategory, setHasInitializedCategory] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isSavingRef = useRef(false);

  // Smart descriptions: autocomplete & quick repeat
  const [autocompleteResults, setAutocompleteResults] = useState<FrequentDescription[]>([]);
  const [quickRepeatTemplates, setQuickRepeatTemplates] = useState<FrequentDescription[]>([]);
  const autocompleteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load quick repeat templates on mount
  useEffect(() => {
    getQuickRepeatTemplates("expense")
      .then(setQuickRepeatTemplates)
      .catch(() => {});
  }, []);

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

  const allCategories: CategoryItem[] = useMemo(() => {
    if (entryType === "income") {
      return BUILTIN_INCOME_CATEGORIES.map(c => ({
        ...c,
        bg: colors.background !== '#f4faf6' ? c.color + '25' : c.bg,
      }));
    }
    const list = [
      ...BUILTIN_CATEGORIES.map(c => ({
        ...c,
        bg: colors.background !== '#f4faf6' ? c.color + '25' : c.bg,
      })),
      ...(customCategories || []).map(customToItem),
    ];
    if (recentKeys.length === 0) return list;
    return [...list].sort((a, b) => {
      const indexA = recentKeys.indexOf(a.key);
      const indexB = recentKeys.indexOf(b.key);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });
  }, [colors.background, customCategories, recentKeys, entryType]);

  // Reset selected category when switching between expense/income
  useEffect(() => {
    if (entryType === "income") {
      setSelectedCategory("salary");
    } else {
      setSelectedCategory("food");
    }
    setDescription("");
    setAmount("");
  }, [entryType]);

  // Load last used category and recent categories once on mount
  useEffect(() => {
    let mounted = true;
    Promise.all([
      getLastExpenseCategory('food'),
      getRecentCategories(),
    ]).then(([category, recents]) => {
      if (!mounted) return;
      setRecentKeys(recents);

      const list: CategoryItem[] = [
        ...BUILTIN_CATEGORIES.map(c => ({
          ...c,
          bg: colors.background !== '#f4faf6' ? c.color + '25' : c.bg,
        })),
        ...(customCategories || []).map(customToItem),
      ];
      const nextCategory = list.some((cat) => cat.key === category)
        ? category
        : list[0]?.key || 'food';
      setSelectedCategory(nextCategory);

      const matchingCat = list.find((cat) => cat.key === nextCategory);
      const isCatRecur = (matchingCat && !!matchingCat.isRecurring) || expenses.some(
        (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === nextCategory
      );
      setIsRecurring(isCatRecur);

      setHasInitializedCategory(true);
    });

    // Fast, smooth autofocus timing (60ms) to sync keyboard with slide-up
    const timer = setTimeout(() => amountRef.current?.focus(), 60);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Sync category if customCategories load/populate after mount (e.g. cold start notifications)
  useEffect(() => {
    if (hasInitializedCategory || !customCategories || customCategories.length === 0) return;

    getLastExpenseCategory('food').then((category) => {
      const list: CategoryItem[] = [
        ...BUILTIN_CATEGORIES.map(c => ({
          ...c,
          bg: colors.background !== '#f4faf6' ? c.color + '25' : c.bg,
        })),
        ...customCategories.map(customToItem),
      ];
      if (list.some((cat) => cat.key === category)) {
        setSelectedCategory(category);
        const matchingCat = list.find((cat) => cat.key === category);
        const isCatRecur = (matchingCat && !!matchingCat.isRecurring) || expenses.some(
          (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === category
        );
        setIsRecurring(isCatRecur);
        setHasInitializedCategory(true);
      }
    });
  }, [customCategories, hasInitializedCategory]);

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
    if (isSavingRef.current) return;

    const resolvedAmt = evaluateMathExpression(amount);
    const parsed = resolvedAmt !== null ? Math.round(resolvedAmt * 100) / 100 : parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg("Please enter a valid expense amount greater than zero.");
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    try {
      await addExpense({
        category: selectedCategory as ExpenseCategory,
        amount: parsed,
        description: description.trim() || activeCat.label,
        date: new Date().toISOString(),
        type: entryType,
        recurring: isRecurring ? "monthly" : null,
      });
      await setLastExpenseCategory(selectedCategory);
      // Track description frequency for smart autocomplete (non-blocking)
      recordDescription(description.trim() || activeCat.label, selectedCategory, parsed, entryType).catch(() => {});
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);

      // Play success animation then close
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
        Animated.timing(successOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Keyboard.dismiss();
          Animated.parallel([
            Animated.timing(bgOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(slideY, { toValue: 400, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          ]).start(() => {
            router.back();
          });
        }, 900);
      });
    } catch (e) {
      isSavingRef.current = false;
      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [amount, selectedCategory, description, addExpense, dismiss, entryType, activeCat]);

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
            <View style={[s.headerIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name={entryType === "income" ? "trending-up" : "flash"} size={18} color={colors.primary} />
            </View>
            <Text style={s.headerTitle}>{entryType === "income" ? "Add Income" : "Quick Log"}</Text>
          </View>
          <TouchableOpacity onPress={dismiss} style={s.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

          {/* Expense / Income Toggle */}
          <View style={s.toggleContainer}>
            <TouchableOpacity
              style={[s.toggleBtn, entryType === "expense" && s.toggleBtnActive]}
              onPress={() => {
                if (entryType !== "expense") {
                  setEntryType("expense");
                  Haptics.selectionAsync();
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: entryType === "expense" }}
              accessibilityLabel="Expense mode"
            >
              <Ionicons name="arrow-up" size={14} color={entryType === "expense" ? "#fff" : colors.mutedForeground} />
              <Text style={[s.toggleBtnText, entryType === "expense" && s.toggleBtnTextActive]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, entryType === "income" && s.toggleBtnActiveIncome]}
              onPress={() => {
                if (entryType !== "income") {
                  setEntryType("income");
                  Haptics.selectionAsync();
                }
              }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: entryType === "income" }}
              accessibilityLabel="Income mode"
            >
              <Ionicons name="arrow-down" size={14} color={entryType === "income" ? "#fff" : colors.mutedForeground} />
              <Text style={[s.toggleBtnText, entryType === "income" && s.toggleBtnTextActive]}>Income</Text>
            </TouchableOpacity>
          </View>

          <View style={s.content}>
            {/* Amount Input */}
            <View style={s.amountRow}>
              <View style={[s.amountCatIcon, { backgroundColor: activeCat.color + '18' }]}>
                <CatIcon icon={activeCat.icon} color={activeCat.color} size={15} />
              </View>
              <Text style={s.amountCatLabel}>{activeCat.label}</Text>
              <View style={s.amountDivider} />
              <Text style={s.rupee}>{currency}</Text>
              <TextInput
                ref={amountRef}
                style={s.amountInput}
                value={amount}
                onChangeText={(val) => {
                  setAmount(val);
                  if (errorMsg) setErrorMsg('');
                }}
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
            {(() => {
              if (amount.trim() && (amount.includes('+') || amount.includes('-') || amount.includes('*') || amount.includes('/'))) {
                const resolved = evaluateMathExpression(amount);
                if (resolved !== null && !isNaN(resolved) && resolved > 0) {
                  return (
                    <View style={s.mathPreviewContainer}>
                      <Ionicons name="calculator-outline" size={12} color={colors.primary} />
                      <Text style={s.mathPreviewText}>Total: {currency}{Math.round(resolved).toLocaleString()}</Text>
                    </View>
                  );
                }
              }
              return null;
            })()}
            <InlineError message={errorMsg} visible={!!errorMsg} />

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
                    accessibilityLabel={`${cat.label} category`}
                    accessibilityState={{ selected: active }}
                    accessibilityRole="radio"
                    style={[
                      s.catChip,
                      {
                        backgroundColor: active ? cat.color : cat.bg,
                        borderColor: active ? cat.color : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      setSelectedCategory(cat.key);
                      const isCatRecur = !!cat.isRecurring || expenses.some(
                        (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === cat.key
                      );
                      setIsRecurring(isCatRecur);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.75}
                  >
                    <CatIcon icon={cat.icon} color={active ? '#fff' : cat.color} size={16} />
                    <Text style={[s.catChipLabel, { color: active ? '#fff' : cat.color }]}>
                      {cat.label}
                    </Text>
                    {cat.isRecurring && (
                      <Ionicons
                        name="repeat"
                        size={12}
                        color={active ? '#fff' : cat.color}
                        style={{ marginLeft: 3 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Note / Description */}
            <Text style={s.label}>Note <Text style={s.optional}>(optional)</Text></Text>
            <View style={s.noteWrap}>
              <TextInput
                style={s.noteInput}
                placeholder={entryType === "income" ? "e.g. Monthly salary" : "e.g. Lunch at cafe"}
                placeholderTextColor={colors.mutedForeground + '60'}
                value={description}
                onChangeText={(text) => {
                  setDescription(text);
                  // Smart autocomplete: debounce search
                  if (autocompleteDebounceRef.current) {
                    clearTimeout(autocompleteDebounceRef.current);
                  }
                  if (text.trim().length >= 1) {
                    autocompleteDebounceRef.current = setTimeout(() => {
                      getAutocompleteSuggestions(text.trim(), entryType)
                        .then(setAutocompleteResults)
                        .catch(() => setAutocompleteResults([]));
                    }, 200);
                  } else {
                    setAutocompleteResults([]);
                  }
                  const matched = classifyText(text, customCategories, entryType);
                  if (matched && matched !== selectedCategory) {
                    setSelectedCategory(matched);
                    const matchingCat = allCategories.find((c) => c.key === matched);
                    const isCatRecur = (matchingCat && !!matchingCat.isRecurring) || expenses.some(
                      (e) => e.recurring === "monthly" && !e.recurringGroupId && e.category === matched
                    );
                    setIsRecurring(isCatRecur);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  }
                }}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </View>

            {/* Autocomplete Suggestions */}
            {autocompleteResults.length > 0 && (
              <View style={s.autocompleteContainer}>
                {autocompleteResults.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.description}-${idx}`}
                    style={s.autocompleteChip}
                    activeOpacity={0.7}
                    onPress={() => {
                      setDescription(item.description);
                      setSelectedCategory(item.category);
                      setAmount(item.avgAmount > 0 ? String(item.avgAmount) : amount);
                      setAutocompleteResults([]);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }}
                  >
                    <Ionicons name="time-outline" size={14} color={colors.mutedForeground} />
                    <Text style={s.autocompleteText} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <Text style={s.autocompleteAmount}>
                      {currency}{item.avgAmount}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Quick Repeat Templates */}
            {entryType === "expense" && quickRepeatTemplates.length > 0 && !description && autocompleteResults.length === 0 && (
              <View style={s.quickRepeatContainer}>
                <Text style={s.quickRepeatLabel}>Quick Repeat</Text>
                <View style={s.quickRepeatRow}>
                  {quickRepeatTemplates.map((item, idx) => {
                    const catMeta = allCategories.find((c) => c.key === item.category);
                    const catColor = catMeta?.color || colors.primary;
                    return (
                      <TouchableOpacity
                        key={`qr-${idx}`}
                        style={[s.quickRepeatChip, { borderColor: catColor + "40" }]}
                        activeOpacity={0.7}
                        onPress={async () => {
                          // One-tap log: pre-fill and save immediately
                          const resolvedAmt = item.avgAmount;
                          if (resolvedAmt <= 0) return;
                          try {
                            await addExpense({
                              category: item.category as ExpenseCategory,
                              amount: resolvedAmt,
                              description: item.description,
                              date: new Date().toISOString(),
                              type: "expense",
                              recurring: null,
                            });
                            await recordDescription(item.description, item.category, resolvedAmt, "expense").catch(() => {});
                            await setLastExpenseCategory(item.category);
                            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setSaved(true);
                            Animated.parallel([
                              Animated.spring(successScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 180 }),
                              Animated.timing(successOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
                            ]).start(() => {
                              setTimeout(() => {
                                Keyboard.dismiss();
                                Animated.parallel([
                                  Animated.timing(bgOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
                                  Animated.timing(slideY, { toValue: 400, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
                                ]).start(() => router.back());
                              }, 900);
                            });
                          } catch (e) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                          }
                        }}
                      >
                        <Ionicons
                          name={(catMeta?.icon as any) || "flash"}
                          size={14}
                          color={catColor}
                        />
                        <Text style={[s.quickRepeatText, { color: catColor }]} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Text style={[s.quickRepeatAmount, { color: catColor }]}>
                          {currency}{item.avgAmount}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Recurring Toggle */}
            <View style={s.toggleRow}>
              <View style={s.toggleLeft}>
                <Ionicons name="repeat-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <View>
                  <Text style={s.toggleLabel}>Repeat Monthly</Text>
                  <Text style={s.toggleSub}>{entryType === "income" ? "Salary, freelance, etc." : "Rent, subscription, EMI, etc."}</Text>
                </View>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={isRecurring ? colors.primary : colors.mutedForeground}
              />
            </View>

            {isRecurring && hasActiveRecurringBill && (
              <View style={s.recurringAlert}>
                <Ionicons name="information-circle" size={16} color={colors.primary} />
                <Text style={s.recurringAlertText}>
                  This category already has an active recurring bill setup. It logs automatically every month.
                </Text>
              </View>
            )}

            {/* Save Button */}
            <TouchableOpacity
              style={[s.saveBtn, { opacity: saving ? 0.7 : 1 }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving || saved}
              accessibilityLabel={entryType === "income" ? "Save income" : "Save expense"}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={entryType === "income" ? ["#10b981", "#059669"] : [colors.primary, colors.primary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.saveBtnGradient}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.saveBtnText}>
                  {saving ? 'Saving…' : entryType === 'income' ? 'Save Income' : 'Save Expense'}
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
    toggleContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? colors.background : '#f0faf5',
      borderRadius: 14,
      padding: 4,
      marginHorizontal: 20,
      marginBottom: 4,
      gap: 4,
    },
    toggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 11,
    },
    toggleBtnActive: {
      backgroundColor: colors.primary,
    },
    toggleBtnActiveIncome: {
      backgroundColor: '#10b981',
    },
    toggleBtnText: {
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
    },
    toggleBtnTextActive: {
      color: '#fff',
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
      color: colors.primary,
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      marginBottom: 20,
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
    saveBtn: {
      borderRadius: 18,
      overflow: 'hidden',
      shadowColor: colors.primary,
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
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
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
    mathPreviewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      marginTop: -16,
      marginBottom: 20,
    },
    mathPreviewText: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.primary,
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
    // Autocomplete suggestions
    autocompleteContainer: {
      marginTop: -20,
      marginBottom: 16,
      gap: 4,
    },
    autocompleteChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? colors.card : "#f8fffe",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    autocompleteText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    autocompleteAmount: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    // Quick repeat templates
    quickRepeatContainer: {
      marginBottom: 16,
    },
    quickRepeatLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
    },
    quickRepeatRow: {
      flexDirection: "row",
      gap: 8,
    },
    quickRepeatChip: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: isDark ? colors.card : "#f8fffe",
      borderRadius: 12,
      borderWidth: 1.5,
    },
    quickRepeatText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    quickRepeatAmount: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
    },
  });
}
