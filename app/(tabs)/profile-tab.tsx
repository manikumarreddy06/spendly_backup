// Stub screen for profile tab. Navigation handled by ProfileTabButton in _layout.tsx.
import { View } from "react-native";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileTabScreen() {
  const colors = useColors();
  // Just render a blank background — the ProfileTabButton always pushes /profile
  // so this screen should never actually be visible
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
