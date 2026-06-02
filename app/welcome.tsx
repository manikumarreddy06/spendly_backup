import { Redirect } from "expo-router";

// Authentication removed — this route now redirects to the main app.
// The router in _layout.tsx handles sending new users to /onboarding automatically.
export default function WelcomeRedirect() {
  return <Redirect href="/(tabs)" />;
}
