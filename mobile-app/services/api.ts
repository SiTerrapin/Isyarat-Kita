import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";

import {
  cleanBaseUrl,
  getApiBaseUrl,
  hasManualBaseUrl,
  RENDER_ROUTER_URL,
  resetCachedBaseUrl,
  setManualBaseUrl,
} from "./apiConfig";

export {
  getApiBaseUrl,
  hasManualBaseUrl,
  RENDER_ROUTER_URL,
  resetCachedBaseUrl,
  setManualBaseUrl,
};

export type CardCategory =
  | "darurat"
  | "kesehatan"
  | "transportasi"
  | "transaksi"
  | "umum";

export type TranslationMode = "sign_to_text" | "speech_to_text";
export type AlertSeverity = "warning" | "danger";
export type TTSVoiceOption =
  | "ROLEPLAY"
  | "id-ID-ArdiNeural"
  | "id-ID-GadisNeural"
  | "gtts"
  | "device";

export const TTS_VOICE_CHOICES: {
  key: TTSVoiceOption;
  shortLabel: string;
  title: string;
  subtitle: string;
}[] = [
  {
    key: "ROLEPLAY",
    shortLabel: "Duet",
    title: "🎭 Duet Otomatis",
    subtitle: "Saya / Isyarat: Mas Ardi • Lawan Bicara: Mbak Gadis",
  },
  {
    key: "id-ID-ArdiNeural",
    shortLabel: "Mas Ardi",
    title: "👨 Mas Ardi (Natural)",
    subtitle: "Suara laki-laki natural Bahasa Indonesia (Edge TTS)",
  },
  {
    key: "id-ID-GadisNeural",
    shortLabel: "Mbak Gadis",
    title: "👩 Mbak Gadis (Natural)",
    subtitle: "Suara perempuan natural Bahasa Indonesia (Edge TTS)",
  },
  {
    key: "gtts",
    shortLabel: "Google",
    title: "🤖 Google Standar (gTTS)",
    subtitle: "Suara Google Text-to-Speech Bahasa Indonesia",
  },
  {
    key: "device",
    shortLabel: "HP Offline",
    title: "📱 Suara Bawaan HP (Offline)",
    subtitle: "Instan tanpa internet menggunakan Expo Speech",
  },
];

export interface UserProfile {
  id: number;
  full_name: string;
  email: string;
  created_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface HealthResponse {
  status: string;
  database: string;
  ai_mode: "mock" | "model";
  model_loaded: boolean;
}

export interface QuickCard {
  id: number;
  user_id: number | null;
  category: CardCategory;
  title: string;
  message: string;
  is_pinned: boolean;
  is_custom: boolean;
  created_at: string;
}

export interface QuickCardPayload {
  category: CardCategory;
  title: string;
  message: string;
  is_pinned?: boolean;
}

export interface TranslationLog {
  id: number;
  user_id?: number;
  mode: TranslationMode;
  raw_gloss?: string | null;
  final_text: string;
  confidence?: number | null;
  created_at: string;
  is_local?: boolean;
}

export interface TranslationLogPayload {
  mode: TranslationMode;
  raw_gloss?: string | null;
  final_text: string;
  confidence?: number | null;
}

export interface SoundAlert {
  id: number;
  user_id?: number;
  sound_type: string;
  decibel_level: number;
  severity: AlertSeverity;
  created_at: string;
  is_local?: boolean;
}

export interface SoundAlertPayload {
  sound_type: string;
  decibel_level: number;
  severity: AlertSeverity;
}

export interface UserSettings {
  user_id?: number;
  alert_threshold_db: number;
  tts_speech_rate: number;
  tts_voice: TTSVoiceOption;
  auto_detect_sign: boolean;
  haptic_enabled: boolean;
  updated_at?: string;
}

export interface TopPrediction {
  label: string;
  score: number;
}

export interface RoiBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PredictSignResponse {
  detected: boolean;
  hand_found: boolean;
  hands_detected?: number;
  letter: string | null;
  confidence: number;
  top3: TopPrediction[];
  mode: "mock" | "model";
}

export interface CorrectWordResponse {
  raw_word: string;
  corrected_word: string;
}

export interface RefineTextResponse {
  sentence: string;
  refined_text?: string;
  source: "dataset" | "rule" | "llm";
  raw_gloss: string[];
  ai_reply?: string | null;
}

export interface ChatAIResponse {
  refined_text: string;
  ai_reply: string;
}

export interface STTResponse {
  text: string;
  confidence: number;
  warning?: string | null;
}

export type SoundCategory =
  | "emergency"
  | "traffic"
  | "danger"
  | "home"
  | "none";

export type SoundSeverity = "high" | "medium" | "low";

export interface SoundDetectResponse {
  is_alert: boolean;
  detected: boolean;
  category: SoundCategory;
  label_id: string;
  sound_type: string;
  confidence: number;
  severity: SoundSeverity;
  decibel_level: number;
  raw_label?: string | null;
}

export interface TTSBase64Response {
  audio_base64: string;
  mime_type: string;
  voice: string;
}

export const OFFLINE_SYSTEM_CARDS: QuickCard[] = [
  {
    id: -1,
    user_id: null,
    category: "umum",
    title: "Perkenalan Teman Tuli",
    message:
      "Halo, saya Teman Tuli. Mohon berbicara perlahan menghadap saya atau gunakan aplikasi ini untuk membalas.",
    is_pinned: true,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: -2,
    user_id: null,
    category: "darurat",
    title: "Butuh Bantuan Darurat",
    message: "Tolong! Saya dalam keadaan darurat dan membutuhkan bantuan segera.",
    is_pinned: true,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: -3,
    user_id: null,
    category: "kesehatan",
    title: "Antre di Rumah Sakit",
    message:
      "Permisi, saya ingin mendaftar pemeriksaan. Mohon panggil saya dengan melambaikan tangan karena saya tidak bisa mendengar panggilan suara.",
    is_pinned: false,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: -4,
    user_id: null,
    category: "transportasi",
    title: "Tanya Rute / Turun",
    message:
      "Permisi, apakah kendaraan ini melewati tujuan saya? Mohon beri tahu saat sudah dekat.",
    is_pinned: false,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: -5,
    user_id: null,
    category: "transaksi",
    title: "Tanya Harga",
    message:
      "Permisi, berapa total harga belanjaan saya? Mohon tunjukkan angkanya.",
    is_pinned: false,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
  },
];

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const DEFAULT_API_BASE_URL = RENDER_ROUTER_URL;
export const API_BASE_URL = DEFAULT_API_BASE_URL;

export function normalizeBaseUrl(url: string): string {
  return cleanBaseUrl(url);
}

/**
 * Deteksi otomatis IP laptop dari Metro / Expo Go hostUri
 * agar HP langsung mengarah ke http://<IP-LAPTOP>:8000 tanpa hardcode.
 */
export function detectExpoHostServerUrl(port = 8000): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost ||
    null;

