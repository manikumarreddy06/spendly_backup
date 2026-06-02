// Supabase Configuration (no auth — UUID-based group access)
export const SUPABASE_ENABLED = true; // Set to true after creating a Supabase project and running the setup SQL
export const SUPABASE_URL = "https://mvdrbonnmzfukgsmwcde.supabase.co"; // From Supabase Project Settings → API → Project URL
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12ZHJib25ubXpmdWtnc213Y2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMDM3ODMsImV4cCI6MjA5NDU3OTc4M30.eS_y33rSrdr990kv7aDHehDxThRt_Lufx4uLcLIPamA"; // From Supabase Project Settings → API → anon public key

// Google AdMob Configuration
export const ADS_ENABLED = false; // Set to true when you are ready to monetize with ads!
export const FORCE_TEST_ADS = false; // Set to false before uploading the final release bundle to Play Store!

// Standard test ad unit ID for Android Banner: ca-app-pub-3940256099942544/6300978111
export const ADMOB_BANNER_AD_UNIT_ID = (__DEV__ || FORCE_TEST_ADS)
  ? "ca-app-pub-3940256099942544/6300978111" // Google Test ID
  : "ca-app-pub-3859841618293423/2886464501"; // Real Production ID

// Standard test ad unit ID for Android Interstitial: ca-app-pub-3940256099942544/1033173712
export const ADMOB_INTERSTITIAL_AD_UNIT_ID = (__DEV__ || FORCE_TEST_ADS)
  ? "ca-app-pub-3940256099942544/1033173712" // Google Test ID
  : "ca-app-pub-3859841618293423/8356877995"; // Real Production ID



