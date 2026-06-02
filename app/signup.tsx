import { Redirect } from "expo-router";

// Authentication removed — redirect to main app
export default function SignupRedirect() {
  return <Redirect href="/(tabs)" />;
}