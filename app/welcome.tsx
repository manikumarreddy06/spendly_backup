import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { signInWithGoogle } from "@/lib/auth";
import { authRedirectUrl } from "@/lib/config";

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Auth States
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Handle hardware back press on Android
  useEffect(() => {
    if (Platform.OS === "android") {
      const backAction = () => {
        BackHandler.exitApp();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }
  }, []);

  const handleAuthAction = async () => {
    if (!email.trim()) {
      Alert.alert("Missing email", "Please enter your email address.");
      return;
    }
    if (!password) {
      Alert.alert("Missing password", "Please enter a password.");
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (isSignUpMode) {
        // Sign Up Flow
        if (password.length < 6) {
          Alert.alert("Weak password", "Password must be at least 6 characters.");
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          Alert.alert("Passwords don't match", "Please make sure both passwords match.");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl,
          },
        });

        if (error) {
          Alert.alert("Sign up failed", error.message);
          return;
        }

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Check your email",
          "We've sent a confirmation link to your email. Please verify before signing in.",
          [{ text: "OK" }]
        );
        // Switch to Sign In mode automatically so they can sign in once verified
        setIsSignUpMode(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        // Sign In Flow
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          Alert.alert("Sign in failed", error.message);
          return;
        }

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signInWithGoogle();
  };

  const s = styles(colors, insets);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[colors.primary, colors.primary + "dd"]}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section inside ScrollView to prevent overlap */}
          <View style={s.headerSection}>
            <View style={s.iconBg}>
              <Ionicons name="wallet" size={40} color={colors.primary} />
            </View>
            <Text style={s.title}>Spendly</Text>
            <Text style={s.subtitle}>Your personal money companion</Text>
          </View>

          {/* Form Card Section */}
          <View style={s.card}>
            {/* Sliding Toggle Control */}
            <View style={s.toggleContainer}>
              <Pressable
                style={[s.toggleBtn, !isSignUpMode && s.toggleBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsSignUpMode(false);
                }}
              >
                <Text style={[s.toggleText, !isSignUpMode && s.toggleTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                style={[s.toggleBtn, isSignUpMode && s.toggleBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsSignUpMode(true);
                }}
              >
                <Text style={[s.toggleText, isSignUpMode && s.toggleTextActive]}>
                  Sign Up
                </Text>
              </Pressable>
            </View>

            {/* Email Input */}
            <Text style={s.label}>Email</Text>
            <View
              style={[
                s.inputWrap,
                focusedField === "email" && s.inputFocused,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={18}
                color={
                  focusedField === "email" ? colors.primary : colors.mutedForeground
                }
                style={{ marginRight: 10 }}
              />
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            {/* Password Input */}
            <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
            <View
              style={[
                s.inputWrap,
                focusedField === "password" && s.inputFocused,
              ]}
            >
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={
                  focusedField === "password" ? colors.primary : colors.mutedForeground
                }
                style={{ marginRight: 10 }}
              />
              <TextInput
                style={s.input}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete={isSignUpMode ? "new-password" : "password"}
                returnKeyType={isSignUpMode ? "next" : "done"}
                onSubmitEditing={isSignUpMode ? undefined : handleAuthAction}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            {/* Confirm Password Input (Only Sign Up Mode) */}
            {isSignUpMode && (
              <View>
                <Text style={[s.label, { marginTop: 16 }]}>Confirm Password</Text>
                <View
                  style={[
                    s.inputWrap,
                    focusedField === "confirm" && s.inputFocused,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={
                      focusedField === "confirm" ? colors.primary : colors.mutedForeground
                    }
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    style={s.input}
                    placeholder="Confirm your password"
                    placeholderTextColor={colors.mutedForeground}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleAuthAction}
                  />
                </View>
              </View>
            )}

            {/* Submit Button */}
            <Pressable
              onPress={handleAuthAction}
              disabled={loading}
              style={({ pressed }) => [
                s.primaryButton,
                pressed && !loading && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                loading && { opacity: 0.6 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={s.primaryButtonText}>
                    {isSignUpMode ? "Create Account" : "Sign In"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </Pressable>

            {/* Divider */}
            <View style={s.dividerWrap}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>or continue with</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Google Login Button */}
            <Pressable
              onPress={handleGoogleSignIn}
              style={({ pressed }) => [
                s.googleButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Ionicons name="logo-google" size={18} color={colors.foreground} style={{ marginRight: 8 }} />
              <Text style={s.googleButtonText}>Continue with Google</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingTop: insets.top + 32,
      paddingBottom: insets.bottom + 32,
    },
    headerSection: {
      alignItems: "center",
      marginBottom: 32,
    },
    iconBg: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: "#ffffff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
      marginBottom: 16,
    },
    title: {
      fontSize: 38,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
      textAlign: "center",
      letterSpacing: -0.5,
      textShadowColor: "rgba(0, 0, 0, 0.1)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: "rgba(255, 255, 255, 0.85)",
      textAlign: "center",
      marginTop: 6,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 6,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    toggleContainer: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: colors.radius - 2,
      padding: 4,
      marginBottom: 24,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: colors.radius - 4,
    },
    toggleBtnActive: {
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    toggleText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    toggleTextActive: {
      color: colors.primary,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 8,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      height: 52,
      backgroundColor: colors.background,
    },
    inputFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "08",
    },
    input: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    primaryButton: {
      marginTop: 24,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 4,
    },
    primaryButtonText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_700Bold",
    },
    dividerWrap: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      paddingHorizontal: 12,
      textTransform: "lowercase",
    },
    googleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: colors.radius,
      height: 52,
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    googleButtonText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
  });
