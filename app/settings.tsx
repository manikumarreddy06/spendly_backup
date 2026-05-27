import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function SettingsRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/profile");
  }, []);

  return null;
}