  if (!hostUri || typeof hostUri !== "string") return null;

  const cleaned = hostUri.replace(/^https?:\/\//i, "").replace(/^exp:\/\//i, "");
  const host = cleaned.split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return null;
  }
  // Abaikan domain tunnel Expo (*.exp.direct) karena itu bukan port 8000 lokal
  if (host.endsWith(".exp.direct")) {
    return null;
  }
  return `http://${host}:${port}`;
}

export function isLegacyDefaultUrl(url: string | null): boolean {
  if (!url) return true;
  const clean = normalizeBaseUrl(url).toLowerCase();
  return (
    clean === "http://192.168.1.10:8000" ||
    clean === "http://192.168.1.6:8000" ||
    clean === "http://localhost:8000" ||
    clean === "http://127.0.0.1:8000"
  );
}

const RETRYABLE_TUNNEL_STATUSES = new Set([0, 408, 502, 503, 504]);

function isRetryableTunnelError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return RETRYABLE_TUNNEL_STATUSES.has(err.status);
  }
  return true;
}

async function resolveEffectiveBaseUrl(baseUrl?: string): Promise<string> {
  const cleaned = baseUrl ? normalizeBaseUrl(baseUrl) : "";
  if (hasManualBaseUrl()) {
    return cleaned || (await getApiBaseUrl());
  }
  // Jika dalam mode otomatis dan caller mengirim kosong atau URL router default, ambil tunnel aktif
  if (!cleaned || cleaned.toLowerCase() === RENDER_ROUTER_URL.toLowerCase()) {
    return await getApiBaseUrl();
  }
  return cleaned;
}

