import { useRouter } from "expo-router";
import {
  ArrowRight,
  BellRing,
  CloudUpload,
  HandMetal,
  History,
  LogIn,
  MessageSquareText,
  RefreshCw,
  Settings,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { TranslationLog } from "@/services/api";

export default function HomeScreen() {
  const router = useRouter();
  const {
    serverStatus,
    healthInfo,
    isLoggedIn,
    user,
    recentLogs,
    openAuthModal,
    requireAuth,
    refreshHealth,
    refreshLogs,
    refreshCards,
    saveTranslationLog,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshHealth(), refreshCards(), refreshLogs()]);
    setRefreshing(false);
  };

  const handleSaveGuestLog = (log: TranslationLog) => {
    requireAuth(
      "Masuk untuk menyimpan riwayat komunikasi ini ke akun Anda.",
      async () => {
        try {
          await saveTranslationLog({
            mode: log.mode,
            raw_gloss: log.raw_gloss,
            final_text: log.final_text,
            confidence: log.confidence,
          });
          Alert.alert("Tersimpan", "Riwayat berhasil disimpan ke akun Anda.");
        } catch (err: any) {
          Alert.alert("Gagal Menyimpan", err?.message || "Coba lagi nanti.");
        }
      }
    );
  };

  const isConnected = serverStatus === "connected";
  const displayedLogs = recentLogs.slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D9488"
          />
        }
      >
        {/* Header */}
        <View className="mb-5 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-3xl font-extrabold tracking-tight text-teal-700">
              Isyarat Kita
            </Text>
            <Text className="mt-0.5 text-sm font-medium text-slate-600">
              Menjembatani Sunyi, Menghubungkan Negeri.
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => refreshHealth()}
              className={`flex-row items-center rounded-full border px-3 py-2 ${
                isConnected
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}
              accessibilityLabel="Status koneksi server AI"
            >
              {isConnected ? (
                <Wifi size={15} color="#059669" />
              ) : (
                <WifiOff size={15} color="#E11D48" />
              )}
              <Text
                className={`ml-1.5 text-xs font-bold ${
                  isConnected ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {serverStatus === "checking"
                  ? "Cek..."
                  : isConnected
                  ? `AI ${healthInfo?.ai_mode === "model" ? "Aktif" : "Siap"}`
                  : "Terputus"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push("/settings")}
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white active:bg-slate-100"
              accessibilityLabel="Buka Pengaturan"
            >
              <Settings size={22} color="#0F172A" />
            </Pressable>
          </View>
        </View>

        {/* Banner Status Akun (Guest / Logged In) */}
        {isLoggedIn && user ? (
          <View className="mb-6 flex-row items-center justify-between rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4">
            <View className="flex-1 flex-row items-center pr-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-teal-600">
                <UserCheck size={22} color="#FFFFFF" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  Akun Terhubung
                </Text>
                <Text className="text-lg font-bold text-slate-900">
                  Halo, {user.full_name}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() =>
              openAuthModal(
                "Masuk untuk menyimpan kartu kustom & riwayat komunikasi di akun Anda."
              )
            }
            className="mb-6 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 active:bg-slate-100"
          >
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-slate-900">
                Mode Tamu Aktif
              </Text>
              <Text className="mt-0.5 text-sm text-slate-600">
                Masuk untuk menyimpan kartu kustom & riwayat komunikasi.
              </Text>
            </View>
            <View className="flex-row items-center rounded-xl bg-teal-600 px-4 py-2.5">
              <LogIn size={16} color="#FFFFFF" />
              <Text className="ml-1.5 text-sm font-bold text-white">Masuk</Text>
            </View>
          </Pressable>
        )}

        {/* 2 Hero Action Cards */}
        <Text className="mb-3 text-base font-bold text-slate-800">
          Fitur Utama
        </Text>

        <View className="mb-6 gap-3.5">
          <Pressable
            onPress={() => router.push("/(tabs)/translator")}
            className="rounded-3xl bg-teal-600 p-5 shadow-sm active:bg-teal-700"
          >
            <View className="flex-row items-center justify-between">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <HandMetal size={30} color="#FFFFFF" />
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <ArrowRight size={20} color="#FFFFFF" />
              </View>
            </View>
            <Text className="mt-4 text-2xl font-extrabold text-white">
              Penerjemah Isyarat
            </Text>
            <Text className="mt-1 text-sm font-medium text-teal-50">
              Terjemahkan BISINDO ke teks & suara, atau baca ucapan lawan bicara
              dengan font besar.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(tabs)/alert")}
            className="rounded-3xl border border-rose-200 bg-white p-5 shadow-sm active:bg-rose-50"
          >
            <View className="flex-row items-center justify-between">
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
                <BellRing size={30} color="#E11D48" />
              </View>
              <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <ArrowRight size={20} color="#0F172A" />
              </View>
            </View>
            <Text className="mt-4 text-2xl font-extrabold text-slate-900">
              Deteksi Suara Darurat
            </Text>
            <Text className="mt-1 text-sm font-medium text-slate-600">
              Pantau klakson, sirine, atau teriakan dengan kilatan visual
              kontras tinggi & getaran.
            </Text>
          </Pressable>
        </View>

        {/* Riwayat Komunikasi Terakhir */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <History size={18} color="#0D9488" />
            <Text className="ml-2 text-base font-bold text-slate-800">
              Riwayat Komunikasi Terakhir
            </Text>
          </View>
          <Pressable
            onPress={onRefresh}
            className="flex-row items-center rounded-lg px-2 py-1 active:bg-slate-200"
          >
            <RefreshCw size={14} color="#64748B" />
            <Text className="ml-1 text-xs font-semibold text-slate-500">
              Muat Ulang
            </Text>
          </Pressable>
        </View>

        {displayedLogs.length === 0 ? (
          <View className="items-center rounded-2xl border border-slate-200 bg-white px-5 py-8">
            <MessageSquareText size={32} color="#94A3B8" />
            <Text className="mt-3 text-center text-base font-bold text-slate-800">
              Belum Ada Riwayat Komunikasi
            </Text>
            <Text className="mt-1 text-center text-sm text-slate-500">
              Mulai gunakan Penerjemah Isyarat untuk melihat ringkasan
              percakapan terakhir di sini.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {displayedLogs.map((item) => (
              <View
                key={`${item.id}-${item.created_at}`}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <View className="mb-1.5 flex-row items-center justify-between">
                  <View
                    className={`rounded-full px-2.5 py-1 ${
                      item.mode === "sign_to_text"
                        ? "bg-teal-50"
                        : "bg-amber-50"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        item.mode === "sign_to_text"
                          ? "text-teal-700"
                          : "text-amber-700"
                      }`}
                    >
                      {item.mode === "sign_to_text"
                        ? "Isyarat -> Suara"
                        : "Suara -> Teks"}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-400">
                    {new Date(item.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <Text className="text-base font-bold text-slate-900">
                  {item.final_text}
                </Text>

                {item.raw_gloss ? (
                  <Text className="mt-1 text-xs font-medium text-slate-500">
                    Gloss: {item.raw_gloss}
                  </Text>
                ) : null}

                {item.is_local && !isLoggedIn && (
                  <Pressable
                    onPress={() => handleSaveGuestLog(item)}
                    className="mt-3 flex-row items-center self-start rounded-xl bg-teal-50 px-3 py-2 active:bg-teal-100"
                  >
                    <CloudUpload size={15} color="#0D9488" />
                    <Text className="ml-1.5 text-xs font-bold text-teal-700">
                      Simpan ke Akun
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
