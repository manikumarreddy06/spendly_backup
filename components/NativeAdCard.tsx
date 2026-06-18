import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Linking,
  Animated,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ADMOB_BANNER_AD_UNIT_ID, ADS_ENABLED } from "@/lib/config";

// Dynamically require AdMob to prevent compile-time crashes in non-native / Web environments
let AdMob: any = null;
try {
  AdMob = require("react-native-google-mobile-ads");
} catch (e) {
  // Silent fallback
}

export type AdCampaign = {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  icon: string;
  url: string;
  gradientColors: [string, string];
};

const DEFAULT_CAMPAIGNS: AdCampaign[] = [
  {
    id: "share_app",
    title: "Share Spendly",
    description: "Enjoying the app? Share Spendly with friends and family to help them track their spending and splits effortlessly.",
    ctaText: "Share App",
    icon: "share-social",
    url: "share_app",
    gradientColors: ["#047857", "#064e3b"], // Emerald
  },
  {
    id: "rate_app",
    title: "Rate Us 5 Stars",
    description: "Love using Spendly? Take a moment to rate us on the Play Store. Your feedback helps us improve and grow!",
    ctaText: "Rate Us",
    icon: "star",
    url: "https://play.google.com/store/apps/details?id=com.spendlyapp.personal",
    gradientColors: ["#b45309", "#78350f"], // Amber Gold
  },
];

const DISMISS_KEY = "@spendly_ad_dismissed_time";
const SETTINGS_KEY = "@spendly_ad_settings";

export function NativeAdCard({ placement = "dashboard", noPadding = false }: { placement?: "dashboard" | "insights"; noPadding?: boolean }) {
  const colors = useColors();
  const [isVisible, setIsVisible] = useState(false);
  const [adFreeMode, setAdFreeMode] = useState(false);
  const [showOnInsights, setShowOnInsights] = useState(true);
  const [activeCampaign, setActiveCampaign] = useState<AdCampaign | null>(null);
  const [adFailed, setAdFailed] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const BannerAd = AdMob?.BannerAd;
  const BannerAdSize = AdMob?.BannerAdSize;

  // Initialize AdMob SDK on native mount
  useEffect(() => {
    if (!ADS_ENABLED) return;

    const initAds = async () => {
      try {
        const mobileAds = typeof AdMob === "function" ? AdMob : AdMob?.default;
        if (mobileAds) {
          await mobileAds().initialize();
        }
      } catch (e) {
        console.warn("Failed to initialize AdMob SDK:", e);
      }
    };
    initAds();
  }, []);

  // Load Settings and Dismiss state
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // 1. Load Settings
        const settingsStr = await AsyncStorage.getItem(SETTINGS_KEY);
        let settings = { adFreeMode: false, showOnInsights: true };
        if (settingsStr) {
          try {
            settings = { ...settings, ...JSON.parse(settingsStr) };
          } catch (e) {
            console.warn("Error parsing ad settings, using defaults", e);
          }
        }

        setAdFreeMode(settings.adFreeMode);
        setShowOnInsights(settings.showOnInsights);

        if (settings.adFreeMode) {
          setIsVisible(false);
          return;
        }

        if (placement === "insights" && !settings.showOnInsights) {
          setIsVisible(false);
          return;
        }

        // 2. Check 24 hour dismiss status
        const dismissedTimeStr = await AsyncStorage.getItem(DISMISS_KEY);
        if (dismissedTimeStr) {
          const dismissedTime = parseInt(dismissedTimeStr, 10);
          const now = Date.now();
          const oneDayMs = 24 * 60 * 60 * 1000;
          if (now - dismissedTime < oneDayMs) {
            setIsVisible(false);
            return;
          }
        }

        // Rotate campaigns
        const randomIdx = Math.floor(Math.random() * DEFAULT_CAMPAIGNS.length);
        setActiveCampaign(DEFAULT_CAMPAIGNS[randomIdx]);
        setIsVisible(true);

        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        console.warn("Failed to load ads or settings:", e);
      }
    };

    loadSettings();
  }, [placement]);

  const handleDismiss = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(async () => {
      setIsVisible(false);
      try {
        await AsyncStorage.setItem(DISMISS_KEY, Date.now().toString());
      } catch (e) {
        console.warn("Failed to save ad dismiss status:", e);
      }
    });
  };

  const handleAction = async () => {
    if (!activeCampaign) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (activeCampaign.id === "share_app") {
      try {
        await Share.share({
          message: "Check out Spendly! It's a premium, offline-first personal finance and group bill split tracker. Download it here: https://play.google.com/store/apps/details?id=com.spendlyapp.personal",
        });
      } catch (error) {
        console.warn("Failed to share app:", error);
      }
    } else {
      try {
        await Linking.openURL(activeCampaign.url);
      } catch {
        console.warn("Cannot open URL: ", activeCampaign.url);
      }
    }
  };

  if (!ADS_ENABLED || !isVisible || adFreeMode) return null;
  if (placement === "insights" && !showOnInsights) return null;

  // Decide if we should render AdMob
  const canShowAdMob = !!AdMob && !!BannerAd && !!BannerAdSize && !adFailed && Platform.OS !== "web";
  const isDark = colors.background !== "#f4faf6";

  if (canShowAdMob) {
    return (
      <Animated.View style={[styles.container, noPadding && { paddingHorizontal: 0 }, { opacity: fadeAnim }]}>
        <View style={styles.admobContainer}>
          {/* AdMob Banner Header */}
          <View style={styles.admobHeader}>
            <Text style={[styles.admobBadgeText, { color: colors.mutedForeground }]}>ADVERTISEMENT</Text>
            <TouchableOpacity
              style={[styles.admobCloseBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }]}
              onPress={handleDismiss}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={12} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* AdMob Banner Element */}
          <View style={styles.admobBannerContainer}>
            <BannerAd
              unitId={ADMOB_BANNER_AD_UNIT_ID}
              size={BannerAdSize.BANNER} // standard 320x50 banner - perfect fit without clipping
              requestOptions={{
                requestNonPersonalizedAdsOnly: true,
              }}
              onAdFailedToLoad={(error: any) => {
                console.warn("AdMob Banner failed to load. Falling back to native promo card:", error);
                setAdFailed(true);
              }}
            />
          </View>
        </View>
      </Animated.View>
    );
  }

  // Fallback to our custom styled sponsorship card
  if (!activeCampaign) return null;

  return (
    <Animated.View style={[styles.container, noPadding && { paddingHorizontal: 0 }, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={activeCampaign.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          },
        ]}
      >
        {/* Sponsor label */}
        <View style={styles.headerRow}>
          <View style={styles.sponsorBadge}>
            <Text style={styles.sponsorText}>RECOMMENDED</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <View style={styles.bodyRow}>
          <View style={styles.iconContainer}>
            <Ionicons name={activeCampaign.icon as any} size={22} color="#fff" />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {activeCampaign.title}
            </Text>
            <Text style={styles.description}>
              {activeCampaign.description}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleAction}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{activeCampaign.ctaText}</Text>
          <Ionicons name="arrow-forward" size={14} color={activeCampaign.gradientColors[0]} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sponsorBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sponsorText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  description: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  ctaBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  ctaText: {
    color: "#0f172a",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  // Borderless clean AdMob styling
  admobContainer: {
    width: "100%",
    alignItems: "center",
  },
  admobHeader: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  admobBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  admobCloseBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  admobBannerContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
});
