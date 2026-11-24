import { Lock, Mail, User, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useApp } from "@/context/AppContext";

export function AuthModal() {
  const { authModalVisible, authModalReason, closeAuthModal, login, register } =
    useApp();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setErrorMessage(null);
    setPassword("");
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (mode === "register" && fullName.trim().length < 2) {
      setErrorMessage("Nama lengkap minimal 2 karakter.");
      return;
    }
    if (!email.trim().includes("@")) {
      setErrorMessage("Masukkan alamat email yang valid.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password minimal 6 karakter.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(fullName.trim(), email.trim(), password);
      }
      resetForm();
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Gagal autentikasi. Periksa koneksi ke server."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={authModalVisible}
      animationType="slide"
      transparent
      onRequestClose={closeAuthModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end bg-black/50"
      >
        <View className="max-h-[90%] rounded-t-3xl bg-white px-6 pb-8 pt-6 dark:bg-slate-900">
          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-2xl font-bold text-slate-900 dark:text-white">
                {mode === "login" ? "Masuk ke Isyarat Kita" : "Buat Akun Baru"}
              </Text>
              <Text className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {authModalReason ||
                  "Simpan kartu kustom, riwayat terjemahan, dan pengaturan Anda."}
              </Text>
            </View>
            <Pressable
              onPress={closeAuthModal}
              className="h-11 w-11 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200 dark:bg-slate-800"
              accessibilityLabel="Tutup modal autentikasi"
            >
              <X size={22} color="#64748B" />
            </Pressable>
          </View>

          {/* Segmented Tab */}
          <View className="mb-5 flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <Pressable
              onPress={() => {
                setMode("login");
                setErrorMessage(null);
              }}
              className={`flex-1 items-center rounded-xl py-3 ${
                mode === "login" ? "bg-teal-600" : "bg-transparent"
              }`}
            >
              <Text
                className={`text-base font-bold ${
                  mode === "login"
                    ? "text-white"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Masuk
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode("register");
                setErrorMessage(null);
              }}
              className={`flex-1 items-center rounded-xl py-3 ${
                mode === "register" ? "bg-teal-600" : "bg-transparent"
              }`}
            >
              <Text
                className={`text-base font-bold ${
                  mode === "register"
                    ? "text-white"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Daftar
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {mode === "register" && (
              <View className="mb-4">
                <Text className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Nama Lengkap
                </Text>
                <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800">
                  <User size={20} color="#64748B" />
                  <TextInput
                    value={fullName}
                    onChangeText={setFullName}
                    placeholder="Contoh: Budi Santoso"
                    placeholderTextColor="#94A3B8"
                    className="ml-3 flex-1 text-base text-slate-900 dark:text-white"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View className="mb-4">
              <Text className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Email
              </Text>
              <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800">
                <Mail size={20} color="#64748B" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nama@email.com"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="ml-3 flex-1 text-base text-slate-900 dark:text-white"
                />
              </View>
            </View>

            <View className="mb-5">
              <Text className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Password
              </Text>
              <View className="flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800">
                <Lock size={20} color="#64748B" />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Minimal 6 karakter"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                  autoCapitalize="none"
                  className="ml-3 flex-1 text-base text-slate-900 dark:text-white"
                />
              </View>
            </View>

            {errorMessage && (
              <View className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                <Text className="text-sm font-semibold text-rose-700">
                  {errorMessage}
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              className="items-center justify-center rounded-2xl bg-teal-600 py-4 active:bg-teal-700"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-lg font-bold text-white">
                  {mode === "login" ? "Masuk Sekarang" : "Daftar & Masuk"}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={closeAuthModal}
              className="mt-3 items-center py-3"
            >
              <Text className="text-sm font-semibold text-slate-500">
                Lanjut sebagai Tamu (Tanpa Login)
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
