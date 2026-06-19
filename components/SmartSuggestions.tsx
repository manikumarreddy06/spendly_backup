import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useCurrency } from "@/context/AppContext";
import type { Expense, CustomCategory } from "@/context/AppContext";
import { getSmartSuggestions, type SmartSuggestion } from "@/lib/smartSuggestions";
import { getQuickRepeatTemplates, recordDescription } from "@/lib/smartDescriptions";

interface Props {
  expenses: Expense[];
  customCategories: CustomCategory[];
  onLogExpense: (data: {
    category: string;
    amount: number;
    description: string;
  }) => Promise<void>;
}

/**
 * Smart Suggestions section for the home screen.
 * Shows context-aware expense suggestions based on time of day,
 * spending patterns, and frequent templates.
 * One-tap to log an expense.
 */
export function SmartSuggestions({ expenses, customCategories, onLogExpense }: Props) {
  const colors = useColors();
  const currency = useCurrency();
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const templates = await getQuickRepeatTemplates();
        const result = getSmartSuggestions(
          expenses,
          templates,
          customCategories,
          colors as Record<string, any>
        );
        setSuggestions(result);
      } catch {
        // Non-critical; silently fail
      }
    };
    load();
  }, [expenses, customCategories, colors]);

  const handleQuickLog = useCallback(
    async (suggestion: SmartSuggestion) => {
      if (loading) return;
      setLoading(suggestion.id);
      try {
        await onLogExpense({
          category: suggestion.category,
          amount: suggestion.amount,
          description: suggestion.description,
        });
        await recordDescription(
          suggestion.description,
          suggestion.category,
          suggestion.amount,
          "expense"
        ).catch(() => {});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
          () => {}
        );
      } finally {
        setLoading(null);
      }
    },
    [loading, onLogExpense]
  );

  if (dismissed || suggestions.length === 0) return null;

  const isDark = colors.background !== "#f4faf6";
  const s = stylesFn(colors, isDark);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="sparkles" size={14} color={colors.primary} />
          <Text style={s.headerTitle}>Quick Log</Text>
        </View>
        <TouchableOpacity
          onPress={() => setDismissed(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="close"
            size={16}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>
      <View style={s.row}>
        {suggestions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[s.card, { borderColor: item.color + "30" }]}
            activeOpacity={0.75}
            onPress={() => handleQuickLog(item)}
            disabled={loading !== null}
          >
            {loading === item.id ? (
              <ActivityIndicator size="small" color={item.color} />
            ) : (
              <>
                <View
                  style={[
                    s.iconWrap,
                    { backgroundColor: item.color + "18" },
                  ]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={item.color}
                  />
                </View>
                <Text style={s.desc} numberOfLines={1}>
                  {item.description}
                </Text>
                <Text style={[s.amount, { color: item.color }]}>
                  {currency}{item.amount}
                </Text>
                <Text style={s.reason} numberOfLines={1}>
                  {item.reason}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function stylesFn(colors: ReturnType<typeof useColors>, isDark: boolean) {
  return StyleSheet.create({
    container: {
      marginBottom: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    headerTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    row: {
      flexDirection: "row",
      gap: 8,
    },
    card: {
      flex: 1,
      backgroundColor: isDark ? colors.card : "#f8fffe",
      borderRadius: 14,
      borderWidth: 1.5,
      padding: 12,
      alignItems: "center",
      gap: 6,
      minHeight: 100,
      justifyContent: "center",
    },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    desc: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    amount: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
    },
    reason: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
}
