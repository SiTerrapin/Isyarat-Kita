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
  Radio,
  ShieldAlert,
  Square,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { AlertSeverity, api, SoundCategory } from "@/services/api";

const METERING_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

type MicGainLevel = "low" | "normal" | "high";
const MIC_GAIN_OFFSETS: Record<MicGainLevel, { label: string; offsetDb: number }> = {
  low: { label: "Rendah (-10)", offsetDb: -10 },
  normal: { label: "Normal (0)", offsetDb: 0 },
  high: { label: "Tinggi (+12)", offsetDb: 12 },
};

const PATTERN_EMOJI: Record<SoundCategory, string> = {
  klakson: "🚗",
  sirine: "🚑",
  alarm: "🔔",
  teriakan: "📢",
  ketukan: "🚪",
  bising: "🔊",
  tenang: "🤫",
};

function dbfsToResponsiveDb(dbfs: number | undefined, gainOffset: number): number {
  if (typeof dbfs !== "number" || Number.isNaN(dbfs)) return 0;
  // Kalibrasi responsif untuk mikrofon Android/iOS:
  // -65 dBFS (sunyi) -> ~0 dB, -35 dBFS (percakapan) -> ~55 dB, -12 dBFS (keras) -> ~88 dB, 0 dBFS -> 100 dB
  const clamped = Math.max(-70, Math.min(0, dbfs));
  const raw = ((clamped + 70) / 70) * 100 + gainOffset;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export default function SoundAlertScreen() {
  const {
    serverUrl,
    settings,
    isLoggedIn,
    isDark,
    recentAlerts,
    saveSettings,
    recordSoundAlert,
    requireAuth,
  } = useApp();

  const audioRecorder = useAudioRecorder(METERING_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [micGain, setMicGain] = useState<MicGainLevel>("normal");
  const [currentDb, setCurrentDb] = useState(0);
  const [peakDb, setPeakDb] = useState(0);
  const [activeAlert, setActiveAlert] = useState<AlertSeverity | null>(null);
  const [detectedLabel, setDetectedLabel] = useState<string>(
    "Suara Keras Terdeteksi"
  );
  const [detectedCategory, setDetectedCategory] =
    useState<SoundCategory>("bising");
  const [isAnalyzingPattern, setIsAnalyzingPattern] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const isMonitoringRef = useRef(false);
  const analyzingRef = useRef(false);
  const lastAnalyzeTsRef = useRef<number>(0);
  const threshold = settings.alert_threshold_db || 75;

  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  const restartMonitoringStream = useCallback(async () => {
    if (!isMonitoringRef.current) return;
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      // Abaikan jika user sudah menghentikan pemantauan
    }
  }, [audioRecorder]);

  const analyzeAndRecordPattern = useCallback(
    async (dbValue: number, fallbackSeverity: AlertSeverity) => {
      const now = Date.now();
      if (analyzingRef.current || now - lastAnalyzeTsRef.current < 4500) {
        return;
      }
      analyzingRef.current = true;
      lastAnalyzeTsRef.current = now;
      setIsAnalyzingPattern(true);

      let finalSoundType =
        fallbackSeverity === "danger"
          ? "Suara Sangat Keras / Darurat"
          : "Suara Keras Lingkungan";
      let finalSeverity: AlertSeverity = fallbackSeverity;
      let finalCategory: SoundCategory = "bising";

      try {
        if (audioRecorder.isRecording) {
          await audioRecorder.stop();
        }
        const clipUri = audioRecorder.uri;
        // Langsung mulai rekam lagi agar pemantauan nyaris tanpa jeda
        await restartMonitoringStream();

        if (clipUri) {
          const pattern = await api.detectSoundPattern(serverUrl, clipUri);
          if (pattern && pattern.sound_type) {
            finalSoundType = pattern.sound_type;
            finalSeverity = pattern.severity;
            finalCategory = pattern.category;
          }
        }
      } catch {
        // Fallback offline bila server tidak terjangkau
        await restartMonitoringStream();
      } finally {
        setDetectedLabel(finalSoundType);
        setDetectedCategory(finalCategory);
        setActiveAlert(finalSeverity);
        setIsAnalyzingPattern(false);
        analyzingRef.current = false;

        recordSoundAlert({
          sound_type: finalSoundType,
          decibel_level: dbValue,
          severity: finalSeverity,
        });
      }
    },
    [audioRecorder, restartMonitoringStream, serverUrl, recordSoundAlert]
  );

  // Pantau metering real-time dengan sensitivitas terkalibrasi + Peak Hold
  useEffect(() => {
    if (!isMonitoring || !recorderState.isRecording) return;

    const db = dbfsToResponsiveDb(
      recorderState.metering,
      MIC_GAIN_OFFSETS[micGain].offsetDb
    );
    setCurrentDb(db);
    setPeakDb((prev) => (db > prev ? db : Math.max(db, prev - 2)));

    if (db >= threshold) {
      const severity: AlertSeverity =
        db >= threshold + 12 ? "danger" : "warning";
      setActiveAlert(severity);
      analyzeAndRecordPattern(db, severity);
    }
  }, [
    isMonitoring,
    recorderState.isRecording,
    recorderState.metering,
    micGain,
    threshold,
    analyzeAndRecordPattern,
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
    isMonitoringRef.current = false;
    setCurrentDb(0);
    setPeakDb(0);
    setActiveAlert(null);

    try {
      if (audioRecorder.isRecording) {
        await audioRecorder.stop();
      }
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {
      // Abaikan
    }
  }, [audioRecorder]);

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
      isMonitoringRef.current = true;
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

  const screenBgClass = activeAlert
    ? activeAlert === "danger"
      ? flashOn
        ? "bg-rose-600"
        : "bg-slate-950"
      : flashOn
      ? "bg-amber-500"
      : "bg-slate-950"
    : "bg-slate-50 dark:bg-slate-950";

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
              isAlertBannerActive
                ? "text-white"
                : "text-slate-900 dark:text-white"
            }`}
          >
            Deteksi Suara Darurat
          </Text>
          <Text
            className={`mt-1 text-sm font-medium ${
              isAlertBannerActive
                ? "text-white/90"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            Deteksi otomatis klakson, sirine, alarm, teriakan, & ketukan keras.
          </Text>
        </View>

        {/* Banner Peringatan Kontras Tinggi + Pola Suara */}
        {activeAlert && (
          <View className="mb-5 items-center rounded-3xl border-4 border-white bg-black/80 p-6">
            <ShieldAlert size={52} color="#FFFFFF" />
            <Text className="mt-2 text-center text-2xl font-black tracking-wide text-white">
              PERINGATAN: SUARA KERAS TERDETEKSI!
            </Text>

            <View className="mt-3 flex-row items-center rounded-2xl bg-white/15 px-4 py-2">
              {isAnalyzingPattern ? (
                <>
                  <ActivityIndicator color="#FDE047" size="small" />
                  <Text className="ml-2 text-sm font-extrabold text-amber-300">
                    Menganalisis pola suara...
                  </Text>
                </>
              ) : (
                <Text className="text-base font-extrabold text-amber-300">
                  {PATTERN_EMOJI[detectedCategory]} {detectedLabel}
                </Text>
              )}
            </View>

            <Text className="mt-2 text-base font-bold text-white/90">
              Level: {Math.max(currentDb, peakDb)} dB (
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
        <View className="mb-5 items-center rounded-3xl border border-slate-200 bg-white px-5 py-7 dark:border-slate-800 dark:bg-slate-900">
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

          {/* Visualisasi Meteran dB Real-Time + Peak Hold */}
          <View className="mt-6 w-full">
            <View className="mb-2 flex-row items-end justify-between">
              <View>
                <Text className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  Level Suara Real-Time
                </Text>
                <Text className="text-xs font-semibold text-slate-400">
                  Puncak (Peak): {peakDb} dB
                </Text>
              </View>
              <Text
                className={`text-4xl font-black ${
                  currentDb >= threshold
                    ? "text-rose-600"
                    : currentDb >= threshold - 15
                    ? "text-amber-500"
                    : "text-teal-600 dark:text-teal-400"
                }`}
              >
                {currentDb}{" "}
                <Text className="text-base font-bold text-slate-500 dark:text-slate-400">
                  dB
                </Text>
              </Text>
            </View>

            <View className="h-5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
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
              <Text className="text-xs font-bold text-teal-700 dark:text-teal-400">
                Ambang: {threshold} dB
              </Text>
              <Text className="text-xs font-semibold text-slate-400">
                100 dB (Keras)
              </Text>
            </View>
          </View>
        </View>

        {/* Kalibrasi Sensitivitas Mikrofon & Ambang Batas */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <View className="mb-3 flex-row items-center">
            <Radio size={18} color={isDark ? "#2DD4BF" : "#0D9488"} />
            <Text className="ml-2 text-base font-bold text-slate-900 dark:text-white">
              Sensitivitas Mikrofon & Ambang Batas
            </Text>
          </View>

          <Text className="mb-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
            Penguatan Mikrofon (Mic Gain)
          </Text>
          <View className="mb-4 flex-row gap-2">
            {(["low", "normal", "high"] as MicGainLevel[]).map((lvl) => {
              const active = micGain === lvl;
              return (
                <Pressable
                  key={lvl}
                  onPress={() => setMicGain(lvl)}
                  className={`flex-1 items-center rounded-xl border py-2.5 ${
                    active
                      ? "border-teal-600 bg-teal-600"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      active
                        ? "text-white"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {MIC_GAIN_OFFSETS[lvl].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-2 text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
            Ambang Peringatan ({threshold} dB)
          </Text>
          <View className="flex-row items-center justify-between gap-3">
            <Pressable
              onPress={() => adjustThreshold(-5)}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
            >
              <Minus size={22} color={isDark ? "#F8FAFC" : "#0F172A"} />
            </Pressable>

            <View className="flex-1 items-center rounded-2xl bg-slate-100 py-3 dark:bg-slate-800">
              <Text className="text-2xl font-extrabold text-teal-700 dark:text-teal-400">
                {threshold} dB
              </Text>
            </View>

            <Pressable
              onPress={() => adjustThreshold(5)}
              className="h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
            >
              <Plus size={22} color={isDark ? "#F8FAFC" : "#0F172A"} />
            </Pressable>
          </View>

          <View className="mt-3 flex-row gap-2">
            {[60, 75, 85].map((preset) => (
              <Pressable
                key={preset}
                onPress={() => saveSettings({ alert_threshold_db: preset })}
                className={`flex-1 items-center rounded-xl border py-2 ${
                  threshold === preset
                    ? "border-teal-600 bg-teal-50 dark:bg-teal-950"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    threshold === preset
                      ? "text-teal-700 dark:text-teal-300"
                      : "text-slate-600 dark:text-slate-300"
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
                isAlertBannerActive
                  ? "text-white"
                  : "text-slate-800 dark:text-white"
              }`}
            >
              Log Peringatan Suara
            </Text>
          </View>
        </View>

        {recentAlerts.length === 0 ? (
          <View className="items-center rounded-2xl border border-slate-200 bg-white px-5 py-7 dark:border-slate-800 dark:bg-slate-900">
            <AlertTriangle size={28} color="#94A3B8" />
            <Text className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-400">
              Belum ada suara darurat yang tercatat.
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {recentAlerts.slice(0, 10).map((item) => (
              <View
                key={`${item.id}-${item.created_at}`}
                className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`rounded-full px-2.5 py-0.5 ${
                        item.severity === "danger"
                          ? "bg-rose-100 dark:bg-rose-950"
                          : "bg-amber-100 dark:bg-amber-950"
                      }`}
                    >
                      <Text
                        className={`text-xs font-extrabold uppercase ${
                          item.severity === "danger"
                            ? "text-rose-700 dark:text-rose-300"
                            : "text-amber-700 dark:text-amber-300"
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
                  <Text className="mt-1 text-base font-bold text-slate-900 dark:text-white">
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
                      className="mt-2 flex-row items-center self-start rounded-lg bg-teal-50 px-2.5 py-1 dark:bg-teal-950"
                    >
                      <CloudUpload size={13} color="#0D9488" />
                      <Text className="ml-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                        Simpan ke Akun
                      </Text>
                    </Pressable>
                  )}
                </View>

                <Text className="text-xl font-black text-slate-900 dark:text-white">
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
