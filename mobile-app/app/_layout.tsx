import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthModal } from "@/components/AuthModal";
import { AppProvider } from "@/context/AppContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="settings"
            options={{
              presentation: "modal",
              headerShown: false,
            }}
          />
        </Stack>
        <AuthModal />
      </AppProvider>
    </SafeAreaProvider>
  );
}
