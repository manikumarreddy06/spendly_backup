import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { ADMOB_INTERSTITIAL_AD_UNIT_ID, ADS_ENABLED } from "./config";

let InterstitialAd: any = null;
let AdEventType: any = null;
try {
  const adModule = require("react-native-google-mobile-ads");
  InterstitialAd = adModule.InterstitialAd;
  AdEventType = adModule.AdEventType;
} catch (e) {
  // Silent fallback
}

class InterstitialAdManager {
  private interstitial: any = null;
  private isLoaded = false;
  private lastShownTime = 0;
  private COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between ads
  private DAILY_LIMIT = 5; // Maximum of 5 ads per day
  private adUnitId = ADMOB_INTERSTITIAL_AD_UNIT_ID;

  constructor() {
    this.init();
  }

  private async init() {
    if (Platform.OS === "web" || !InterstitialAd) return;

    try {
      // 1. Centralized SDK Initialization
      const AdMobModule = require("react-native-google-mobile-ads");
      const mobileAds = typeof AdMobModule === "function" ? AdMobModule : AdMobModule?.default;
      if (mobileAds) {
        await mobileAds().initialize();
        console.log("AdMob SDK successfully initialized inside InterstitialAdManager.");
      }

      // 2. Create the ad instance
      this.interstitial = InterstitialAd.createForAdRequest(this.adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      // 3. Register ad lifecycle listeners
      this.interstitial.addAdEventListener(AdEventType.LOADED, () => {
        console.log("Interstitial ad loaded successfully.");
        this.isLoaded = true;
      });

      this.interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        this.isLoaded = false;
        // Pre-load the next ad immediately
        this.load();
      });

      this.interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
        console.warn("Interstitial ad failed to load:", error);
        this.isLoaded = false;
      });

      // 4. Trigger first ad load
      this.load();
    } catch (e) {
      console.warn("Failed to initialize Interstitial Ad:", e);
    }
  }

  public load() {
    if (this.interstitial && !this.isLoaded) {
      try {
        this.interstitial.load();
      } catch (e) {
        console.warn("Failed to load interstitial ad:", e);
      }
    }
  }

  public async showAdIfReady(): Promise<boolean> {
    if (!ADS_ENABLED || Platform.OS === "web" || !this.interstitial) return false;

    // 1. Check settings for ad-free mode
    try {
      const settingsStr = await AsyncStorage.getItem("@spendly_ad_settings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.adFreeMode) return false;
      }
    } catch (e) {
      // Ignore
    }

    // 2. Check and enforce daily ad cap
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    let dailyCount = 0;
    try {
      const lastDate = await AsyncStorage.getItem("@spendly_interstitial_last_date");
      const countStr = await AsyncStorage.getItem("@spendly_interstitial_daily_count");
      
      if (lastDate === todayStr) {
        dailyCount = countStr ? parseInt(countStr, 10) : 0;
      } else {
        // New day: reset count
        await AsyncStorage.setItem("@spendly_interstitial_last_date", todayStr);
        await AsyncStorage.setItem("@spendly_interstitial_daily_count", "0");
      }
    } catch (e) {
      console.warn("Error reading ad cap status:", e);
    }

    if (dailyCount >= this.DAILY_LIMIT) {
      console.log(`Ad skipped: Daily limit of ${this.DAILY_LIMIT} ads reached.`);
      return false;
    }

    // 3. Enforce the time cooldown
    const now = Date.now();
    const timeSinceLastAd = now - this.lastShownTime;

    if (this.isLoaded && timeSinceLastAd >= this.COOLDOWN_MS) {
      try {
        await this.interstitial.show();
        this.lastShownTime = now;
        this.isLoaded = false;

        // Increment and save the daily ad count
        try {
          const nextCount = dailyCount + 1;
          await AsyncStorage.setItem("@spendly_interstitial_daily_count", nextCount.toString());
          console.log(`Ad shown successfully. Daily count: ${nextCount}/${this.DAILY_LIMIT}`);
        } catch (e) {
          console.warn("Failed to save daily ad count:", e);
        }

        return true;
      } catch (e) {
        console.warn("Failed to show interstitial ad:", e);
        return false;
      }
    }

    // If not loaded, make sure we trigger a load
    this.load();
    return false;
  }
}

export const adsManager = new InterstitialAdManager();
