import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

function readConfigString(key: string, fallback = ""): string {
  const value = extra[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readConfigBoolean(key: string, fallback: boolean): boolean {
  const value = extra[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

// Supabase configuration. The anon key is public by design, but release builds
// should provide these values through Expo config instead of editing source.
export const SUPABASE_ENABLED = readConfigBoolean("supabaseEnabled", true);
export const SUPABASE_URL = readConfigString("supabaseUrl", "https://mvdrbonnmzfukgsmwcde.supabase.co");
export const SUPABASE_ANON_KEY = readConfigString(
  "supabaseAnonKey",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12ZHJib25ubXpmdWtnc213Y2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDM3ODMsImV4cCI6MjA5NDU3OTc4M30.eS_y33rSrdr990kv7aDHehDxThRt_Lufx4uLcLIPamA"
);

// Google AdMob configuration.
export const ADS_ENABLED = readConfigBoolean("adsEnabled", true);
export const FORCE_TEST_ADS = readConfigBoolean("forceTestAds", false);

export const ADMOB_BANNER_AD_UNIT_ID = (__DEV__ || FORCE_TEST_ADS)
  ? "ca-app-pub-3940256099942544/6300978111"
  : readConfigString("admobBannerAdUnitId", "ca-app-pub-3859841618293423/2886464501");

export const ADMOB_INTERSTITIAL_AD_UNIT_ID = (__DEV__ || FORCE_TEST_ADS)
  ? "ca-app-pub-3940256099942544/1033173712"
  : readConfigString("admobInterstitialAdUnitId", "ca-app-pub-3859841618293423/8356877995");
