import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, parseGroupName } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function JoinGroupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { splitGroups, joinGroupFromInvite } = useApp();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [groupData, setGroupData] = useState<{ id: string; name: string; members: string[] } | null>(null);
  const [joining, setJoining] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const alreadyMember = id ? splitGroups.some((g) => g.id === id) : false;

  useEffect(() => {
    if (!id) {
      setErrorMsg("Invalid or missing group invitation link.");
      setLoading(false);
      return;
    }

    // Attempt to find the group (local first, then Supabase remote)
    joinGroupFromInvite(id).then((group) => {
      if (group) {
        setGroupData({
          id: group.id,
          name: group.name || "Untitled Group",
          members: group.members || [],
        });
      } else {
        setErrorMsg("This group wasn't found. Make sure you've entered the correct invite code and try again.");
      }
      setLoading(false);
    }).catch(() => {
      setErrorMsg("Could not retrieve the group. Please check your connection and try again.");
      setLoading(false);
    });
  }, [id, joinGroupFromInvite]);

  const handleJoin = async () => {
    if (!id) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    if (alreadyMember) {
      router.replace(`/split/${id}`);
      return;
    }

    setJoining(true);
    const success = await joinGroupFromInvite(id);
    setJoining(false);

    if (success) {
      router.replace(`/split/${id}`);
    } else {
      setErrorMsg("Failed to sync and join this split group. Please try again.");
    }
  };

  const s = styles(colors, topPad, insets.bottom);

  return (
    <View style={s.root}>
      {/* Visual background elements */}
      <View style={[s.glowCircle, { backgroundColor: colors.primary + "15", top: 100, left: -50 }]} />
      <View style={[s.glowCircle, { backgroundColor: colors.secondary + "12", bottom: 100, right: -50 }]} />

      <LinearGradient colors={[colors.primary, colors.primary + "dd"]} style={[s.header, { paddingTop: topPad + 14 }]}>
        <View style={s.headerRow}>
          <Pressable onPress={() => router.replace("/(tabs)/split")} style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={s.headerTitle}>Join Split Group</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={s.content}>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.loadingText, { color: colors.mutedForeground }]}>
              Retrieving invitation details...
            </Text>
          </View>
        ) : errorMsg ? (
          <View style={s.center}>
            <View style={[s.iconBox, { backgroundColor: colors.destructive + "15" }]}>
              <Ionicons name="alert-circle-outline" size={44} color={colors.destructive} />
            </View>
            <Text style={[s.errorTitle, { color: colors.foreground }]}>Invitation Error</Text>
            <Text style={[s.errorText, { color: colors.mutedForeground }]}>{errorMsg}</Text>
            <TouchableOpacity
              testID="button-go-back"
              onPress={() => router.replace("/(tabs)/split")}
              style={[s.btn, { backgroundColor: colors.border }]}
            >
              <Text style={[s.btnText, { color: colors.foreground }]}>Go to Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : groupData ? (
          <View style={s.cardContainer}>
            <BlurView intensity={Platform.OS === "web" ? 0 : 85} style={[StyleSheet.absoluteFill, s.blurBg]} />
            <View style={s.cardContent}>
              <View style={[s.iconBox, { backgroundColor: colors.primary + "15" }]}>
                <Ionicons name="people" size={40} color={colors.primary} />
              </View>

              <Text style={[s.groupName, { color: colors.foreground }]}>
                {parseGroupName(groupData.name).name}
              </Text>
              
              <View style={s.membersSection}>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
                  Existing Group Members ({groupData.members.length})
                </Text>
                <View style={s.membersGrid}>
                  {groupData.members.map((member) => (
                    <View key={member} style={[s.memberChip, { borderColor: colors.border }]}>
                      <View style={[s.memberDot, { backgroundColor: colors.primary }]} />
                      <Text style={[s.memberName, { color: colors.foreground }]}>{member}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={s.divider} />

              <Text style={[s.promptText, { color: colors.mutedForeground }]}>
                {alreadyMember
                  ? "You are already a member of this split group. You can access it on your device now."
                  : "Accepting this invitation will add the split group to your dashboard. You'll be able to track and settle shared expenses with the group members."}
              </Text>

              <TouchableOpacity
                testID="button-accept-invite"
                onPress={handleJoin}
                disabled={joining}
                style={[
                  s.btn,
                  { backgroundColor: colors.primary, shadowColor: colors.primary },
                  alreadyMember && { backgroundColor: colors.secondary, shadowColor: colors.secondary },
                ]}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={alreadyMember ? "arrow-forward-circle-outline" : "checkbox-outline"}
                      size={20}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={s.btnText}>
                      {alreadyMember ? "View Group Details" : "Accept Invite & Join"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {Platform.OS === "web" && (
                <TouchableOpacity
                  testID="button-open-in-app"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    Linking.openURL(`spendly-mobile://split/join?id=${id}`);
                  }}
                  style={[s.btn, { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.primary, marginTop: 12 }]}
                >
                  <Ionicons name="open-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[s.btnText, { color: colors.primary }]}>Open in Spendly App</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, topPad: number, bottomPad: number) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    glowCircle: {
      position: "absolute",
      width: 250,
      height: 250,
      borderRadius: 125,
      opacity: 0.8,
    },
    header: {
      paddingBottom: 20,
      paddingHorizontal: 20,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: "#fff",
    },
    content: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    loadingText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      marginTop: 14,
    },
    iconBox: {
      width: 72,
      height: 72,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    errorTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      marginBottom: 8,
    },
    errorText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
      paddingHorizontal: 16,
    },
    cardContainer: {
      borderRadius: 28,
      overflow: "hidden",
      borderWidth: 1.5,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 6,
      backgroundColor: colors.card,
    },
    blurBg: {
      borderRadius: 28,
    },
    cardContent: {
      padding: 24,
      alignItems: "center",
    },
    groupName: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      textAlign: "center",
      marginBottom: 20,
    },
    membersSection: {
      width: "100%",
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: 10,
    },
    membersGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    memberChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      backgroundColor: "rgba(0,0,0,0.02)",
    },
    memberDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 6,
    },
    memberName: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    divider: {
      width: "100%",
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 18,
    },
    promptText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 22,
      paddingHorizontal: 8,
    },
    btn: {
      width: "100%",
      height: 50,
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    btnText: {
      color: "#fff",
      fontSize: 15,
      fontFamily: "Inter_700Bold",
    },
  });
