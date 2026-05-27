import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { authRedirectUrl } from "./config";
import { supabase } from "./supabase";

// Allow WebBrowser to handle redirect sessions correctly on web/android
WebBrowser.maybeCompleteAuthSession();

// Helper to parse access_token and refresh_token from url query/hash
const getParamsFromUrl = (urlStr: string): Record<string, string> => {
  const params: Record<string, string> = {};
  
  const hashIdx = urlStr.indexOf("#");
  if (hashIdx !== -1) {
    const hash = urlStr.substring(hashIdx + 1);
    hash.split("&").forEach((part) => {
      const [key, val] = part.split("=");
      if (key) params[key] = decodeURIComponent(val || "");
    });
  }
  
  const queryIdx = urlStr.indexOf("?");
  if (queryIdx !== -1) {
    const search = urlStr.substring(queryIdx + 1, hashIdx !== -1 && hashIdx > queryIdx ? hashIdx : undefined);
    search.split("&").forEach((part) => {
      const [key, val] = part.split("=");
      if (key) params[key] = decodeURIComponent(val || "");
    });
  }
  
  return params;
};

/**
 * Initiates the Google OAuth sign-in flow via Supabase.
 * Opens a secure browser sheet for sign-in and captures the tokens on completion.
 */
export async function signInWithGoogle() {
  try {
    const redirectUrl = authRedirectUrl;
    console.log("Starting Google OAuth Sign-In...");

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data?.url) throw new Error("No authorization URL returned from Supabase.");

    // Open Google Login in a secure browser modal
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    Alert.alert("OAuth WebBrowser Result", `Type: ${result.type}\nURL: ${result.url || "none"}`);

    if (result.type === "success" && result.url) {
      console.log("Google OAuth completed, processing URL...");
      const params = getParamsFromUrl(result.url);
      Alert.alert("OAuth WebBrowser Params", JSON.stringify(params));
      
      if (params.access_token && params.refresh_token) {
        Alert.alert("OAuth WebBrowser Session", "Restoring session from access_token...");
        const { error: setSessionErr } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });
        if (setSessionErr) throw setSessionErr;
        Alert.alert("OAuth WebBrowser Success", "Session set successfully!");
      } else if (params.code) {
        Alert.alert("OAuth WebBrowser Code Exchange", `Exchanging code: ${params.code}`);
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeErr) throw exchangeErr;
        Alert.alert("OAuth WebBrowser Success", "Code exchanged successfully!");
      }
    }
  } catch (err: any) {
    console.error("Google Sign-In failed:", err);
    Alert.alert("Sign In Failed", err.message || "An error occurred during Google Sign-In.");
  }
}
