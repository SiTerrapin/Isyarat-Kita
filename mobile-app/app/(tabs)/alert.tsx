import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  BellRing,
  CloudUpload,
  Mic,
  Minus,
  Plus,
  ShieldAlert,
  Square,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { AlertSeverity } from "@/services/api";

const METERING_RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

function dbfsToVisualDb(dbfs: number | undefined): number {
  if (typeof dbfs !== "number" || Number.isNaN(dbfs)) return 0;
  // Konversi metering expo-audio (-160..0 dBFS) ke skala visual 0..100 dB
  const clamped = Math.max(-160, Math.min(0, dbfs));
  if (clamped <= -100) {
    return Math.round(((clamped + 160) / 60) * 20);
  }
  return Math.round(20 + ((clamped + 100) / 100) * 80);
}

export default function SoundAlertScreen() {
  const {
    settings,
    isLoggedIn,
    recentAlerts,
    saveSettings,
    recordSoundAlert,
    requireAuth,
  } = useApp();

  const audioRecorder = useAudioRecorder(METERING_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder, 200);

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentDb, setCurrentDb] = useState(0);
  const [activeAlert, setActiveAlert] = useState<AlertSeverity | null>(null);
  const [flashOn, setFlashOn] = useState(false);

  const lastLogTimestampRef = useRef<number>(0);
  const threshold = settings.alert_threshold_db || 75;

  const triggerLoudSoundAlert = useCallback(
    (dbValue: number, severity: AlertSeverity) => {
      setActiveAlert(severity);

      const now = Date.now();
      if (now - lastLogTimestampRef.current > 5000) {
        lastLogTimestampRef.current = now;
        recordSoundAlert({
          sound_type:
            severity === "danger"
              ? "Suara Sangat Keras / Darurat"
              : "Suara Keras Lingkungan",
          decibel_level: dbValue,
          severity,
        });
      }
    },
    [recordSoundAlert]
  );

  // Pantau metering real-time dari expo-audio
  useEffect(() => {
    if (!isMonitoring || !recorderState.isRecording) return;

    const db = dbfsToVisualDb(recorderState.metering);
    setCurrentDb(db);

    if (db >= threshold) {
      const severity: AlertSeverity =
        db >= threshold + 12 ? "danger" : "warning";
      triggerLoudSoundAlert(db, severity);
    }
  }, [
    isMonitoring,
    recorderState.isRecording,
    recorderState.metering,
    threshold,
    triggerLoudSoundAlert,
  ]);

  // Efek berkedip kontras tinggi & getaran berpola saat peringatan aktif
  useEffect(() => {
    if (!activeAlert) {
      setFlashOn(false);
      return;
    }

    const flashInterval = setInterval(() => {
      setFlashOn((prev) => !prev);
      if (settings.haptic_enabled) {
        if (activeAlert === "danger") {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error
          ).catch(() => {});
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
            () => {}
          );
        }
      }
    }, 450);

    return () => clearInterval(flashInterval);
  }, [activeAlert, settings.haptic_enabled]);

  const stopMonitoring = useCallback(async () => {
    setIsMonitoring(false);
    setCurrentDb(0);
    setActiveAlert(null);

    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
    } catch {
      // Abaikan jika sudah berhenti
    }
  }, [audioRecorder]);

  // Pastikan rekaman berhenti saat keluar layar
  useEffect(() => {
    return () => {
      try {
        if (audioRecorder.isRecording) {
          audioRecorder.stop().catch(() => {});
        }
      } catch {
        // Abaikan
      }
    };
  }, [audioRecorder]);

  const startMonitoring = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Izin Mikrofon Ditolak",
          "Izinkan akses mikrofon agar Isyarat Kita dapat memantau suara darurat di sekitar Anda."
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsMonitoring(true);
    } catch (err: any) {
      Alert.alert(
        "Gagal Memulai Pemantauan",
        err?.message || "Pastikan mikrofon tidak sedang dipakai aplikasi lain."
      );
      stopMonitoring();
    }
  };

  const adjustThreshold = (delta: number) => {
    const next = Math.max(40, Math.min(95, threshold + delta));
    saveSettings({ alert_threshold_db: next });
  };

  // Latar belakang layar berkedip kontras tinggi saat suara keras terdeteksi
  const screenBgClass = activeAlert
    ? activeAlert === "danger"
      ? flashOn
        ? "bg-rose-600"
        : "bg-slate-950"
      : flashOn
      ? "bg-amber-500"
      : "bg-slate-950"
    : "bg-slate-50";

  const isAlertBannerActive = Boolean(activeAlert);

  return (
    <SafeAreaView className={`flex-1 ${screenBgClass}`} edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
      >
        {/* Header */}
        <View className="mb-5">
          <Text
            className={`text-2xl font-extrabold ${
              isAlertBannerActive ? "text-white" : "text-slate-900"
            }`}
          >
            Deteksi Suara Darurat
          </Text>
          <Text
            className={`mt-1 text-sm font-medium ${
              isAlertBannerActive ? "text-white/90" : "text-slate-600"
            }`}
          >
            Pantau klakson, sirine, atau teriakan di sekitar secara real-time.
          </Text>
        </View>

        {/* Banner Peringatan Kontras Tinggi */}
        {activeAlert && (
          <View className="mb-5 items-center rounded-3xl border-4 border-white bg-black/75 p-6">
            <ShieldAlert size={54} color="#FFFFFF" />
            <Text className="mt-3 text-center text-3xl font-black tracking-wide text-white">
              PERINGATAN: SUARA KERAS TERDETEKSI!
            </Text>
            <Text className="mt-2 text-lg font-bold text-amber-300">
              Level: {currentDb} dB (
              {activeAlert === "danger" ? "BAHAYA" : "WASPADA"})
            </Text>
            <Pressable
              onPress={() => setActiveAlert(null)}
              className="mt-5 w-full items-center rounded-2xl bg-white py-4 active:bg-slate-200"
            >
              <Text className="text-lg font-extrabold text-slate-950">
                Saya Mengerti (Matikan Kilatan)
              </Text>
            </Pressable>
          </View>
        )}

        {/* Tombol Bulat Besar Mulai / Hentikan */}
        <View className="mb-6 items-center rounded-3xl border border-slate-200 bg-white px-5 py-7">
          <Pressable
            onPress={isMonitoring ? stopMonitoring : startMonitoring}
            className={`h-44 w-44 items-center justify-center rounded-full shadow-md ${
              isMonitoring
                ? "bg-rose-600 active:bg-rose-700"
                : "bg-teal-600 active:bg-teal-700"
            }`}
            accessibilityLabel={
              isMonitoring
                ? "Hentikan pemantauan suara"
                : "Mulai pemantauan suara"
            }
          >
            {isMonitoring ? (
              <Square size={44} color="#FFFFFF" fill="#FFFFFF" />
            ) : (
              <Mic size={48} color="#FFFFFF" />
            )}
            <Text className="mt-2 text-base font-extrabold text-white">
              {isMonitoring ? "HENTIKAN" : "MULAI PANTAU"}
            </Text>
          </Pressable>

          {/* Visualisasi Meteran dB Real-Time */}
          <View className="mt-6 w-full">
            <View className="mb-2 flex-row items-end justify-between">
              <Text className="text-sm font-bold text-slate-600">
                Level Suara Saat Ini
              </Text>
              <Text
                className={`text-4xl font-black ${
                  currentDb >= threshold
                    ? "text-rose-600"
                    : currentDb >= threshold - 15
                    ? "text-amber-500"
                    : "text-teal-600"
                }`}
              >
                {currentDb}{" "}
                <Text className="text-base font-bold text-slate-500">dB</Text>
              </Text>
            </View>

            <View className="h-5 w-full overflow-hidden rounded-full bg-slate-200">
              <View
                style={{ width: `${Math.min(100, Math.max(2, currentDb))}%` }}
                className={`h-full rounded-full ${
                  currentDb >= threshold
                    ? "bg-rose-600"
                    : currentDb >= threshold - 15
                    ? "bg-amber-500"
                    : "bg-teal-600"
                }`}
              />
            </View>

            <View className="mt-1.5 flex-row justify-between">
              <Text className="text-xs font-semibold text-slate-400">
                0 dB (Sunyi)
              </Text>
              <Text className="text-xs font-bold text-teal-700">
                Ambang: {threshold} dB
              </Text>
              <Text className="text-xs font-semibold text-slate-400">
                100 dB (Sangat Keras)
              </Text>
            </View>
          </View>
        </View>

        {/* Pengaturan Ambang Batas Sensitivitas */}
        <View className="mb-6 rounded-3xl border border-slate-200 bg-white p-5">
          <Text className="text-base font-bold text-slate-900">
            Ambang Batas Peringatan (Sensitivitas)
          </Text>
          <Text className="mt-0.5 text-sm text-slate-600">
            Peringatan aktif jika suara melebihi {threshold} dB.
          </Text>

          <View className="mt-4 flex-row items-center justify-between gap-3">
            <Pressable
              onPress={() => adjustThreshold(-5)}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200"
            >
              <Minus size={22} color="#0F172A" />
            </Pressable>

            <View className="flex-1 items-center rounded-2xl bg-slate-100 py-3">
              <Text className="text-2xl font-extrabold text-teal-700">
                {threshold} dB
              </Text>
            </View>

            <Pressable
              onPress={() => adjustThreshold(5)}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200"
            >
              <Plus size={22} color="#0F172A" />
            </Pressable>
          </View>

          <View className="mt-3 flex-row gap-2">
            {[60, 75, 85].map((preset) => (
              <Pressable
                key={preset}
                onPress={() => saveSettings({ alert_threshold_db: preset })}
                className={`flex-1 items-center rounded-xl border py-2 ${
                  threshold === preset
                    ? "border-teal-600 bg-teal-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    threshold === preset ? "text-teal-700" : "text-slate-600"
                  }`}
                >
                  {preset === 60
                    ? "Sensitif (60)"
                    : preset === 75
                    ? "Standar (75)"
                    : "Bising (85)"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Log Peringatan Suara */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <BellRing
              size={18}
              color={isAlertBannerActive ? "#FFFFFF" : "#E11D48"}
            />
            <Text
              className={`ml-2 text-base font-bold ${
                isAlertBannerActive ? "text-white" : "text-slate-800"
              }`}
            >
              Log Peringatan Suara
            </Text>
          </View>
        </View>

        {recentAlerts.length === 0 ? (
          <View className="items-center rounded-2xl border border-slate-200 bg-white px-5 py-7">
            <AlertTriangle size={28} color="#94A3B8" />
            <Text className="mt-2 text-sm font-semibold text-slate-600">
              Belum ada suara darurat yang tercatat.
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {recentAlerts.slice(0, 10).map((item) => (
              <View
                key={`${item.id}-${item.created_at}`}
                className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4"
              >
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${
                        item.severity === "danger"
                          ? "bg-rose-100"
                          : "bg-amber-100"
                      }`}
                    >
                      <Text
                        className={`text-xs font-extrabold uppercase ${
                          item.severity === "danger"
                            ? "text-rose-700"
                            : "text-amber-700"
                        }`}
                      >
                        {item.severity}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Text className="mt-1 text-base font-bold text-slate-900">
                    {item.sound_type}
                  </Text>
                  {item.is_local && !isLoggedIn && (
                    <Pressable
                      onPress={() =>
                        requireAuth(
                          "Masuk untuk menyimpan log peringatan suara ke akun Anda.",
                          () => {
                            recordSoundAlert({
                              sound_type: item.sound_type,
                              decibel_level: item.decibel_level,
                              severity: item.severity,
                            });
                          }
                        )
                      }
                      className="mt-2 flex-row items-center self-start rounded-lg bg-teal-50 px-2.5 py-1"
                    >
                      <CloudUpload size={13} color="#0D9488" />
                      <Text className="ml-1 text-xs font-bold text-teal-700">
                        Simpan ke Akun
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Text className="text-xl font-black text-slate-900">
                  {Math.round(item.decibel_level)} dB
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
