import { useRouter } from "expo-router";
import {
  CheckCircle2,
  LogIn,
  LogOut,
  Play,
  Server,
  Square,
  Vibrate,
  Volume2,
  X,
  XCircle,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useTTS } from "@/hooks/useTTS";
import { TTS_VOICE_CHOICES, TTSVoiceOption } from "@/services/api";

const SPEECH_RATES = [
  { label: "Lambat (0.75x)", value: 0.75 },
  { label: "Normal (1.0x)", value: 1.0 },
  { label: "Cepat (1.25x)", value: 1.25 },
];

export default function SettingsModalScreen() {
  const router = useRouter();
  const {
    serverUrl,
    detectedHostUrl,
    serverStatus,
    healthInfo,
    lastHealthError,
    isLoggedIn,
    user,
    settings,
    updateServerUrl,
    autoDetectServerUrl,
    saveSettings,
    openAuthModal,
    logout,
  } = useApp();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const {
    speak,
    stop: stopTTS,
    isLoading: testingVoice,
    isSpeaking: isVoicePlaying,
  } = useTTS();

  const selectedVoice: TTSVoiceOption = settings.tts_voice || "id-ID-ArdiNeural";

  const handleTestVoice = () => {
    if (isVoicePlaying || testingVoice) {
      stopTTS();
      return;
    }
    speak("Halo, ini suara aplikasi Isyarat Kita.", {
      speakerRole: "user",
      voiceOverride: selectedVoice,
    });
  };

  const handleAutoDetect = async () => {
    setTesting(true);
    setTestResult(null);
    const detected = await autoDetectServerUrl();
    setTesting(false);
    if (detected) {
      setUrlInput(detected);
      setTestResult(serverStatus === "connected" ? "ok" : null);
    } else {
      Alert.alert(
        "IP Tidak Terdeteksi",
        "Tidak dapat membaca IP host dari Expo Go (mungkin sedang mode tunnel). Masukkan IP laptop atau URL ngrok secara manual."
      );
    }
  };

  const handleTestConnection = async () => {
    if (!urlInput.trim().startsWith("http")) {
      Alert.alert(
        "URL Tidak Valid",
        "Masukkan URL lengkap diawali http:// atau https:// (contoh: http://192.168.1.10:8000)."
      );
      return;
    }
    setTesting(true);
    setTestResult(null);
    const ok = await updateServerUrl(urlInput.trim());
    setTesting(false);
    setTestResult(ok ? "ok" : "fail");
  };

  const handleLogout = () => {
    Alert.alert("Keluar Akun", "Apakah Anda yakin ingin keluar ke Mode Tamu?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
        <Text className="text-xl font-extrabold text-slate-900">
          Pengaturan
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"
          accessibilityLabel="Tutup Pengaturan"
        >
          <X size={22} color="#0F172A" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        {/* Server Backend URL */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="mb-3 flex-row items-center">
            <Server size={20} color="#0D9488" />
            <Text className="ml-2 text-base font-bold text-slate-900">
              Koneksi Server Backend AI
            </Text>
          </View>
          <Text className="mb-3 text-sm text-slate-600">
            Masukkan IP lokal laptop (contoh: http://192.168.1.10:8000) atau URL
            ngrok agar HP dapat terhubung ke server FastAPI.
          </Text>

          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder={detectedHostUrl || "http://192.168.1.6:8000"}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base font-medium text-slate-900"
          />

          <View className="flex-row gap-2">
            <Pressable
              onPress={handleAutoDetect}
              disabled={testing}
              className="items-center justify-center rounded-2xl border border-teal-600 bg-teal-50 px-4 py-3.5 active:bg-teal-100"
            >
              <Text className="text-sm font-bold text-teal-700">
                Deteksi IP Otomatis
              </Text>
            </Pressable>

            <Pressable
              onPress={handleTestConnection}
              disabled={testing}
              className="flex-1 flex-row items-center justify-center rounded-2xl bg-teal-600 py-3.5 active:bg-teal-700"
            >
              {testing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-bold text-white">
                  Simpan & Tes (/health)
                </Text>
              )}
            </Pressable>
          </View>

          {(testResult || serverStatus !== "checking") && (
            <View
              className={`mt-3 flex-row items-center rounded-2xl px-3.5 py-2.5 ${
                serverStatus === "connected" ? "bg-emerald-50" : "bg-rose-50"
              }`}
            >
              {serverStatus === "connected" ? (
                <CheckCircle2 size={18} color="#059669" />
              ) : (
                <XCircle size={18} color="#E11D48" />
              )}
              <Text
                className={`ml-2 flex-1 text-xs font-semibold ${
                  serverStatus === "connected"
                    ? "text-emerald-800"
                    : "text-rose-800"
                }`}
              >
                {serverStatus === "connected"
                  ? `Terhubung ke ${serverUrl}! DB: ${healthInfo?.database}, AI: ${healthInfo?.ai_mode}`
                  : lastHealthError ||
                    "Gagal terhubung. Pastikan server Uvicorn aktif & port 8000 terbuka di Firewall."}
              </Text>
            </View>
          )}
        </View>

        {/* Pilihan Karakter Suara (Multi-Voice TTS) */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Volume2 size={20} color="#0D9488" />
              <Text className="ml-2 text-base font-bold text-slate-900">
                Karakter Suara (Multi-Voice TTS)
              </Text>
            </View>
            <Pressable
              onPress={handleTestVoice}
              className="flex-row items-center rounded-xl bg-teal-50 px-3 py-1.5 active:bg-teal-100"
            >
              {testingVoice ? (
                <ActivityIndicator color="#0D9488" size="small" />
              ) : isVoicePlaying ? (
                <Square size={14} color="#0D9488" fill="#0D9488" />
              ) : (
                <Play size={14} color="#0D9488" />
              )}
              <Text className="ml-1.5 text-xs font-bold text-teal-700">
                {testingVoice
                  ? "Memuat..."
                  : isVoicePlaying
                  ? "Stop"
                  : "Tes Suara"}
              </Text>
            </Pressable>
          </View>

          <View className="gap-2">
            {TTS_VOICE_CHOICES.map((choice) => {
              const active = selectedVoice === choice.key;
              return (
                <Pressable
                  key={choice.key}
                  onPress={() => saveSettings({ tts_voice: choice.key })}
                  className={`rounded-2xl border p-3.5 ${
                    active
                      ? "border-teal-600 bg-teal-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <Text
                    className={`text-sm font-extrabold ${
                      active ? "text-teal-800" : "text-slate-900"
                    }`}
                  >
                    {choice.title}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-600">
                    {choice.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Kecepatan Bicara TTS */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="mb-3 flex-row items-center">
            <Volume2 size={20} color="#0D9488" />
            <Text className="ml-2 text-base font-bold text-slate-900">
              Kecepatan Suara (TTS Bahasa Indonesia)
            </Text>
          </View>
          <View className="flex-row gap-2">
            {SPEECH_RATES.map((item) => {
              const active =
                Math.abs(settings.tts_speech_rate - item.value) < 0.05;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => saveSettings({ tts_speech_rate: item.value })}
                  className={`flex-1 items-center rounded-2xl border py-3 ${
                    active
                      ? "border-teal-600 bg-teal-600"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      active ? "text-white" : "text-slate-700"
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Aksesibilitas Haptics */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center pr-4">
              <Vibrate size={20} color="#0D9488" />
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-slate-900">
                  Getaran Haptic Darurat
                </Text>
                <Text className="mt-0.5 text-sm text-slate-600">
                  Getarkan ponsel secara berpola saat suara keras terdeteksi.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.haptic_enabled}
              onValueChange={(val) => saveSettings({ haptic_enabled: val })}
              trackColor={{ false: "#CBD5E1", true: "#0D9488" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Akun */}
        <View className="rounded-3xl border border-slate-200 bg-white p-5">
          <Text className="mb-2 text-base font-bold text-slate-900">
            Akun Pengguna
          </Text>
          {isLoggedIn && user ? (
            <>
              <Text className="text-base font-semibold text-slate-800">
                {user.full_name}
              </Text>
              <Text className="mb-4 text-sm text-slate-500">{user.email}</Text>
              <Pressable
                onPress={handleLogout}
                className="flex-row items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 py-3.5 active:bg-rose-100"
              >
                <LogOut size={18} color="#E11D48" />
                <Text className="ml-2 text-base font-bold text-rose-700">
                  Keluar (Kembali ke Mode Tamu)
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mb-4 text-sm text-slate-600">
                Saat ini Anda menggunakan Mode Tamu. Masuk untuk sinkronisasi
                kartu kustom, riwayat, dan pengaturan.
              </Text>
              <Pressable
                onPress={() =>
                  openAuthModal("Masuk atau daftar untuk menyimpan data Anda.")
                }
                className="flex-row items-center justify-center rounded-2xl bg-teal-600 py-3.5 active:bg-teal-700"
              >
                <LogIn size={18} color="#FFFFFF" />
                <Text className="ml-2 text-base font-bold text-white">
                  Masuk / Daftar Akun
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