async function executeSingleRequest<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const { method = "GET", token, body, timeoutMs = 10000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const fullUrl = `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(fullUrl, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail =
        parsed?.detail ||
        (typeof parsed === "string" ? parsed : null) ||
        `Permintaan gagal (HTTP ${response.status})`;
      throw new ApiError(
        typeof detail === "string" ? detail : JSON.stringify(detail),
        response.status
      );
    }

    return parsed as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err?.name === "AbortError") {
      throw new ApiError(
        `Timeout (${Math.round(timeoutMs / 1000)}d) menghubungi ${fullUrl}.`,
        408
      );
    }
    const rawMsg = err?.message ? ` (${err.message})` : "";
    throw new ApiError(
      `Network request failed ke ${normalizeBaseUrl(baseUrl)}${rawMsg}. Pastikan backend & tunnel aktif.`,
      0
    );
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const targetBase = await resolveEffectiveBaseUrl(baseUrl);
  try {
    return await executeSingleRequest<T>(targetBase, path, options);
  } catch (err: any) {
    // Auto-refresh tunnel URL dari Render Router & retry 1x jika mode otomatis dan error jaringan/502/503/504
    if (!hasManualBaseUrl() && isRetryableTunnelError(err)) {
      console.log(
        `[API AUTO-REFRESH] Request ke ${targetBase}${path} gagal (${err?.status ?? "network"}). Mengambil URL tunnel baru dari Render Router...`
      );
      resetCachedBaseUrl();
      const refreshedBase = await getApiBaseUrl(true);
      if (refreshedBase && refreshedBase !== targetBase) {
        return await executeSingleRequest<T>(refreshedBase, path, options);
      }
    }
    throw err;
  }
}

export const api = {
  checkHealth: async (baseUrl?: string): Promise<HealthResponse> => {
    const cleanBase = await resolveEffectiveBaseUrl(baseUrl);
    const primaryUrl = `${cleanBase}/health`;
    console.log(`[HEALTH] Testing: ${primaryUrl}`);
    try {
      return await request<HealthResponse>(cleanBase, "/health", {
        timeoutMs: 10000,
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 404) {
        const fallbackUrl = `${cleanBase}/api/health`;
        console.log(`[HEALTH] 404 on /health, retrying: ${fallbackUrl}`);
        return await request<HealthResponse>(cleanBase, "/api/health", {
          timeoutMs: 10000,
        });
      }
      throw err;
    }
  },

  register: (
    baseUrl: string,
    payload: { full_name: string; email: string; password: string }
  ) =>
    request<AuthTokenResponse>(baseUrl, "/api/auth/register", {
      method: "POST",
      body: payload,
    }),

  login: (baseUrl: string, payload: { email: string; password: string }) =>
    request<AuthTokenResponse>(baseUrl, "/api/auth/login", {
      method: "POST",
      body: payload,
    }),

  getMe: (baseUrl: string, token: string) =>
    request<UserProfile>(baseUrl, "/api/auth/me", { token }),

  getCards: (baseUrl: string, token?: string | null) =>
    request<QuickCard[]>(baseUrl, "/api/cards", { token }),

  createCard: (baseUrl: string, token: string, payload: QuickCardPayload) =>
    request<QuickCard>(baseUrl, "/api/cards", {
      method: "POST",
      token,
      body: payload,
    }),

  updateCard: (
    baseUrl: string,
    token: string,
    cardId: number,
    payload: Partial<QuickCardPayload>
  ) =>
    request<QuickCard>(baseUrl, `/api/cards/${cardId}`, {
      method: "PUT",
      token,
      body: payload,
    }),

  deleteCard: (baseUrl: string, token: string, cardId: number) =>
    request<void>(baseUrl, `/api/cards/${cardId}`, {
      method: "DELETE",
      token,
    }),

  getLogs: (baseUrl: string, token: string, limit = 20) =>
    request<TranslationLog[]>(baseUrl, `/api/logs?limit=${limit}`, { token }),

  createLog: (baseUrl: string, token: string, payload: TranslationLogPayload) =>
    request<TranslationLog>(baseUrl, "/api/logs", {
      method: "POST",
      token,
      body: payload,
    }),

  deleteLog: (baseUrl: string, token: string, logId: number) =>
    request<void>(baseUrl, `/api/logs/${logId}`, {
      method: "DELETE",
      token,
    }),

  getAlerts: (baseUrl: string, token: string, limit = 20) =>
    request<SoundAlert[]>(baseUrl, `/api/alerts?limit=${limit}`, { token }),

  createAlert: (baseUrl: string, token: string, payload: SoundAlertPayload) =>
    request<SoundAlert>(baseUrl, "/api/alerts", {
      method: "POST",
      token,
      body: payload,
    }),

  getSettings: (baseUrl: string, token: string) =>
    request<UserSettings>(baseUrl, "/api/settings", { token }),

  updateSettings: (
    baseUrl: string,
    token: string,
    payload: Partial<UserSettings>
  ) =>
    request<UserSettings>(baseUrl, "/api/settings", {
      method: "PUT",
      token,
      body: payload,
    }),

  predictSignBase64: (
    baseUrl: string,
    imageBase64: string,
    roiBox?: RoiBox | null,
    mirror = false
  ) =>
    request<PredictSignResponse>(baseUrl, "/api/predict-sign", {
      method: "POST",
      body: roiBox
        ? { image_base64: imageBase64, roi_box: roiBox, mirror }
        : { image_base64: imageBase64, mirror },
      timeoutMs: 15000,
    }),

  correctWord: (
    baseUrl: string,
    letters: string[],
    prevWord?: string | null
  ) =>
    request<CorrectWordResponse>(baseUrl, "/api/correct-word", {
      method: "POST",
      body: { letters, prev_word: prevWord ?? null },
    }),

  refineText: (baseUrl: string, gloss: string[], includeReply = false) =>
    request<RefineTextResponse>(baseUrl, "/api/refine-text", {
      method: "POST",
      body: { gloss, include_reply: includeReply },
      timeoutMs: 15000,
    }),

  chatAI: (baseUrl: string, text: string) =>
    request<ChatAIResponse>(baseUrl, "/api/chat-ai", {
      method: "POST",
      body: { text },
      timeoutMs: 12000,
    }),

  transcribeAudio: async (
    baseUrl: string,
    fileUri: string,
    filename = "recording.m4a"
  ): Promise<STTResponse> => {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || ("size" in info && typeof info.size === "number" && info.size === 0)) {
      throw new ApiError(
        "File rekaman audio kosong atau tidak ditemukan di HP. Coba rekam ulang.",
        400
      );
    }

    const mimeType = filename.endsWith(".wav")
      ? "audio/wav"
      : filename.endsWith(".3gp")
      ? "audio/3gpp"
      : "audio/mp4";

    const runUpload = async (targetBase: string): Promise<STTResponse> => {
      const endpoint = `${normalizeBaseUrl(targetBase)}/api/stt`;
      const uploadPromise = FileSystem.uploadAsync(endpoint, fileUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType,
        headers: {
          Accept: "application/json",
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ApiError(
                "Upload & transkripsi audio timeout (>35d). Coba rekaman lebih singkat.",
                408
              )
            ),
          35000
        )
      );

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      console.log(
        `[STT UPLOAD] HTTP ${result.status} -> ${result.body?.slice(0, 200)}`
      );

      let parsed: any = null;
      try {
        parsed = result.body ? JSON.parse(result.body) : null;
      } catch {
        parsed = null;
      }

      if (result.status < 200 || result.status >= 300) {
        const detail =
          parsed?.detail ||
          result.body ||
          `Transkripsi gagal (HTTP ${result.status})`;
        throw new ApiError(
          typeof detail === "string" ? detail : JSON.stringify(detail),
          result.status
        );
      }

      return parsed as STTResponse;
    };

    const initialBase = await resolveEffectiveBaseUrl(baseUrl);
    try {
      return await runUpload(initialBase);
    } catch (err: any) {
      if (!hasManualBaseUrl() && isRetryableTunnelError(err)) {
        resetCachedBaseUrl();
        const refreshedBase = await getApiBaseUrl(true);
        if (refreshedBase && refreshedBase !== initialBase) {
          return await runUpload(refreshedBase);
        }
      }
      if (err instanceof ApiError) throw err;
      const raw = err?.message ? ` (${err.message})` : "";
      throw new ApiError(
        `Server STT tidak terjangkau di ${initialBase}${raw}. Pastikan backend & tunnel aktif.`,
        0
      );
    }
  },

  detectSoundPattern: async (
    baseUrl: string,
    fileUri: string
  ): Promise<SoundDetectResponse> => {
    const runUpload = async (targetBase: string): Promise<SoundDetectResponse> => {
      const endpoint = `${normalizeBaseUrl(targetBase)}/api/classify-sound`;
      const result = await FileSystem.uploadAsync(endpoint, fileUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: "audio/mp4",
        headers: { Accept: "application/json" },
      });

      if (result.status < 200 || result.status >= 300) {
        throw new ApiError(
          `Deteksi pola suara gagal (HTTP ${result.status})`,
          result.status
        );
      }
      return JSON.parse(result.body) as SoundDetectResponse;
    };

    const initialBase = await resolveEffectiveBaseUrl(baseUrl);
    try {
      return await runUpload(initialBase);
    } catch (err: any) {
      if (!hasManualBaseUrl() && isRetryableTunnelError(err)) {
        resetCachedBaseUrl();
        const refreshedBase = await getApiBaseUrl(true);
        if (refreshedBase && refreshedBase !== initialBase) {
          return await runUpload(refreshedBase);
        }
      }
      throw err;
    }
  },

  synthesizeSpeechBase64: (
    baseUrl: string,
    text: string,
    voice: Exclude<TTSVoiceOption, "device">,
    speaker: "deaf" | "hearing" = "deaf",
    rate = 1.0
  ) =>
    request<TTSBase64Response>(baseUrl, "/api/tts", {
      method: "POST",
      body: { text, voice, speaker, rate, format: "base64" },
      timeoutMs: 12000,
    }),
};
