import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  BookmarkPlus,
  Bot,
  Camera,
  CornerDownLeft,
  Delete,
  Maximize2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Send,
  Space,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useTTS } from "@/hooks/useTTS";
import {
  api,
  getApiBaseUrl,
  TTS_VOICE_CHOICES,
  TTSVoiceOption,
} from "@/services/api";

const STABILITY_THRESHOLD = 3;
const MIN_CONFIDENCE = 0.7;
const AUTO_SPACE_EMPTY_CYCLES = 5;
const SNAPSHOT_INTERVAL_MS = 350;

type CameraFacing = "front" | "back";

type ChatRole = "deaf" | "hearing";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  source: "ketik" | "suara";
  timestamp: string;
}

export default function TranslatorScreen() {
  const {
    serverUrl,
    settings,
    isLoggedIn,
    requireAuth,
    saveTranslationLog,
    addLocalGuestLog,
    saveSettings,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"sign" | "chat">("sign");

  // ==========================================
  // SHARED AUDIO / TTS & FULLSCREEN STATE (Terpusat via useTTS)
  // ==========================================
  const [isMuted, setIsMuted] = useState(false);
  const voiceOption: TTSVoiceOption = settings.tts_voice || "id-ID-ArdiNeural";
  const [fullscreenText, setFullscreenText] = useState<string | null>(null);

  const {
    speak: ttsSpeak,
    stop: stopAllSpeech,
    isSpeaking,
  } = useTTS();

  const [isFocused, setIsFocused] = useState(true);
  const [appState, setAppState] = useState<AppStateStatus>(
    (AppState.currentState as AppStateStatus) || "active"
  );

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
        stopAllSpeech();
      };
    }, [stopAllSpeech])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    return () => sub.remove();
  }, []);

  const speakText = useCallback(
    (
      text: string,
      forceSpeak = false,
      speaker: "deaf" | "hearing" = "deaf"
    ) => {
      const clean = text.trim();
      if (!clean || (isMuted && !forceSpeak)) return;
      ttsSpeak(clean, {
        speakerRole: speaker === "deaf" ? "user" : "partner",
      });
    },
    [isMuted, ttsSpeak]
  );

  // ==========================================
  // MODE 1: ISYARAT -> SUARA & TEKS (Native react-native-vision-camera)
  // ==========================================
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<CameraFacing>("front");
  const device = useCameraDevice(facing);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 640, height: 480 } },
    { fps: 30 },
  ]);

  const [isDetecting, setIsDetecting] = useState(true);
  const [handFound, setHandFound] = useState(false);
  const [lowConfidenceHint, setLowConfidenceHint] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [visionMode, setVisionMode] = useState<"mock" | "model" | null>(null);

  const [candidateLetter, setCandidateLetter] = useState<string | null>(null);
  const [candidateConfidence, setCandidateConfidence] = useState<number>(0);
  const [stabilityCount, setStabilityCount] = useState<number>(0);

  const [currentLetters, setCurrentLetters] = useState<string[]>([]);
  const [glossWords, setGlossWords] = useState<string[]>([]);
  const [naturalSentence, setNaturalSentence] = useState<string>("");
  const [chatAiEnabled, setChatAiEnabled] = useState<boolean>(true);
  const [aiReply, setAiReply] = useState<string>("");
  const [signError, setSignError] = useState<string | null>(null);

  const cameraRef = useRef<VisionCamera | null>(null);
  const isProcessingRef = useRef(false);
  const stableCandidateRef = useRef<{ letter: string | null; count: number; lastLocked: string | null }>({
    letter: null,
    count: 0,
    lastLocked: null,
  });
  const emptyHandCyclesRef = useRef(0);
  const currentLettersRef = useRef<string[]>([]);
  const glossWordsRef = useRef<string[]>([]);

  const isCameraActive =
    activeTab === "sign" &&
    isFocused &&
    isDetecting &&
    appState === "active";

  useEffect(() => {
    currentLettersRef.current = currentLetters;
  }, [currentLetters]);

  useEffect(() => {
    glossWordsRef.current = glossWords;
  }, [glossWords]);

  const commitCurrentWord = useCallback(async () => {
    const letters = currentLettersRef.current;
    if (letters.length === 0) return;

    const prevWord =
      glossWordsRef.current.length > 0
        ? glossWordsRef.current[glossWordsRef.current.length - 1]
        : null;

    setCurrentLetters([]);
    currentLettersRef.current = [];
    stableCandidateRef.current.lastLocked = null;

    try {
      const activeBaseUrl = await getApiBaseUrl();
      const res = await api.correctWord(activeBaseUrl, letters, prevWord);
      const word = res.corrected_word || letters.join("");
      if (word) {
        setGlossWords((prev) => [...prev, word]);
      }
    } catch {
      const fallbackWord = letters.join("");
      if (fallbackWord) {
        setGlossWords((prev) => [...prev, fallbackWord]);
      }
    }
  }, []);

  const captureSnapshotAndPredict = useCallback(async () => {
    if (!cameraRef.current || isProcessingRef.current || !device) return;
    isProcessingRef.current = true;
    let tempFileUri: string | null = null;

    try {
      // Ambil snapshot langsung dari GPU preview stream (tanpa shutter lag)
      const snapshot = await cameraRef.current.takeSnapshot({ quality: 70 });
      if (!snapshot?.path) return;

      const snapshotUri = snapshot.path.startsWith("file://")
        ? snapshot.path
        : `file://${snapshot.path}`;
      tempFileUri = snapshotUri;

      const base64 = await FileSystem.readAsStringAsync(snapshotUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64) return;

      // Ambil URL backend dinamis (Manual Override / Cache / Render Router) + mirror kamera depan
      const activeBaseUrl = await getApiBaseUrl();
      const res = await api.predictSignBase64(
        activeBaseUrl,
        base64,
        null,
        facing === "front"
      );

      if (res.mode === "mock" || res.mode === "model") {
        setVisionMode(res.mode);
      }

      // Tolak mentah-mentah jika server sedang berjalan di mode mock (model AI belum dimuat)
      if (res.mode === "mock") {
        setHandFound(false);
        setLowConfidenceHint(false);
        setCandidateLetter(null);
        setCandidateConfidence(0);
        setStabilityCount(0);
        stableCandidateRef.current = { letter: null, count: 0, lastLocked: null };
        setSignError(
          "Model AI BISINDO di server belum aktif (mode: mock). Periksa file model & log server backend."
        );
        return;
      }

      setSignError(null);

      const handsCount = Number(res.hands_detected ?? (res.hand_found ? 1 : 0));
      setHandFound(handsCount > 0);

      if (handsCount === 0 || !res.hand_found) {
        setLowConfidenceHint(false);
        setCandidateLetter(null);
        setCandidateConfidence(0);
        setStabilityCount(0);
        stableCandidateRef.current.letter = null;
        stableCandidateRef.current.count = 0;
        stableCandidateRef.current.lastLocked = null;

        emptyHandCyclesRef.current += 1;
        if (
          emptyHandCyclesRef.current >= AUTO_SPACE_EMPTY_CYCLES &&
          currentLettersRef.current.length > 0
        ) {
          emptyHandCyclesRef.current = 0;
          await commitCurrentWord();
        }
        return;
      }

      emptyHandCyclesRef.current = 0;
      const confidence = Number(res.confidence || 0);

      if (!res.detected || !res.letter || confidence < MIN_CONFIDENCE) {
        setLowConfidenceHint(true);
        setCandidateLetter(null);
        setCandidateConfidence(confidence);
        setStabilityCount(0);
        stableCandidateRef.current.letter = null;
        stableCandidateRef.current.count = 0;
        return;
      }

      setLowConfidenceHint(false);
      const letter = String(res.letter).toUpperCase();
      setCandidateLetter(letter);
      setCandidateConfidence(confidence);

      // Wajib stabil STABILITY_THRESHOLD frame berturut-turut (tanpa instant-lock 1 frame)
      if (stableCandidateRef.current.letter === letter) {
        const nextCount = stableCandidateRef.current.count + 1;
        stableCandidateRef.current.count = nextCount;
        setStabilityCount(Math.min(nextCount, STABILITY_THRESHOLD));

        if (
          nextCount >= STABILITY_THRESHOLD &&
          stableCandidateRef.current.lastLocked !== letter
        ) {
          stableCandidateRef.current.lastLocked = letter;
          stableCandidateRef.current.count = 0;
          setStabilityCount(STABILITY_THRESHOLD);
          setCurrentLetters((prev) => [...prev, letter]);
          if (settings.haptic_enabled) {
            Haptics.selectionAsync().catch(() => {});
          }
        }
      } else {
        stableCandidateRef.current.letter = letter;
        stableCandidateRef.current.count = 1;
        stableCandidateRef.current.lastLocked = null;
        setStabilityCount(1);
      }
    } catch (err: any) {
      setHandFound(false);
      setSignError(
        err?.message || "Gagal menghubungi server AI. Cek URL di Pengaturan."
      );
    } finally {
      if (tempFileUri) {
        FileSystem.deleteAsync(tempFileUri, { idempotent: true }).catch(() => {});
      }
      isProcessingRef.current = false;
    }
  }, [serverUrl, device, facing, commitCurrentWord, settings.haptic_enabled]);

  const captureFnRef = useRef(captureSnapshotAndPredict);
  useEffect(() => {
    captureFnRef.current = captureSnapshotAndPredict;
  }, [captureSnapshotAndPredict]);

  // Loop sekuensial setiap 350 ms saat kamera aktif (tunggu request selesai agar tidak menumpuk)
  useEffect(() => {
    if (!isCameraActive || !hasPermission || !device) {
      setHandFound(false);
      setCandidateLetter(null);
      setStabilityCount(0);
      return;
    }
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const runLoop = async () => {
      if (cancelled) return;
      await captureFnRef.current();
      if (!cancelled) {
        timerId = setTimeout(runLoop, SNAPSHOT_INTERVAL_MS);
      }
    };

    timerId = setTimeout(runLoop, 300);
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [isCameraActive, hasPermission, device]);

  const handleBackspace = () => {
    if (currentLetters.length > 0) {
      setCurrentLetters((prev) => prev.slice(0, -1));
    } else if (glossWords.length > 0) {
      setGlossWords((prev) => prev.slice(0, -1));
    }
  };

  const handleRefineAndSpeak = async () => {
    let wordsToRefine = [...glossWords];
    if (currentLetters.length > 0) {
      const prevWord =
        wordsToRefine.length > 0 ? wordsToRefine[wordsToRefine.length - 1] : null;
      try {
        const corrected = await api.correctWord(serverUrl, currentLetters, prevWord);
        if (corrected.corrected_word) {
          wordsToRefine.push(corrected.corrected_word);
          setGlossWords(wordsToRefine);
        }
      } catch {
        const raw = currentLetters.join("");
        if (raw) {
          wordsToRefine.push(raw);
          setGlossWords(wordsToRefine);
        }
      }
      setCurrentLetters([]);
    }

    if (wordsToRefine.length === 0) return;

    setIsRefining(true);
    setSignError(null);
    setAiReply("");
    try {
      const activeBaseUrl = await getApiBaseUrl();
      const res = await api.refineText(activeBaseUrl, wordsToRefine, chatAiEnabled);
      const sentence = res.sentence || res.refined_text || "";
      setNaturalSentence(sentence);
      if (chatAiEnabled && res.ai_reply) {
        setAiReply(res.ai_reply);
        if (!isMuted) {
          speakText(res.ai_reply, false, "hearing");
        }
      } else if (!isMuted && sentence) {
        speakText(sentence, false, "deaf");
      }
    } catch {
      const joined = wordsToRefine.join(" ").toLowerCase();
      const fallback = joined
        ? joined[0].toUpperCase() + joined.slice(1) + "."
        : "";
      setNaturalSentence(fallback);
      if (!isMuted && fallback) {
        speakText(fallback, false, "deaf");
      }
    } finally {
      setIsRefining(false);
    }
  };

  const handleResetSign = () => {
    stopAllSpeech();
    setCurrentLetters([]);
    setGlossWords([]);
    setNaturalSentence("");
    setAiReply("");
    setCandidateLetter(null);
    setCandidateConfidence(0);
    setStabilityCount(0);
    setSignError(null);
    stableCandidateRef.current = { letter: null, count: 0, lastLocked: null };
  };

  const handleSaveSignLog = () => {
    const finalText =
      naturalSentence.trim() ||
      [...glossWords, currentLetters.join("")].filter(Boolean).join(" ").trim();
    if (!finalText) {
      Alert.alert("Belum Ada Teks", "Terjemahkan isyarat terlebih dahulu.");
      return;
    }

    const payload = {
      mode: "sign_to_text" as const,
      raw_gloss: glossWords.join(" ") || currentLetters.join(""),
      final_text: finalText,
      confidence: candidateConfidence || undefined,
    };

    if (!isLoggedIn) {
      addLocalGuestLog(payload);
    }

    requireAuth(
      "Masuk untuk menyimpan hasil terjemahan BISINDO ke riwayat akun Anda.",
      async () => {
        try {
          await saveTranslationLog(payload);
          Alert.alert("Tersimpan", "Riwayat terjemahan berhasil disimpan.");
        } catch (err: any) {
          Alert.alert("Gagal Menyimpan", err?.message || "Coba lagi nanti.");
        }
      }
    );
  };

  // ==========================================
  // MODE 2: SUARA <-> TEKS (CHAT 1 PERANGKAT)
  // ==========================================
  const chatRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [chatRole, setChatRole] = useState<ChatRole>("deaf");
  const [autoSpeakDeaf, setAutoSpeakDeaf] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isRecordingChat, setIsRecordingChat] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const chatScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);

  useEffect(() => {
    if (!isRecordingChat) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecordingChat]);

  // Auto-scroll daftar chat ke pesan terbawah saat keyboard muncul
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      if (activeTab === "chat") {
        setTimeout(() => {
          chatScrollRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
    });
    return () => showSub.remove();
  }, [activeTab]);

  const appendChatMessage = useCallback(
    (role: ChatRole, text: string, source: "ketik" | "suara") => {
      const clean = text.trim();
      if (!clean) return;
      const msg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role,
        text: clean,
        source,
        timestamp: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setChatMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);

      if (role === "deaf" && autoSpeakDeaf) {
        speakText(clean, true, "deaf");
      }
    },
    [autoSpeakDeaf, speakText]
  );

  const handleSendChatText = () => {
    if (!chatInput.trim()) return;
    appendChatMessage(chatRole, chatInput, "ketik");
    setChatInput("");
  };

  const toggleChatRecording = async (targetRole?: ChatRole) => {
    if (isRecordingChat) {
      // Hentikan rekaman, kembalikan audio mode speaker normal, lalu kirim via FileSystem.uploadAsync ke POST /api/stt
      setIsRecordingChat(false);
      setIsTranscribing(true);
      try {
        await chatRecorder.stop();
        const uri = chatRecorder.uri;
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });

        if (!uri) {
          throw new Error("File rekaman audio tidak ditemukan.");
        }

        const activeBaseUrl = await getApiBaseUrl();
        const stt = await api.transcribeAudio(activeBaseUrl, uri, "chat_voice.m4a");
        if (stt.text && stt.text.trim()) {
          const assignedRole = targetRole ?? chatRole;
          appendChatMessage(assignedRole, stt.text, "suara");
        } else {
          const warnMsg =
            stt.warning ||
            "Suara tidak terdengar jelas, coba ulangi lebih dekat ke mikrofon.";
          Alert.alert("Suara Tidak Terdengar", warnMsg);
        }
      } catch (err: any) {
        const errMsg =
          err?.message ||
          "Pastikan server backend aktif & mikrofon terdengar jelas.";
        Alert.alert("Transkripsi Suara Gagal", errMsg);
      } finally {
        setIsTranscribing(false);
      }
      return;
    }

    // Mulai rekaman suara: hentikan TTS aktif & pastikan tidak ada rekaman menggantung
    stopAllSpeech();
    if (targetRole) {
      setChatRole(targetRole);
    }
    try {
      if (chatRecorder.isRecording) {
        await chatRecorder.stop().catch(() => {});
      }
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Izin Mikrofon Diperlukan",
          "Izinkan akses mikrofon untuk merekam suara lawan bicara."
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await chatRecorder.prepareToRecordAsync();
      chatRecorder.record();
      setIsRecordingChat(true);
      if (settings.haptic_enabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    } catch (err: any) {
      const errMsg =
        err?.message || "Mikrofon sedang digunakan oleh aplikasi lain.";
      Alert.alert("Gagal Memulai Rekam", errMsg);
    }
  };

  const handleSaveChatSession = () => {
    if (chatMessages.length === 0) {
      Alert.alert("Chat Kosong", "Belum ada percakapan untuk disimpan.");
      return;
    }

    const transcript = chatMessages
      .map(
        (m) =>
          `[${m.role === "deaf" ? "Saya" : "Lawan Bicara"}] ${m.text}`
      )
      .join("\n");

    const payload = {
      mode: "speech_to_text" as const,
      final_text: transcript,
    };

    if (!isLoggedIn) {
      addLocalGuestLog(payload);
    }

    requireAuth(
      "Masuk untuk menyimpan sesi percakapan Chat ke riwayat akun Anda.",
      async () => {
        try {
          await saveTranslationLog(payload);
          Alert.alert("Tersimpan", "Sesi percakapan berhasil disimpan ke riwayat.");
        } catch (err: any) {
          Alert.alert("Gagal Menyimpan", err?.message || "Coba lagi nanti.");
        }
      }
    );
  };

  const stabilityDots = Array.from({ length: STABILITY_THRESHOLD }, (_, i) =>
    i < stabilityCount ? "●" : "○"
  ).join("");

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={["top"]}>
      {/* Segmented Tab Switcher */}
      <View className="border-b border-slate-200 bg-white px-4 pb-3 pt-3 dark:border-slate-800 dark:bg-slate-900">
        <Text className="mb-2.5 text-xl font-extrabold text-slate-900 dark:text-white">
          Translator Dua Arah
        </Text>
        <View className="flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          <Pressable
            onPress={() => setActiveTab("sign")}
            className={`flex-1 items-center rounded-xl py-2.5 ${
              activeTab === "sign" ? "bg-teal-600" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                activeTab === "sign"
                  ? "text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              Isyarat → Suara & Teks
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("chat")}
            className={`flex-1 items-center rounded-xl py-2.5 ${
              activeTab === "chat" ? "bg-teal-600" : "bg-transparent"
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                activeTab === "chat"
                  ? "text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              Suara ↔ Teks (Chat)
            </Text>
          </Pressable>
        </View>
      </View>

      {activeTab === "sign" ? (
        /* ======================================================
           MODE 1: ISYARAT -> SUARA & TEKS
           ====================================================== */
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          {/* Viewfinder Kamera Full-Frame (Border container sebagai indikator deteksi tangan) */}
          <View
            className="overflow-hidden rounded-3xl bg-slate-900"
            style={{
              borderColor:
                isDetecting && handFound
                  ? "#22C55E"
                  : "rgba(255,255,255,0.2)",
              borderWidth: isDetecting && handFound ? 3 : 2,
            }}
          >
            {!hasPermission ? (
              <View className="h-72 items-center justify-center px-6">
                <Camera size={40} color="#94A3B8" />
                <Text className="mt-3 text-center text-base font-bold text-white">
                  Izin Kamera Diperlukan
                </Text>
                <Text className="mt-1 text-center text-sm text-slate-300">
                  Isyarat Kita membutuhkan akses kamera untuk menerjemahkan bahasa isyarat BISINDO secara real-time.
                </Text>
                <Pressable
                  onPress={requestPermission}
                  className="mt-4 rounded-2xl bg-teal-600 px-6 py-3 active:bg-teal-700"
                >
                  <Text className="text-sm font-bold text-white">
                    Izinkan Akses Kamera
                  </Text>
                </Pressable>
              </View>
            ) : !device ? (
              <View className="h-72 items-center justify-center px-6">
                <ActivityIndicator color="#0D9488" size="large" />
                <Text className="mt-3 text-center text-sm text-slate-300">
                  Menyiapkan perangkat kamera...
                </Text>
              </View>
            ) : (
              <View className="relative h-[320px] w-full bg-black">
                <VisionCamera
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  device={device}
                  format={format}
                  isActive={isCameraActive}
                  photo={true}
                  audio={false}
                />

                {/* Top Overlay Status & Flip */}
                <View className="absolute left-3 right-3 top-3 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View
                      className={`flex-row items-center rounded-full px-3 py-1.5 ${
                        isDetecting ? "bg-emerald-600/90" : "bg-amber-500/90"
                      }`}
                    >
                      <Text className="text-xs font-extrabold text-white">
                        {isDetecting ? "AKTIF" : "DIJEDA"}
                      </Text>
                    </View>
                    {isDetecting && (
                      <View
                        className={`rounded-full px-3 py-1.5 ${
                          handFound ? "bg-emerald-500/90" : "bg-black/60"
                        }`}
                      >
                        <Text className="text-xs font-bold text-white">
                          {handFound ? "Tangan Terdeteksi" : "Mencari Tangan..."}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Pressable
                    onPress={() =>
                      setFacing((prev) => (prev === "front" ? "back" : "front"))
                    }
                    className="h-10 w-10 items-center justify-center rounded-full bg-black/60 active:bg-black/80"
                    accessibilityLabel="Flip Kamera"
                  >
                    <RefreshCw size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                {/* Indikator Progres Stabilitas Huruf (ketuk untuk kunci manual) */}
                <Pressable
                  onPress={() => {
                    if (candidateLetter) {
                      setCurrentLetters((prev) => [...prev, candidateLetter]);
                      if (settings.haptic_enabled) {
                        Haptics.selectionAsync().catch(() => {});
                      }
                    }
                  }}
                  className="absolute bottom-3 left-3 right-3 flex-row items-center justify-between rounded-2xl bg-black/70 px-3.5 py-2"
                >
                  <Text className="flex-1 text-sm font-bold text-white">
                    {candidateLetter
                      ? `Mendeteksi: ${candidateLetter}  [${stabilityDots}]  ${Math.round(
                          candidateConfidence * 100
                        )}%`
                      : lowConfidenceHint && isDetecting
                      ? `Posisikan tangan lebih jelas... (${Math.round(
                          candidateConfidence * 100
                        )}%)`
                      : isDetecting
                      ? "Arahkan tangan ke dalam bingkai..."
                      : "Tekan Lanjut Deteksi untuk mulai"}
                  </Text>
                  {visionMode && (
                    <Text className="ml-2 text-[11px] font-bold uppercase text-teal-300">
                      {visionMode}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {signError && (
            <View className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5">
              <Text className="text-xs font-semibold text-rose-700">
                {signError}
              </Text>
            </View>
          )}

          {/* Panel Hasil Ejaan, Kumpulan Kata & Kalimat Natural */}
          <View className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {/* Ejaan Huruf */}
            <View className="mb-2.5 flex-row items-center justify-between">
              <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ejaan Huruf
              </Text>
              <Text className="text-base font-extrabold tracking-widest text-teal-700 dark:text-teal-400">
                {currentLetters.length > 0 ? currentLetters.join("-") : "—"}
              </Text>
            </View>

            {/* Kumpulan Kata (Gloss) */}
            <View className="mb-3">
              <Text className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Kumpulan Kata
              </Text>
              {glossWords.length === 0 ? (
                <Text className="text-sm text-slate-400">
                  Belum ada kata terkunci (jeda tangan ~2d atau tekan Spasi).
                </Text>
              ) : (
                <View className="flex-row flex-wrap gap-1.5">
                  {glossWords.map((w, idx) => (
                    <View
                      key={`${w}-${idx}`}
                      className="rounded-xl bg-teal-50 px-3 py-1 dark:bg-teal-950"
                    >
                      <Text className="text-sm font-bold text-teal-800 dark:text-teal-300">
                        {w}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Kalimat Natural Hasil Akhir */}
            <View className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Kalimat Natural
                </Text>
                {naturalSentence ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() =>
                        isSpeaking
                          ? stopAllSpeech()
                          : speakText(naturalSentence, true)
                      }
                      className="flex-row items-center rounded-lg bg-teal-600 px-2.5 py-1.5 active:bg-teal-700"
                    >
                      {isSpeaking ? (
                        <Pause size={13} color="#FFFFFF" />
                      ) : (
                        <Play size={13} color="#FFFFFF" />
                      )}
                      <Text className="ml-1 text-xs font-bold text-white">
                        {isSpeaking ? "Pause" : "Putar"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setFullscreenText(naturalSentence)}
                      className="flex-row items-center rounded-lg bg-slate-200 px-2.5 py-1.5 active:bg-slate-300 dark:bg-slate-700"
                    >
                      <Maximize2 size={13} color="#0F172A" />
                      <Text className="ml-1 text-xs font-bold text-slate-900 dark:text-white">
                        Layar Penuh
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <Text className="text-m font-extrabold text-slate-950 dark:text-white">
                {naturalSentence ||
                  "Tekan 'Rangkai & Ucapkan' untuk membuat kalimat natural."}
              </Text>
            </View>

            {/* Bubble Balasan Chat AI (Tampil jika Toggle Chat AI aktif) */}
            {chatAiEnabled && (aiReply || isRefining) && (
              <View className="mt-2.5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/60">
                <View className="mb-1.5 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Bot size={14} color="#4F46E5" />
                    <Text className="text-xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                      Balasan AI
                    </Text>
                  </View>
                  {aiReply ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() =>
                          isSpeaking
                            ? stopAllSpeech()
                            : speakText(aiReply, true, "hearing")
                        }
                        className="flex-row items-center rounded-lg bg-indigo-600 px-2.5 py-1.5 active:bg-indigo-700"
                      >
                        {isSpeaking ? (
                          <Pause size={13} color="#FFFFFF" />
                        ) : (
                          <Play size={13} color="#FFFFFF" />
                        )}
                        <Text className="ml-1 text-xs font-bold text-white">
                          {isSpeaking ? "Pause" : "Putar Suara"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setFullscreenText(aiReply)}
                        className="flex-row items-center rounded-lg bg-indigo-100 px-2.5 py-1.5 active:bg-indigo-200 dark:bg-indigo-900"
                      >
                        <Maximize2 size={13} color="#3730A3" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                {isRefining && !aiReply ? (
                  <View className="flex-row items-center gap-2 py-1">
                    <ActivityIndicator size="small" color="#4F46E5" />
                    <Text className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                      AI sedang membalas...
                    </Text>
                  </View>
                ) : (
                  <Text className="text-sm font-bold leading-5 text-indigo-950 dark:text-indigo-100">
                    {aiReply}
                  </Text>
                )}
              </View>
            )}

            {/* Toggle Chat AI (ON/OFF) */}
            <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800">
              <View className="flex-1 flex-row items-center gap-2 pr-2">
                <Bot
                  size={17}
                  color={chatAiEnabled ? "#4F46E5" : "#64748B"}
                />
                <View className="flex-1">
                  <Text className="text-xs font-extrabold text-slate-900 dark:text-white">
                    Chat AI (Obrolan Dua Arah)
                  </Text>
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400">
                    {chatAiEnabled
                      ? "AI otomatis membalas kalimat BISINDO Anda"
                      : "Hanya terjemahan kalimat (lebih cepat & hemat)"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setChatAiEnabled((prev) => {
                    const next = !prev;
                    if (!next) setAiReply("");
                    return next;
                  });
                }}
                className={`rounded-full px-3.5 py-1.5 ${
                  chatAiEnabled
                    ? "bg-indigo-600 active:bg-indigo-700"
                    : "bg-slate-300 active:bg-slate-400 dark:bg-slate-700"
                }`}
                accessibilityRole="switch"
                accessibilityState={{ checked: chatAiEnabled }}
              >
                <Text
                  className={`text-xs font-extrabold ${
                    chatAiEnabled
                      ? "text-white"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {chatAiEnabled ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>

            {/* Baris Kontrol Utama */}
            <View className="mt-3.5 flex-row gap-2">
              <Pressable
                onPress={() => setIsDetecting((prev) => !prev)}
                disabled={!hasPermission || !device}
                className={`flex-1 flex-row items-center justify-center rounded-2xl py-3.5 ${
                  isDetecting
                    ? "bg-amber-500 active:bg-amber-600"
                    : "bg-teal-600 active:bg-teal-700"
                }`}
              >
                {isDetecting ? (
                  <Pause size={17} color="#FFFFFF" />
                ) : (
                  <Play size={17} color="#FFFFFF" />
                )}
                <Text className="ml-1.5 text-sm font-bold text-white">
                  {isDetecting ? "Pause" : "Lanjut Deteksi"}
                </Text>
              </Pressable>

              <Pressable
                onPress={commitCurrentWord}
                disabled={currentLetters.length === 0}
                className="flex-row items-center justify-center rounded-2xl border border-teal-600 bg-white px-3.5 py-3.5 active:bg-teal-50"
              >
                <Space size={17} color="#0D9488" />
                <Text className="ml-1.5 text-sm font-bold text-teal-700">
                  Spasi
                </Text>
              </Pressable>

              <Pressable
                onPress={handleBackspace}
                className="items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-3.5 py-3.5 active:bg-slate-200"
                accessibilityLabel="Hapus huruf atau kata terakhir"
              >
                <Delete size={18} color="#334155" />
              </Pressable>
            </View>

            {/* Rangkai & Ucapkan + Mute */}
            <View className="mt-2.5 flex-row gap-2">
              <Pressable
                onPress={handleRefineAndSpeak}
                disabled={
                  isRefining ||
                  (glossWords.length === 0 && currentLetters.length === 0)
                }
                className="flex-1 flex-row items-center justify-center rounded-2xl bg-slate-900 py-3.5 active:bg-slate-800"
              >
                {isRefining ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Sparkles size={17} color="#FFFFFF" />
                )}
                <Text className="ml-2 text-sm font-bold text-white">
                  Rangkai & Ucapkan
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!isMuted) stopAllSpeech();
                  setIsMuted((prev) => !prev);
                }}
                className={`h-12 w-12 items-center justify-center rounded-2xl border ${
                  isMuted
                    ? "border-rose-200 bg-rose-50"
                    : "border-slate-200 bg-white"
                }`}
                accessibilityLabel="Mute atau Unmute"
              >
                {isMuted ? (
                  <VolumeX size={20} color="#E11D48" />
                ) : (
                  <Volume2 size={20} color="#0D9488" />
                )}
              </Pressable>
            </View>

            {/* Pilihan Karakter Suara (Tersinkronisasi dengan Settings) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-3"
              contentContainerStyle={{ gap: 6 }}
            >
              {TTS_VOICE_CHOICES.map((v) => {
                const active = voiceOption === v.key;
                return (
                  <Pressable
                    key={v.key}
                    onPress={() => saveSettings({ tts_voice: v.key })}
                    className={`items-center rounded-xl border px-3 py-2 ${
                      active
                        ? "border-teal-600 bg-teal-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        active ? "text-teal-700" : "text-slate-600"
                      }`}
                    >
                      {v.shortLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Reset & Simpan Riwayat */}
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={handleSaveSignLog}
                className="flex-1 flex-row items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 py-3 active:bg-teal-100"
              >
                <BookmarkPlus size={16} color="#0D9488" />
                <Text className="ml-1.5 text-sm font-bold text-teal-700">
                  Simpan ke Riwayat
                </Text>
              </Pressable>

              <Pressable
                onPress={handleResetSign}
                className="flex-row items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 active:bg-rose-100"
              >
                <Trash2 size={16} color="#E11D48" />
                <Text className="ml-1.5 text-sm font-bold text-rose-700">
                  Reset
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* ======================================================
           MODE 2: SUARA <-> TEKS (CHAT BERGANTIAN 1 PERANGKAT)
           ====================================================== */
        <KeyboardAvoidingView
          behavior="padding"
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          {/* Header Giliran Pembicara & Aksi Sesi */}
          <View className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <View className="mb-2.5 flex-row items-center justify-between">
              <Pressable
                onPress={() => setAutoSpeakDeaf((prev) => !prev)}
                className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                  autoSpeakDeaf
                    ? "border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950"
                    : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                {autoSpeakDeaf ? (
                  <Volume2 size={14} color="#0D9488" />
                ) : (
                  <VolumeX size={14} color="#64748B" />
                )}
                <Text
                  className={`ml-1.5 text-xs font-bold ${
                    autoSpeakDeaf
                      ? "text-teal-700 dark:text-teal-300"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  Auto-Speak {autoSpeakDeaf ? "ON" : "OFF"}
                </Text>
              </Pressable>

              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleSaveChatSession}
                  className="flex-row items-center rounded-xl bg-teal-50 px-3 py-1.5 active:bg-teal-100 dark:bg-teal-950"
                >
                  <BookmarkPlus size={14} color="#0D9488" />
                  <Text className="ml-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                    Simpan Sesi
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setChatMessages([])}
                  className="rounded-xl bg-rose-50 px-2.5 py-1.5 active:bg-rose-100 dark:bg-rose-950"
                  accessibilityLabel="Bersihkan Chat"
                >
                  <Trash2 size={15} color="#E11D48" />
                </Pressable>
              </View>
            </View>

            {/* Turn-Taking Switcher */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setChatRole("deaf")}
                className={`flex-1 items-center rounded-2xl border py-2.5 ${
                  chatRole === "deaf"
                    ? "border-teal-600 bg-teal-600"
                    : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                <Text
                  className={`text-sm font-extrabold ${
                    chatRole === "deaf"
                      ? "text-white"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  Saya (Teman Tuli)
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setChatRole("hearing")}
                className={`flex-1 items-center rounded-2xl border py-2.5 ${
                  chatRole === "hearing"
                    ? "border-slate-900 bg-slate-900 dark:border-slate-100 dark:bg-slate-100"
                    : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                }`}
              >
                <Text
                  className={`text-sm font-extrabold ${
                    chatRole === "hearing"
                      ? "text-white dark:text-slate-900"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  Lawan Bicara (Dengar)
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Daftar Gelembung Chat (WA / IG Style) */}
          <ScrollView
            ref={chatScrollRef}
            className="flex-1 bg-slate-50 dark:bg-slate-950"
            contentContainerStyle={{ padding: 16, paddingBottom: 24, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {chatMessages.length === 0 ? (
              <View className="flex-1 items-center justify-center px-6 py-12">
                <Text className="text-center text-lg font-extrabold text-slate-800 dark:text-white">
                  Komunikasi Bergantian 1 Perangkat
                </Text>
                <Text className="mt-2 text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  • Ketik pesan sebagai{" "}
                  <Text className="font-bold text-teal-700 dark:text-teal-400">
                    Saya
                  </Text>{" "}
                  agar otomatis dibacakan dengan suara.{"\n"}• Tekan{" "}
                  <Text className="font-bold text-slate-800 dark:text-slate-200">
                    Rekam Suara Lawan Bicara
                  </Text>{" "}
                  untuk mengubah ucapan mereka menjadi teks besar di layar.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {chatMessages.map((msg) => {
                  const isDeaf = msg.role === "deaf";
                  return (
                    <View
                      key={msg.id}
                      className={`max-w-[88%] rounded-3xl p-4 ${
                        isDeaf
                          ? "self-end rounded-br-md bg-teal-600"
                          : "self-start rounded-bl-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <View className="mb-1 flex-row items-center justify-between gap-3">
                        <Text
                          className={`text-xs font-extrabold uppercase ${
                            isDeaf
                              ? "text-teal-100"
                              : "text-teal-700 dark:text-teal-400"
                          }`}
                        >
                          {isDeaf ? "Saya (Teman Tuli)" : "Lawan Bicara"}
                        </Text>
                        <Text
                          className={`text-[11px] font-semibold ${
                            isDeaf ? "text-teal-100/80" : "text-slate-400"
                          }`}
                        >
                          {msg.source === "suara" ? "Suara" : "Ketik"} •{" "}
                          {msg.timestamp}
                        </Text>
                      </View>

                      <Text
                        className={`text-xl font-bold leading-snug ${
                          isDeaf
                            ? "text-white"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {msg.text}
                      </Text>

                      <View className="mt-2.5 flex-row items-center gap-2">
                        <Pressable
                          onPress={() => speakText(msg.text, true, msg.role)}
                          className={`flex-row items-center rounded-xl px-2.5 py-1.5 ${
                            isDeaf
                              ? "bg-white/20 active:bg-white/30"
                              : "bg-slate-100 active:bg-slate-200 dark:bg-slate-800"
                          }`}
                        >
                          <Volume2
                            size={14}
                            color={isDeaf ? "#FFFFFF" : "#0D9488"}
                          />
                          <Text
                            className={`ml-1 text-xs font-bold ${
                              isDeaf
                                ? "text-white"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            Putar Suara
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => setFullscreenText(msg.text)}
                          className={`flex-row items-center rounded-xl px-2.5 py-1.5 ${
                            isDeaf
                              ? "bg-white/20 active:bg-white/30"
                              : "bg-slate-100 active:bg-slate-200 dark:bg-slate-800"
                          }`}
                        >
                          <Maximize2
                            size={14}
                            color={isDeaf ? "#FFFFFF" : "#0D9488"}
                          />
                          <Text
                            className={`ml-1 text-xs font-bold ${
                              isDeaf
                                ? "text-white"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            Perbesar
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Indikator Rekam / Transkripsi */}
          {(isRecordingChat || isTranscribing) && (
            <View
              className={`flex-row items-center justify-between px-4 py-2.5 ${
                isRecordingChat ? "bg-rose-600" : "bg-teal-700"
              }`}
            >
              <View className="flex-row items-center">
                {isTranscribing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View className="h-3 w-3 rounded-full bg-white" />
                )}
                <Text className="ml-2.5 text-sm font-bold text-white">
                  {isTranscribing
                    ? "Mengubah suara menjadi teks (id-ID)..."
                    : `Merekam suara (${recordingSeconds}d)... Ketuk Stop jika selesai`}
                </Text>
              </View>
              {isRecordingChat && (
                <Pressable
                  onPress={() => toggleChatRecording()}
                  className="rounded-xl bg-white px-3 py-1.5"
                >
                  <Text className="text-xs font-extrabold text-rose-600">
                    STOP
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Input Bar Bergaya WA/IG */}
          <View className="border-t border-slate-200 bg-white px-3 pb-3 pt-2.5 dark:border-slate-800 dark:bg-slate-900">
            {/* Tombol Aksi Cepat Rekam Suara Lawan Bicara */}
            <Pressable
              onPress={() => toggleChatRecording("hearing")}
              disabled={isTranscribing}
              className={`mb-2.5 flex-row items-center justify-center rounded-2xl py-3 ${
                isRecordingChat
                  ? "bg-rose-600 active:bg-rose-700"
                  : "bg-slate-900 active:bg-slate-800 dark:bg-teal-700"
              }`}
            >
              {isRecordingChat ? (
                <Square size={18} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Mic size={18} color="#FFFFFF" />
              )}
              <Text className="ml-2 text-sm font-extrabold text-white">
                {isRecordingChat
                  ? `Hentikan & Transkripsi (${recordingSeconds}d)`
                  : "Rekam Suara Lawan Bicara → Teks"}
              </Text>
            </Pressable>

            <View className="flex-row items-end gap-2">
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={
                  chatRole === "deaf"
                    ? "Ketik pesan Anda (otomatis dibacakan)..."
                    : "Ketik balasan Lawan Bicara..."
                }
                placeholderTextColor="#94A3B8"
                multiline
                className="max-h-28 min-h-[48px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />

              <Pressable
                onPress={handleSendChatText}
                disabled={!chatInput.trim()}
                className={`h-12 w-12 items-center justify-center rounded-2xl ${
                  chatInput.trim()
                    ? "bg-teal-600 active:bg-teal-700"
                    : "bg-slate-200"
                }`}
                accessibilityLabel="Kirim Pesan"
              >
                <Send
                  size={20}
                  color={chatInput.trim() ? "#FFFFFF" : "#94A3B8"}
                />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Modal Layar Penuh (Teks Besar Kontras Tinggi) */}
      <Modal
        visible={Boolean(fullscreenText)}
        animationType="fade"
        onRequestClose={() => setFullscreenText(null)}
      >
        <SafeAreaView className="flex-1 justify-between bg-slate-950 p-6">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold uppercase tracking-widest text-teal-400">
              Layar Penuh — Isyarat Kita
            </Text>
            <Pressable
              onPress={() => setFullscreenText(null)}
              className="h-12 w-12 items-center justify-center rounded-full bg-white/15"
            >
              <X size={26} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            <Text className="text-center text-5xl font-black leading-tight text-white">
              {fullscreenText}
            </Text>
          </ScrollView>

          <View className="gap-3">
            <Pressable
              onPress={() => fullscreenText && speakText(fullscreenText, true)}
              className="flex-row items-center justify-center rounded-2xl bg-teal-600 py-4 active:bg-teal-700"
            >
              <Volume2 size={22} color="#FFFFFF" />
              <Text className="ml-2 text-lg font-extrabold text-white">
                Bacakan Suara
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFullscreenText(null)}
              className="items-center rounded-2xl border border-white/30 py-3.5"
            >
              <Text className="text-base font-bold text-white">Tutup</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
