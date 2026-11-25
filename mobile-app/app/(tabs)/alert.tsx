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
  Platform,
  Pressable,
  ScrollView,
  Text,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import {
  AlertSeverity,
  api,
  SoundCategory,
  SoundSeverity,
} from "@/services/api";

const METERING_RECORDING_OPTIONS = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

// Trigger cepat tanggap untuk klakson singkat 1x ("bim!")
const MOVING_AVG_WINDOW = 2; // smoothing ringan 2 sampel (~150-200ms)
const SHORT_CLIP_CAPTURE_MS = 1000; // rekaman singkat 1.0 detik saja
const ALERT_COOLDOWN_MS = 3000; // cooldown 3 detik setelah alert muncul

type SensitivityPreset = {
  key: "tenang" | "normal" | "ramai";
  label: string;
  desc: string;
  thresholdDb: number;
};

const SENSITIVITY_MODES: SensitivityPreset[] = [
  { key: "tenang", label: "Tenang", desc: "62 dB", thresholdDb: 62 },
  { key: "normal", label: "Normal", desc: "75 dB", thresholdDb: 75 },
  { key: "ramai", label: "Ramai", desc: "85 dB", thresholdDb: 85 },
];

const CATEGORY_EMOJI: Record<SoundCategory, string> = {
  emergency: "🚨",
  traffic: "🚗",
  danger: "⚠️",
  home: "🔔",
  none: "🤫",
};

interface ActiveAlertState {
  category: SoundCategory;
  labelId: string;
  severity: SoundSeverity;
  decibel: number;
}

function dbfsToResponsiveDb(dbfs: number | undefined): number {
  if (typeof dbfs !== "number" || Number.isNaN(dbfs)) return 0;
  const clamped = Math.max(-70, Math.min(0, dbfs));
  return Math.max(0, Math.min(100, Math.round(((clamped + 70) / 70) * 100)));
}

