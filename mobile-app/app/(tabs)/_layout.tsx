import { Tabs } from "expo-router";
import {
  BellRing,
  CreditCard,
  HandMetal,
  Home,
} from "lucide-react-native";
import React from "react";
import { Platform } from "react-native";

import { useApp } from "@/context/AppContext";

export default function TabsLayout() {
  const { isDark } = useApp();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: isDark ? "#2DD4BF" : "#0D9488",
        tabBarInactiveTintColor: isDark ? "#94A3B8" : "#64748B",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
          marginBottom: Platform.OS === "ios" ? 0 : 4,
        },
        tabBarStyle: {
          backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
          borderTopColor: isDark ? "#1E293B" : "#E2E8F0",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 86 : 68,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Beranda",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="translator"
        options={{
          title: "Translator",
          tabBarIcon: ({ color, size }) => (
            <HandMetal size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alert"
        options={{
          title: "Suara Darurat",
          tabBarIcon: ({ color, size }) => (
            <BellRing size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          title: "Kartu Cepat",
          tabBarIcon: ({ color, size }) => (
            <CreditCard size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
