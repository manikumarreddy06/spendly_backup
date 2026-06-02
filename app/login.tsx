import { Redirect } from "expo-router";

// Authentication removed — redirect to main app
export default function LoginRedirect() {
  return <Redirect href="/(tabs)" />;
}