import { createAudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";

import { useApp } from "@/context/AppContext";
import { api, TTS_VOICE_CHOICES, TTSVoiceOption } from "@/services/api";

export type SpeakerRole = "user" | "partner";

export interface SpeakOptions {
  speakerRole?: SpeakerRole;
  voiceOverride?: TTSVoiceOption;
}

// Cache voice Bahasa Indonesia di level modul agar cukup dicek sekali
let cachedIndonesianVoice: Speech.Voice | null | undefined = undefined;
let voiceLookupPromise: Promise<Speech.Voice | null> | null = null;

async function resolveIndonesianDeviceVoice(): Promise<Speech.Voice | null> {
  if (cachedIndonesianVoice !== undefined) {
    return cachedIndonesianVoice;
  }
  if (!voiceLookupPromise) {
    voiceLookupPromise = (async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const isIndonesian = (v: Speech.Voice) => {
          const lang = (v.language || "").toLowerCase().replace("_", "-");
          return lang === "id" || lang.startsWith("id-") || lang === "in" || lang.startsWith("in-");
        };
        const matches = voices.filter(isIndonesian);
        // Prioritaskan id-ID / in-ID dengan kualitas tinggi jika tersedia
        const best =
          matches.find((v) => (v.quality || "").toLowerCase() === "enhanced") ||
          matches.find((v) => v.language.toLowerCase().replace("_", "-") === "id-id") ||
          matches[0] ||
          null;
        cachedIndonesianVoice = best;
        return best;
      } catch {
        cachedIndonesianVoice = null;
        return null;
      }
    })();
  }
  return voiceLookupPromise;
}

// Pre-warm cache saat modul dimuat
resolveIndonesianDeviceVoice().catch(() => {});

export function useTTS() {
  const { serverUrl, settings } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const tempFileRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const activeVoice: TTSVoiceOption = settings.tts_voice || "id-ID-ArdiNeural";
  const speechRate: number = settings.tts_speech_rate || 1.0;

  const activeVoiceInfo =
    TTS_VOICE_CHOICES.find((c) => c.key === activeVoice) || TTS_VOICE_CHOICES[1];

  const cleanupTempAudio = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.remove();
      } catch {
        // Abaikan jika player sudah di-release
      }
      playerRef.current = null;
    }
    if (tempFileRef.current) {
      const fileToDelete = tempFileRef.current;
      tempFileRef.current = null;
      FileSystem.deleteAsync(fileToDelete, { idempotent: true }).catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    Speech.stop();
    cleanupTempAudio();
    setIsLoading(false);
    setIsSpeaking(false);
  }, [cleanupTempAudio]);

  useEffect(() => {
    return () => {
      Speech.stop();
      cleanupTempAudio();
    };
  }, [cleanupTempAudio]);

  const speakWithDeviceOffline = useCallback(
    async (cleanText: string, reqId: number) => {
      const indoVoice = await resolveIndonesianDeviceVoice();
      if (requestIdRef.current !== reqId) return;

      setIsLoading(false);
      setIsSpeaking(true);

      Speech.speak(cleanText, {
        language: "id-ID",
        voice: indoVoice?.identifier,
        rate: speechRate,
        onDone: () => {
          if (requestIdRef.current === reqId) setIsSpeaking(false);
        },
        onStopped: () => {
          if (requestIdRef.current === reqId) setIsSpeaking(false);
        },
        onError: () => {
          if (requestIdRef.current === reqId) setIsSpeaking(false);
        },
      });
    },
    [speechRate]
  );

  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      const clean = text.trim();
      if (!clean) return;

      const speakerRole = options.speakerRole ?? "user";
      const chosenVoice = options.voiceOverride ?? activeVoice;

      // Hentikan audio sebelumnya
      stop();
      const reqId = ++requestIdRef.current;

      if (chosenVoice === "device") {
        await speakWithDeviceOffline(clean, reqId);
        return;
      }

      setIsLoading(true);
      try {
        const backendSpeaker = speakerRole === "user" ? "deaf" : "hearing";
        const res = await api.synthesizeSpeechBase64(
          serverUrl,
          clean,
          chosenVoice,
          backendSpeaker,
          speechRate
        );

        if (requestIdRef.current !== reqId) return;

        // Tulis MP3 ke cache lokal HP agar 100% stabil di Android ExoPlayer & iOS AVPlayer
        const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        let audioUri = `data:${res.mime_type};base64,${res.audio_base64}`;
        if (cacheDir) {
          const tmpPath = `${cacheDir}isyarat_tts_${reqId}.mp3`;
          await FileSystem.writeAsStringAsync(tmpPath, res.audio_base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          tempFileRef.current = tmpPath;
          audioUri = tmpPath;
        }

        if (requestIdRef.current !== reqId) {
          cleanupTempAudio();
          return;
        }

        const player = createAudioPlayer({ uri: audioUri });
        playerRef.current = player;

        player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish && requestIdRef.current === reqId) {
            setIsSpeaking(false);
            cleanupTempAudio();
          }
        });

        setIsLoading(false);
        setIsSpeaking(true);
        player.play();
      } catch (err) {
        if (requestIdRef.current !== reqId) return;
        console.warn("[useTTS] Backend TTS gagal, fallback ke suara HP (id-ID):", err);
        await speakWithDeviceOffline(clean, reqId);
      }
    },
    [
      activeVoice,
      serverUrl,
      speechRate,
      stop,
      cleanupTempAudio,
      speakWithDeviceOffline,
    ]
  );

  return {
    speak,
    stop,
    isLoading,
    isSpeaking,
    activeVoice,
    activeVoiceLabel: activeVoiceInfo.shortLabel,
    activeVoiceTitle: activeVoiceInfo.title,
  };
}
