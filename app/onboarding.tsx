import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES = [
  {
    id: "01",
    title1: "Track expenses",
    title2: "in seconds",
    text: "Add expenses effortlessly and keep all your spending organized in one beautiful place.",
  },
  {
    id: "02",
    title1: "Get smart",
    title2: "insights",
    text: "Understand where your money goes with beautiful charts and powerful analytics.",
  },
  {
    id: "03",
    title1: "Build better",
    title2: "financial habits",
    text: "Set budgets, achieve goals and stay in control of your money – every day.",
  },
];

export default function Onboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setProfile } = useApp();
  const router = useRouter();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [salaryFocused, setSalaryFocused] = useState(false);

  useEffect(() => {
    if (Platform.OS === "android") {
      const backAction = () => {
        if (currentSlide > 0) {
          setCurrentSlide((c) => c - 1);
          return true;
        }
        BackHandler.exitApp();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }
  }, [currentSlide]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentSlide > 0) {
      setCurrentSlide((c) => c - 1);
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentSlide(3);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentSlide < 3) {
      setCurrentSlide((c) => c + 1);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter your name.");
      return;
    }
    const salaryNum = parseFloat(salary);
    if (!salary || isNaN(salaryNum) || salaryNum <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid monthly budget.");
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setProfile({ name: name.trim(), salary: salaryNum, currency: "₹" });
    router.replace("/(tabs)");
  };

  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const bottomPad = Platform.OS === "web" ? 20 : insets.bottom;
  const s = styles(topPad, bottomPad);

  const renderVisualMockup = () => {
    switch (currentSlide) {
      case 0:
        return (
          <View style={s.mockupWrapper}>
            {/* Floating clock badge */}
            <View style={[s.floatingIcon, s.floatingClock]}>
              <Ionicons name="time" size={20} color="#10b981" />
            </View>
            {/* Floating plus badge */}
            <View style={[s.floatingIcon, s.floatingPlus]}>
              <Ionicons name="add" size={24} color="#10b981" />
            </View>

            <View style={s.mockupCard}>
              {/* Inner phone mockup */}
              <View style={s.phoneHeader}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={s.phoneHeaderTitle}>Add Expense</Text>
                <Ionicons name="checkmark-circle" size={22} color="#10b981" />
              </View>

              <Text style={s.phoneAmount}>₹1,250</Text>

              <View style={s.fieldList}>
                <View style={s.fieldRow}>
                  <View style={[s.fieldIconWrap, { backgroundColor: "#f9731633" }]}>
                    <Ionicons name="restaurant" size={14} color="#f97316" />
                  </View>
                  <Text style={s.fieldLabel}>Food & Dining</Text>
                  <Ionicons name="chevron-forward" size={14} color="#4b5563" />
                </View>

                <View style={s.fieldRow}>
                  <View style={[s.fieldIconWrap, { backgroundColor: "#3b82f633" }]}>
                    <Ionicons name="card" size={14} color="#3b82f6" />
                  </View>
                  <Text style={s.fieldLabel}>HDFC Bank •••• 1234</Text>
                  <Ionicons name="chevron-forward" size={14} color="#4b5563" />
                </View>

                <View style={s.fieldRow}>
                  <View style={[s.fieldIconWrap, { backgroundColor: "#10b98133" }]}>
                    <Ionicons name="calendar" size={14} color="#10b981" />
                  </View>
                  <Text style={s.fieldLabel}>Today, 9:41 AM</Text>
                </View>

                <View style={s.fieldRow}>
                  <View style={[s.fieldIconWrap, { backgroundColor: "#6b728033" }]}>
                    <Ionicons name="document-text" size={14} color="#6b7280" />
                  </View>
                  <Text style={s.fieldLabel}>Dinner with friends</Text>
                </View>
              </View>
            </View>
          </View>
        );
      case 1:
        return (
          <View style={s.mockupWrapper}>
            {/* Floating chart badge */}
            <View style={[s.floatingIcon, s.floatingChart]}>
              <Ionicons name="trending-up" size={20} color="#10b981" />
            </View>

            <View style={s.mockupCard}>
              <View style={s.phoneHeader}>
                <Text style={s.insightsTitle}>Insights</Text>
                <View style={s.dropdownPill}>
                  <Text style={s.dropdownText}>This Month</Text>
                  <Ionicons name="chevron-down" size={10} color="#9ca3af" style={{ marginLeft: 3 }} />
                </View>
              </View>

              {/* Total Spent Card */}
              <View style={s.spentSubCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.spentSubLabel}>Total Spent</Text>
                  <Text style={s.spentSubAmount}>₹24,650</Text>
                  <View style={s.spentSubChange}>
                    <Ionicons name="arrow-down" size={12} color="#10b981" />
                    <Text style={s.spentSubChangeText}>12% vs last month</Text>
                  </View>
                </View>
                <View style={s.sparklineWrap}>
                  <Svg width={75} height={35}>
                    <Path
                      d="M 5 28 Q 20 5, 35 20 T 70 8"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              </View>

              {/* Spending by Category */}
              <View style={s.catHeaderRow}>
                <Text style={s.catHeaderTitle}>Spending by Category</Text>
                <Text style={s.catHeaderLink}>View All</Text>
              </View>

              <View style={s.insightsCategoryList}>
                <View style={s.insightCategoryItem}>
                  <View style={[s.catCircle, { backgroundColor: "#f9731622" }]}>
                    <Ionicons name="restaurant" size={11} color="#f97316" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={s.catNameRow}>
                      <Text style={s.catNameText}>Food & Dining</Text>
                      <Text style={s.catValueText}>₹10,350</Text>
                    </View>
                    <View style={s.progressTrack}>
                      <View style={[s.progressBar, { width: "42%", backgroundColor: "#f97316" }]} />
                    </View>
                  </View>
                </View>

                <View style={s.insightCategoryItem}>
                  <View style={[s.catCircle, { backgroundColor: "#a855f722" }]}>
                    <Ionicons name="bag-handle" size={11} color="#a855f7" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={s.catNameRow}>
                      <Text style={s.catNameText}>Shopping</Text>
                      <Text style={s.catValueText}>₹5,900</Text>
                    </View>
                    <View style={s.progressTrack}>
                      <View style={[s.progressBar, { width: "24%", backgroundColor: "#a855f7" }]} />
                    </View>
                  </View>
                </View>

                <View style={s.insightCategoryItem}>
                  <View style={[s.catCircle, { backgroundColor: "#3b82f622" }]}>
                    <Ionicons name="airplane" size={11} color="#3b82f6" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={s.catNameRow}>
                      <Text style={s.catNameText}>Transport</Text>
                      <Text style={s.catValueText}>₹3,650</Text>
                    </View>
                    <View style={s.progressTrack}>
                      <View style={[s.progressBar, { width: "15%", backgroundColor: "#3b82f6" }]} />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={s.mockupWrapper}>
            {/* Floating star badge */}
            <View style={[s.floatingIcon, s.floatingStar]}>
              <Ionicons name="star" size={20} color="#10b981" />
            </View>

            <View style={s.mockupCard}>
              {/* Monthly Budget progress card */}
              <View style={s.mockupBox}>
                <View style={s.boxHeader}>
                  <Text style={s.boxTitle}>Monthly Budget</Text>
                  <Text style={s.boxAction}>Edit</Text>
                </View>
                <View style={s.boxAmountRow}>
                  <Text style={s.boxAmountMain}>₹18,000<Text style={s.boxAmountSub}> / ₹25,000</Text></Text>
                  <Text style={s.boxPctText}>72%</Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressBar, { width: "72%", backgroundColor: "#10b981" }]} />
                </View>
              </View>

              {/* Savings Goal */}
              <View style={s.mockupBox}>
                <Text style={s.boxLabel}>Savings Goal</Text>
                <Text style={s.goalTitle}>iPhone Fund</Text>
                <View style={s.goalDetailsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.goalAmountText}>₹24,500<Text style={s.boxAmountSub}> / ₹60,000</Text></Text>
                  </View>
                  <View style={s.goalBadgeRow}>
                    <View style={s.goalRing}>
                      <Text style={s.goalRingText}>40%</Text>
                    </View>
                    <View style={s.jarIconCircle}>
                      <Ionicons name="cube-outline" size={14} color="#10b981" />
                    </View>
                  </View>
                </View>
              </View>

              {/* Quote Card */}
              <View style={s.quoteCard}>
                <View style={s.quoteIconCircle}>
                  <Ionicons name="quote" size={10} color="#10b981" />
                </View>
                <Text style={s.quoteCardText}>
                  Small steps today,{"\n"}big freedom tomorrow.
                </Text>
                <Svg width={25} height={12} style={{ marginLeft: 6 }}>
                  <Path
                    d="M 2 10 Q 8 8, 12 5 T 22 2"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={1.5}
                  />
                </Svg>
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={["#080b11", "#05070a"]}
      style={s.gradient}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Navigation Header */}
        <View style={s.headerRow}>
          {currentSlide > 0 ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [s.navBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
          ) : (
            <View style={s.navBtnPlaceholder} />
          )}

          {currentSlide < 3 ? (
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [s.skipBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.skipText}>Skip</Text>
            </Pressable>
          ) : (
            <View style={s.navBtnPlaceholder} />
          )}
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {currentSlide < 3 ? (
            <View style={s.slideContainer}>
              {/* Badge */}
              <View style={s.slideBadge}>
                <Text style={s.slideBadgeText}>{SLIDES[currentSlide].id}</Text>
              </View>

              {/* Title */}
              <Text style={s.headline}>
                {SLIDES[currentSlide].title1}{"\n"}
                <Text style={s.headlineGreen}>{SLIDES[currentSlide].title2}</Text>
              </Text>

              {/* Description */}
              <Text style={s.description}>
                {SLIDES[currentSlide].text}
              </Text>

              {/* Mockup Card */}
              {renderVisualMockup()}

              {/* Bottom Actions */}
              <Pressable
                onPress={handleContinue}
                style={({ pressed }) => [
                  s.continueBtn,
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={s.continueBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>

              {/* Pagination Dots */}
              <View style={s.paginationRow}>
                {SLIDES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.paginationDot,
                      currentSlide === i && s.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={s.setupContainer}>
              <View style={s.iconWrap}>
                <View style={s.icon}>
                  <Ionicons name="wallet" size={40} color="#fff" />
                </View>
              </View>

              <Text style={s.setupTitle}>Welcome to Spendly</Text>
              <Text style={s.setupSubtitle}>
                Your personal money companion.{"\n"}Let's get you set up.
              </Text>

              <View style={s.setupCard}>
                <Text style={s.setupLabel}>Your Name</Text>
                <View style={[s.setupInputWrap, nameFocused && s.setupInputFocused]}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={nameFocused ? "#10b981" : "#4b5563"}
                    style={{ marginRight: 10 }}
                  />
                  <TextInput
                    testID="input-name"
                    style={s.setupInput}
                    placeholder="e.g. Priya"
                    placeholderTextColor="#4b5563"
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>

                <Text style={[s.setupLabel, { marginTop: 18 }]}>Monthly Budget / Salary</Text>
                <View style={[s.setupInputWrap, salaryFocused && s.setupInputFocused]}>
                  <Text style={[s.setupRupee, { color: salaryFocused ? "#10b981" : "#4b5563" }]}>
                    ₹
                  </Text>
                  <TextInput
                    testID="input-salary"
                    style={[s.setupInput, s.salaryInput]}
                    placeholder="50000"
                    placeholderTextColor="#4b5563"
                    value={salary}
                    onChangeText={setSalary}
                    onFocus={() => setSalaryFocused(true)}
                    onBlur={() => setSalaryFocused(false)}
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </View>

                <Pressable
                  testID="button-get-started"
                  onPress={handleSubmit}
                  style={({ pressed }) => [
                    s.setupBtn,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Text style={s.setupBtnText}>Get Started</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = (topPad: number, bottomPad: number) =>
  StyleSheet.create({
    gradient: { flex: 1 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: topPad + 10,
      height: topPad + 54,
      zIndex: 10,
    },
    navBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.06)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
    },
    navBtnPlaceholder: {
      width: 40,
      height: 40,
    },
    skipBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.06)",
    },
    skipText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#9ca3af",
    },
    scroll: {
      flexGrow: 1,
      paddingBottom: bottomPad + 30,
    },
    slideContainer: {
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    slideBadge: {
      alignSelf: "flex-start",
      borderWidth: 1.5,
      borderColor: "#10b981",
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
      marginBottom: 14,
    },
    slideBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: "#10b981",
    },
    headline: {
      fontSize: 32,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      lineHeight: 38,
      marginBottom: 10,
      letterSpacing: -0.5,
    },
    headlineGreen: {
      color: "#10b981",
    },
    description: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: "#9ca3af",
      lineHeight: 22,
      marginBottom: 24,
    },
    continueBtn: {
      backgroundColor: "#10b981",
      borderRadius: 16,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: "#10b981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 5,
      marginBottom: 20,
    },
    continueBtnText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_700Bold",
    },
    paginationRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    },
    paginationDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#1f293d",
    },
    paginationDotActive: {
      width: 18,
      backgroundColor: "#10b981",
    },
    setupContainer: {
      paddingHorizontal: 24,
      alignItems: "center",
      paddingTop: 20,
    },
    iconWrap: {
      marginBottom: 16,
    },
    icon: {
      width: 80,
      height: 80,
      borderRadius: 24,
      backgroundColor: "#10b981",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#10b981",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    setupTitle: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      textAlign: "center",
      marginBottom: 8,
    },
    setupSubtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: "#9ca3af",
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 32,
    },
    setupCard: {
      width: "100%",
      backgroundColor: "#111622",
      borderRadius: 18,
      padding: 24,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    setupLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
      marginBottom: 8,
    },
    setupInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: "#1f293d",
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 52,
      backgroundColor: "#090c10",
    },
    setupInputFocused: {
      borderColor: "#10b981",
      backgroundColor: "rgba(16,185,129,0.04)",
    },
    setupInput: {
      flex: 1,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: "#fff",
    },
    salaryInput: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
    },
    setupRupee: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      marginRight: 8,
    },
    setupBtn: {
      marginTop: 24,
      backgroundColor: "#10b981",
      borderRadius: 12,
      height: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: "#10b981",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 4,
    },
    setupBtnText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    mockupWrapper: {
      width: "100%",
      height: 320,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    mockupCard: {
      width: "90%",
      backgroundColor: "#111622",
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 10,
    },
    phoneHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    phoneHeaderTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    phoneAmount: {
      fontSize: 30,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginBottom: 12,
    },
    fieldList: {
      gap: 8,
    },
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#182030",
      borderRadius: 10,
      padding: 9,
    },
    fieldIconWrap: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    fieldLabel: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: "#fff",
    },
    floatingIcon: {
      position: "absolute",
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#111622",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.08)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    floatingClock: {
      top: 10,
      left: 6,
    },
    floatingPlus: {
      bottom: 10,
      right: 6,
    },
    floatingChart: {
      top: 10,
      right: 6,
    },
    floatingStar: {
      top: 10,
      right: 6,
    },
    insightsTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    dropdownPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#182030",
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    dropdownText: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: "#9ca3af",
    },
    spentSubCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: "#182030",
      borderRadius: 12,
      padding: 10,
      marginBottom: 10,
    },
    spentSubLabel: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: "#9ca3af",
    },
    spentSubAmount: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginTop: 1,
    },
    spentSubChange: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
      gap: 3,
    },
    spentSubChangeText: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: "#10b981",
    },
    sparklineWrap: {
      justifyContent: "center",
      alignItems: "center",
      paddingRight: 4,
    },
    catHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    catHeaderTitle: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    catHeaderLink: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: "#10b981",
    },
    catCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    catNameRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    catNameText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: "#e5e7eb",
    },
    catValueText: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    mockupBox: {
      backgroundColor: "#182030",
      borderRadius: 12,
      padding: 10,
      marginBottom: 10,
    },
    boxTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    boxAction: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: "#10b981",
    },
    boxAmountRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 6,
    },
    boxAmountMain: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    boxPctText: {
      fontSize: 12,
      fontFamily: "Inter_700Bold",
      color: "#10b981",
    },
    boxLabel: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: "#9ca3af",
      marginBottom: 1,
    },
    goalTitle: {
      fontSize: 14,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginBottom: 4,
    },
    goalDetailsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    goalAmountText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
    goalBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    goalRing: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: "#10b981",
      alignItems: "center",
      justifyContent: "center",
    },
    goalRingText: {
      fontSize: 8,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    jarIconCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "#10b9811a",
      alignItems: "center",
      justifyContent: "center",
    },
    quoteCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#10b98112",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "#10b98126",
    },
    quoteIconCircle: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "#10b98126",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 6,
    },
    quoteCardText: {
      flex: 1,
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      color: "#e5e7eb",
      lineHeight: 13,
    },
  });
