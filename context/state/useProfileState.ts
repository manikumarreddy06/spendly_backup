import React, { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProfile } from "../AppContext";

export function useProfileState() {
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const stored = await AsyncStorage.getItem("user_profile");
        if (stored) {
          setProfileState(JSON.parse(stored));
        }
      } catch (err) {
        console.warn("Failed to load user profile:", err);
      } finally {
        setLoaded(true);
      }
    };
    loadProfile();
  }, []);

  const setProfile = useCallback(async (p: UserProfile | null) => {
    try {
      setProfileState(p);
      if (p === null) {
        await AsyncStorage.removeItem("user_profile");
      } else {
        await AsyncStorage.setItem("user_profile", JSON.stringify(p));
      }
    } catch (err) {
      console.warn("Failed to save user profile:", err);
    }
  }, []);

  return {
    profile,
    setProfile,
    loaded,
  };
}