function startEmergencyVibration(
  category: SoundCategory,
  severity: SoundSeverity
) {
  Vibration.cancel();
  const isHigh =
    category === "emergency" || category === "danger" || severity === "high";

  if (Platform.OS === "android") {
    // Pola getar motor asli Android (pasti terasa kuat meski Touch Haptics HP mati)
    if (isHigh) {
      // [tunggu 0ms, getar 500ms, jeda 200ms, getar 500ms, jeda 200ms, getar 700ms] berulang
      Vibration.vibrate([0, 500, 200, 500, 200, 700], true);
    } else {
      // Getar 2x jelas untuk panggilan rumah (bel/ketukan)
      Vibration.vibrate([0, 300, 180, 300], false);
    }
  } else {
    // iOS: kombinasikan Vibration + Haptics
    Vibration.vibrate(isHigh ? [400, 400] : 300, isHigh);
  }

  // Tambahan haptic feedback
  if (isHigh) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
      () => {}
    );
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }
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
  const recorderState = useAudioRecorderState(audioRecorder, 100);

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [smoothedDb, setSmoothedDb] = useState(0);
  const [activeAlert, setActiveAlert] = useState<ActiveAlertState | null>(null);
  const [isAnalyzingPattern, setIsAnalyzingPattern] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const isMonitoringRef = useRef(false);
  const analyzingRef = useRef(false);
  const dbWindowRef = useRef<number[]>([]);
  const clipStartTsRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);

  const threshold = settings.alert_threshold_db || 75;

  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  const dismissAlert = useCallback(() => {
    Vibration.cancel();
    setActiveAlert(null);
  }, []);

  const restartMonitoringStream = useCallback(async () => {
    if (!isMonitoringRef.current) return;
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      clipStartTsRef.current = Date.now();
    } catch {
      // Abaikan jika user sudah menghentikan pemantauan
    }
  }, [audioRecorder]);

  const analyzeTriggeredSound = useCallback(
    async (dbValue: number) => {
      const now = Date.now();
      if (analyzingRef.current || now < cooldownUntilRef.current) {
        return;
      }

      analyzingRef.current = true;
      setIsAnalyzingPattern(true);

      try {
        // Pastikan klip singkat ~1.0 detik sudah terekam sebelum dikirim
        const elapsedClip = Date.now() - clipStartTsRef.current;
        if (elapsedClip < SHORT_CLIP_CAPTURE_MS) {
          await new Promise((r) =>
            setTimeout(r, Math.min(450, SHORT_CLIP_CAPTURE_MS - elapsedClip))
          );
        }

        if (audioRecorder.isRecording) {
          await audioRecorder.stop();
        }
        const clipUri = audioRecorder.uri;
        await restartMonitoringStream();

        if (!clipUri) return;

        const res = await api.detectSoundPattern(serverUrl, clipUri);

        // Abaikan jika backend mendeteksi gesekan mic / angin / bukan alert
        if (!res.is_alert) {
          return;
        }

        cooldownUntilRef.current = Date.now() + ALERT_COOLDOWN_MS;
        setActiveAlert({
          category: res.category,
          labelId: res.label_id,
          severity: res.severity,
          decibel: Math.max(dbValue, Math.round(res.decibel_level)),
        });

        const dbSeverity: AlertSeverity =
          res.severity === "high" ? "danger" : "warning";
        recordSoundAlert({
          sound_type: res.label_id,
          decibel_level: dbValue,
          severity: dbSeverity,
        });
      } catch {
        await restartMonitoringStream();
        cooldownUntilRef.current = Date.now() + ALERT_COOLDOWN_MS;
        const sev: SoundSeverity = dbValue >= threshold + 12 ? "high" : "medium";
        setActiveAlert({
          category: "danger",
          labelId: "Suara Keras Terdeteksi",
          severity: sev,
          decibel: dbValue,
        });
        recordSoundAlert({
          sound_type: "Suara Keras Terdeteksi",
          decibel_level: dbValue,
          severity: sev === "high" ? "danger" : "warning",
        });
      } finally {
        setIsAnalyzingPattern(false);
        analyzingRef.current = false;
      }
    },
    [audioRecorder, restartMonitoringStream, serverUrl, threshold, recordSoundAlert]
  );

  // Trigger cepat tanggap: smoothing ringan 2 sampel (~150-200ms) tanpa syarat sustain 0.8s
  useEffect(() => {
    if (!isMonitoring || !recorderState.isRecording) return;

    const rawDb = dbfsToResponsiveDb(recorderState.metering);
    const win = dbWindowRef.current;
    win.push(rawDb);
    if (win.length > MOVING_AVG_WINDOW) {
      win.shift();
    }
    const avgDb = Math.round(win.reduce((a, b) => a + b, 0) / win.length);
    setSmoothedDb(avgDb);

    const now = Date.now();
    if (avgDb >= threshold && now >= cooldownUntilRef.current) {
      analyzeTriggeredSound(avgDb);
      return;
    }

    // Rotasi buffer rekaman tiap ~1.6 detik saat tenang agar file upload selalu ringan (~1 detik)
    if (
      !analyzingRef.current &&
      clipStartTsRef.current > 0 &&
      now - clipStartTsRef.current >= 1600
    ) {
      clipStartTsRef.current = now;
      audioRecorder
        .stop()
        .then(() => restartMonitoringStream())
        .catch(() => {});
    }
  }, [
    isMonitoring,
    recorderState.isRecording,
    recorderState.metering,
    threshold,
    audioRecorder,
    restartMonitoringStream,
    analyzeTriggeredSound,
  ]);

  // Efek layar berkedip + getaran motor HP kuat saat alert aktif
  useEffect(() => {
    if (!activeAlert) {
      Vibration.cancel();
      setFlashOn(false);
      return;
    }

    if (settings.haptic_enabled) {
      startEmergencyVibration(activeAlert.category, activeAlert.severity);
    }

    const flashInterval = setInterval(() => {
      setFlashOn((prev) => !prev);
    }, 450);

    return () => {
      clearInterval(flashInterval);
      Vibration.cancel();
    };
  }, [activeAlert, settings.haptic_enabled]);

  const stopMonitoring = useCallback(async () => {
    setIsMonitoring(false);
    isMonitoringRef.current = false;
    dbWindowRef.current = [];
    clipStartTsRef.current = 0;
    setSmoothedDb(0);
    Vibration.cancel();
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
      Vibration.cancel();
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
          "Izinkan akses mikrofon agar Isyarat Kita dapat memantau suara darurat."
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      dbWindowRef.current = [];
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      clipStartTsRef.current = Date.now();
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
    const next = Math.max(45, Math.min(95, threshold + delta));
    saveSettings({ alert_threshold_db: next });
  };

  const screenBgClass = activeAlert
    ? activeAlert.severity === "high"
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
            Anti-false alarm 3 lapis • Klakson, Sirine, Alarm, Teriakan & Bel Pintu.
          </Text>
        </View>

        {/* Banner Peringatan Kontras Tinggi */}
        {activeAlert && (
          <View className="mb-5 items-center rounded-3xl border-4 border-white bg-black/80 p-6">
            <ShieldAlert size={52} color="#FFFFFF" />
            <Text className="mt-2 text-center text-3xl font-black tracking-wide text-white">
              {CATEGORY_EMOJI[activeAlert.category]} {activeAlert.labelId}
            </Text>

            <Text className="mt-2.5 text-base font-bold text-amber-300">
              Level: {activeAlert.decibel} dB • Prioritas:{" "}
              {activeAlert.severity === "high"
                ? "TINGGI"
                : activeAlert.severity === "medium"
                ? "SEDANG"
                : "RENDAH"}
            </Text>

            <Pressable
              onPress={dismissAlert}
              className="mt-5 w-full items-center rounded-2xl bg-white py-4 active:bg-slate-200"
            >
              <Text className="text-lg font-extrabold text-slate-950">
                Saya Mengerti (Matikan Getar & Kilatan)
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

          {/* Meteran dB (Smoothed 4-sample Moving Average) */}
          <View className="mt-6 w-full">
            <View className="mb-2 flex-row items-end justify-between">
              <View>
                <Text className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  Level Suara (Smoothed)
                </Text>
                <Text className="text-xs font-semibold text-slate-400">
                  {isAnalyzingPattern
                    ? "Menganalisis pola suara (<0.5d)..."
                    : "Mode cepat tanggap aktif (klakson 1x)"}
                </Text>
              </View>
              <Text
                className={`text-4xl font-black ${
                  smoothedDb >= threshold
                    ? "text-rose-600"
                    : smoothedDb >= threshold - 15
                    ? "text-amber-500"
                    : "text-teal-600 dark:text-teal-400"
                }`}
              >
                {smoothedDb}{" "}
                <Text className="text-base font-bold text-slate-500 dark:text-slate-400">
                  dB
                </Text>
              </Text>
            </View>

            <View className="h-5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <View
                style={{ width: `${Math.min(100, Math.max(2, smoothedDb))}%` }}
                className={`h-full rounded-full ${
                  smoothedDb >= threshold
                    ? "bg-rose-600"
                    : smoothedDb >= threshold - 15
                    ? "bg-amber-500"
                    : "bg-teal-600"
                }`}
              />
            </View>

            {isAnalyzingPattern && (
              <View className="mt-2.5 flex-row items-center justify-center">
                <ActivityIndicator color="#0D9488" size="small" />
                <Text className="ml-2 text-xs font-bold text-teal-700 dark:text-teal-400">
                  Mengidentifikasi jenis suara di server AI...
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 3 Mode Sensitivitas Cepat: Tenang / Normal / Ramai */}
        <View className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Radio size={18} color={isDark ? "#2DD4BF" : "#0D9488"} />
              <Text className="ml-2 text-base font-bold text-slate-900 dark:text-white">
                Mode Lingkungan & Sensitivitas
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Vibration.vibrate([0, 350, 150, 350], false);
              }}
              className="rounded-xl bg-teal-50 px-3 py-1.5 active:bg-teal-100 dark:bg-teal-950"
            >
              <Text className="text-xs font-bold text-teal-700 dark:text-teal-300">
                Tes Getar
              </Text>
            </Pressable>
          </View>

          <View className="mb-4 flex-row gap-2">
            {SENSITIVITY_MODES.map((m) => {
              const active = threshold === m.thresholdDb;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => saveSettings({ alert_threshold_db: m.thresholdDb })}
                  className={`flex-1 items-center rounded-2xl border py-3 ${
                    active
                      ? "border-teal-600 bg-teal-600"
                      : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-extrabold ${
                      active ? "text-white" : "text-slate-800 dark:text-white"
                    }`}
                  >
                    {m.label}
                  </Text>
                  <Text
                    className={`mt-0.5 text-[11px] font-semibold ${
                      active
                        ? "text-teal-100"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {m.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row items-center justify-between gap-3">
            <Pressable
              onPress={() => adjustThreshold(-3)}
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
            >
              <Minus size={20} color={isDark ? "#F8FAFC" : "#0F172A"} />
            </Pressable>

            <View className="flex-1 items-center rounded-2xl bg-slate-100 py-2.5 dark:bg-slate-800">
              <Text className="text-lg font-extrabold text-teal-700 dark:text-teal-400">
                Ambang: {threshold} dB
              </Text>
            </View>

            <Pressable
              onPress={() => adjustThreshold(3)}
              className="h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 active:bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
            >
              <Plus size={20} color={isDark ? "#F8FAFC" : "#0F172A"} />
            </Pressable>
          </View>
        </View>

        {/* Log Peringatan Suara */}
        <View className="mb-3 flex-row items-center">
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
