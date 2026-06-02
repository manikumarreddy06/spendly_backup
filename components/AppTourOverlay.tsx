import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AppTourOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  colors: any;
  notifLayout: LayoutRect | null;
  budgetLayout: LayoutRect | null;
}

export function AppTourOverlay({
  isVisible,
  onClose,
  colors,
  notifLayout,
  budgetLayout,
}: AppTourOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  
  const insets = useSafeAreaInsets();
  const screenDimensions = Dimensions.get("window");
  const screenWidth = screenDimensions.width;
  const screenHeight = screenDimensions.height;

  // Calculate default layouts if measurements aren't ready
  const defaultNotif = {
    x: screenWidth - 62,
    y: (Platform.OS === "web" ? 67 : insets.top) + 14,
    w: 42,
    h: 42,
  };

  const defaultBudget = {
    x: 20,
    y: (Platform.OS === "web" ? 67 : insets.top) + 80,
    w: screenWidth - 40,
    h: 180,
  };

  // FAB position: right 18, bottom 54 + bottomInset + 16, width 52, height 52
  const bottomInset = Platform.OS === "ios" ? insets.bottom : 8;
  const fabLayout = {
    x: screenWidth - 18 - 52,
    y: screenHeight - (54 + bottomInset + 16) - 52,
    w: 52,
    h: 52,
  };

  const tourSteps = [
    {
      title: "Daily Reminders",
      description: "Tap here to schedule daily expense reminders. Staying consistent is key to building healthy budget habits!",
      icon: "notifications-outline",
      iconColor: "#3b82f6",
      getLayout: () => notifLayout || defaultNotif,
    },
    {
      title: "Budget Progress",
      description: "This card shows your monthly ledger and budget status. Keep the ring green to stay within your pacing limits!",
      icon: "pie-chart-outline",
      iconColor: "#10b981",
      getLayout: () => budgetLayout || defaultBudget,
    },
    {
      title: "Quick Add Expense",
      description: "Tap this global button from any tab screen to log new transactions instantly. Swipe categories and use haptic shortcuts!",
      icon: "add-circle-outline",
      iconColor: "#f59e0b",
      getLayout: () => fabLayout,
    },
  ];

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
      setCurrentStep(0);
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    setCurrentStep(0);
  };

  if (!isVisible) return null;

  const activeStep = tourSteps[currentStep];
  const layout = activeStep.getLayout();

  // Deconstruct coordinates
  const { x, y, w, h } = layout;

  const isNearBottom = y > screenHeight / 2;
  
  // Tooltip alignment
  const tooltipStyle = isNearBottom
    ? { bottom: screenHeight - y + 16 }
    : { top: y + h + 16 };

  // Calculate arrow horizontal position (clamped to prevent overflow)
  const arrowLeft = Math.max(24, Math.min(screenWidth - 48 - 24, x + w / 2 - 24));

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isVisible}
      onRequestClose={handleSkip}
    >
      <View style={styles.overlayContainer}>
        {/* Top Overlay Mask */}
        <View style={[styles.mask, { top: 0, left: 0, right: 0, height: Math.max(0, y) }]} />
        
        {/* Bottom Overlay Mask */}
        <View style={[styles.mask, { top: y + h, left: 0, right: 0, bottom: 0 }]} />
        
        {/* Left Overlay Mask */}
        <View style={[styles.mask, { top: y, left: 0, width: Math.max(0, x), height: h }]} />
        
        {/* Right Overlay Mask */}
        <View style={[styles.mask, { top: y, left: x + w, right: 0, height: h }]} />

        {/* Spotlight cutout border highlight */}
        <View
          style={[
            styles.spotlightHighlight,
            {
              top: y - 4,
              left: x - 4,
              width: w + 8,
              height: h + 8,
              borderRadius: currentStep === 1 ? 28 : Math.max(w, h) / 2 + 4,
            },
          ]}
        />

        {/* Tooltip Card */}
        <View style={[styles.tooltipCard, tooltipStyle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Arrow pointing to spotlight */}
          {isNearBottom ? (
            <View style={[styles.arrowDown, { borderTopColor: colors.card, left: arrowLeft }]} />
          ) : (
            <View style={[styles.arrowUp, { borderBottomColor: colors.card, left: arrowLeft }]} />
          )}

          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={[styles.stepText, { color: colors.mutedForeground }]}>
              Step {currentStep + 1} of {tourSteps.length}
            </Text>
            <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} style={styles.skipBtn}>
              <Text style={[styles.skipBtnText, { color: colors.primary }]}>Skip</Text>
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.cardBody}>
            <View style={[styles.iconWrap, { backgroundColor: activeStep.iconColor + "15" }]}>
              <Ionicons name={activeStep.icon as any} size={22} color={activeStep.iconColor} />
            </View>
            <View style={styles.textWrap}>
              <Text style={[styles.title, { color: colors.text }]}>
                {activeStep.title}
              </Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>
                {activeStep.description}
              </Text>
            </View>
          </View>

          {/* Footer dots & button */}
          <View style={styles.cardFooter}>
            <View style={styles.dotsRow}>
              {tourSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: index === currentStep ? colors.primary : colors.border,
                      width: index === currentStep ? 12 : 6,
                    },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={handleNext}
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {currentStep === tourSteps.length - 1 ? "Got it!" : "Next"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  mask: {
    position: "absolute",
    backgroundColor: "rgba(3, 7, 4, 0.72)",
  },
  spotlightHighlight: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#10b981",
    borderStyle: "dashed",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  tooltipCard: {
    position: "absolute",
    left: 24,
    right: 24,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  arrowUp: {
    position: "absolute",
    top: -8,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowDown: {
    position: "absolute",
    bottom: -8,
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  stepText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "System",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  skipBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "System",
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
    fontFamily: "System",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "System",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  nextBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  nextBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "System",
  },
});
