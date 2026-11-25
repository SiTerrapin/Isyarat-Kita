import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "nativewind";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  api,
  DEFAULT_API_BASE_URL,
  detectExpoHostServerUrl,
  HealthResponse,
  isLegacyDefaultUrl,
  normalizeBaseUrl,
  OFFLINE_SYSTEM_CARDS,
  QuickCard,
  QuickCardPayload,
  SoundAlert,
  SoundAlertPayload,
  TranslationLog,
  TranslationLogPayload,
  UserProfile,
  UserSettings,
} from "@/services/api";

const STORAGE_KEYS = {
  SERVER_URL: "@isyarat_kita:server_url",
  AUTH_TOKEN: "@isyarat_kita:auth_token",
  USER_PROFILE: "@isyarat_kita:user_profile",
  USER_SETTINGS: "@isyarat_kita:user_settings",
  THEME_MODE: "@isyarat_kita:theme_mode",
};

export type ThemeMode = "light" | "dark" | "system";

const FALLBACK_SERVER_URL = DEFAULT_API_BASE_URL;

const DEFAULT_SETTINGS: UserSettings = {
  alert_threshold_db: 75,
  tts_speech_rate: 1.0,
  tts_voice: "id-ID-ArdiNeural",
  auto_detect_sign: true,
  haptic_enabled: true,
};

export type ServerStatus = "checking" | "connected" | "disconnected";

interface AppContextValue {
  isHydrated: boolean;
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  serverUrl: string;
  detectedHostUrl: string | null;
  serverStatus: ServerStatus;
  healthInfo: HealthResponse | null;
  lastHealthError: string | null;
  authToken: string | null;
  user: UserProfile | null;
  isLoggedIn: boolean;
  settings: UserSettings;
  cards: QuickCard[];
  isOfflineCards: boolean;
  recentLogs: TranslationLog[];
  recentAlerts: SoundAlert[];
  authModalVisible: boolean;
  authModalReason: string;
  openAuthModal: (reason?: string, onAuthenticated?: () => void) => void;
  closeAuthModal: () => void;
  requireAuth: (reason: string, action: () => void) => void;
  updateServerUrl: (newUrl: string) => Promise<boolean>;
  autoDetectServerUrl: () => Promise<string | null>;
  refreshHealth: (overrideUrl?: string, silent?: boolean) => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCards: () => Promise<void>;
  addCustomCard: (payload: QuickCardPayload) => Promise<QuickCard>;
  editCustomCard: (
    cardId: number,
    payload: Partial<QuickCardPayload>
  ) => Promise<QuickCard>;
  removeCustomCard: (cardId: number) => Promise<void>;
  refreshLogs: () => Promise<void>;
  saveTranslationLog: (payload: TranslationLogPayload) => Promise<TranslationLog>;
  addLocalGuestLog: (payload: TranslationLogPayload) => TranslationLog;
  refreshAlerts: () => Promise<void>;
  recordSoundAlert: (payload: SoundAlertPayload) => Promise<SoundAlert>;
  saveSettings: (
    partial: Partial<UserSettings>,
    syncToServer?: boolean
  ) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const isDark = colorScheme === "dark";

  const detectedHostUrl = detectExpoHostServerUrl(8000);
  const [isHydrated, setIsHydrated] = useState(false);
  const [serverUrl, setServerUrlState] = useState(FALLBACK_SERVER_URL);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [lastHealthError, setLastHealthError] = useState<string | null>(null);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const [cards, setCards] = useState<QuickCard[]>(OFFLINE_SYSTEM_CARDS);
  const [isOfflineCards, setIsOfflineCards] = useState(false);
  const [recentLogs, setRecentLogs] = useState<TranslationLog[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<SoundAlert[]>([]);

  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authModalReason, setAuthModalReason] = useState("");
  const pendingActionRef = useRef<(() => void) | null>(null);

  const isLoggedIn = Boolean(authToken && user);

  const refreshHealth = useCallback(
    async (overrideUrl?: string, silent = false): Promise<boolean> => {
      const targetUrl = normalizeBaseUrl(overrideUrl ?? serverUrl);
      if (!silent) {
        setServerStatus("checking");
      }
      try {
        const res = await api.checkHealth(targetUrl);
        setHealthInfo(res);
        setLastHealthError(null);
        const ok = res.status === "ok";
        setServerStatus(ok ? "connected" : "disconnected");
        return ok;
      } catch (err: any) {
        setHealthInfo(null);
        setLastHealthError(
          err?.message || "Tidak dapat terhubung ke server backend."
        );
        setServerStatus("disconnected");
        return false;
      }
    },
    [serverUrl]
  );

  const refreshCardsWith = useCallback(
    async (url: string, token: string | null) => {
      try {
        const list = await api.getCards(url, token);
        setCards(list);
        setIsOfflineCards(false);
      } catch {
        setCards((prev) => (prev.length > 0 ? prev : OFFLINE_SYSTEM_CARDS));
        setIsOfflineCards(true);
      }
    },
    []
  );

  const refreshLogsWith = useCallback(async (url: string, token: string | null) => {
    if (!token) return;
    try {
      const list = await api.getLogs(url, token, 15);
      setRecentLogs(list);
    } catch {
      // Abaikan jika server sedang offline
    }
  }, []);

  const refreshAlertsWith = useCallback(
    async (url: string, token: string | null) => {
      if (!token) return;
      try {
        const list = await api.getAlerts(url, token, 20);
        setRecentAlerts(list);
      } catch {
        // Abaikan jika server sedang offline
      }
    },
    []
  );

  // Hydrate AsyncStorage pada saat aplikasi pertama kali dibuka (langsung masuk Home / Guest Mode)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [savedUrl, savedToken, savedUserRaw, savedSettingsRaw, savedTheme] =
          await AsyncStorage.multiGet([
            STORAGE_KEYS.SERVER_URL,
            STORAGE_KEYS.AUTH_TOKEN,
            STORAGE_KEYS.USER_PROFILE,
            STORAGE_KEYS.USER_SETTINGS,
            STORAGE_KEYS.THEME_MODE,
          ]);

        const resolvedTheme = (savedTheme[1] as ThemeMode) || "light";
        if (active) {
          setThemeModeState(resolvedTheme);
          setColorScheme(resolvedTheme);
        }

        const storedUrl = savedUrl[1] ? normalizeBaseUrl(savedUrl[1]) : null;
        // Gunakan URL produksi default (https://isyarat-kita.onrender.com) bila belum ada URL kustom atau masih URL lokal lama
        const resolvedUrl =
          storedUrl && !isLegacyDefaultUrl(storedUrl)
            ? storedUrl
            : FALLBACK_SERVER_URL;
        const resolvedToken = savedToken[1] || null;
        const resolvedUser: UserProfile | null = savedUserRaw[1]
          ? JSON.parse(savedUserRaw[1])
          : null;
        const resolvedSettings: UserSettings = savedSettingsRaw[1]
          ? { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettingsRaw[1]) }
          : DEFAULT_SETTINGS;

        if (!active) return;

        setServerUrlState(resolvedUrl);
        setAuthToken(resolvedToken);
        setUser(resolvedUser);
        setSettings(resolvedSettings);
        setIsHydrated(true);

        // Cek health & muat data awal secara paralel
        refreshHealth(resolvedUrl);
        refreshCardsWith(resolvedUrl, resolvedToken);
        if (resolvedToken) {
          refreshLogsWith(resolvedUrl, resolvedToken);
          refreshAlertsWith(resolvedUrl, resolvedToken);
          api
            .getSettings(resolvedUrl, resolvedToken)
            .then((remote) => {
              if (!active) return;
              setSettings(remote);
              AsyncStorage.setItem(
                STORAGE_KEYS.USER_SETTINGS,
                JSON.stringify(remote)
              );
            })
            .catch(() => {});
        }
      } catch {
        if (active) setIsHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshHealth, refreshCardsWith, refreshLogsWith, refreshAlertsWith]);

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      setThemeModeState(mode);
      setColorScheme(mode);
      await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
    },
    [setColorScheme]
  );

  const openAuthModal = useCallback(
    (reason = "Masuk untuk menyimpan kartu kustom dan riwayat Anda.", onAuthenticated?: () => void) => {
      setAuthModalReason(reason);
      pendingActionRef.current = onAuthenticated ?? null;
      setAuthModalVisible(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setAuthModalVisible(false);
    pendingActionRef.current = null;
  }, []);

  const requireAuth = useCallback(
    (reason: string, action: () => void) => {
      if (authToken && user) {
        action();
      } else {
        openAuthModal(reason, action);
      }
    },
    [authToken, user, openAuthModal]
  );

  const updateServerUrl = useCallback(
    async (newUrl: string): Promise<boolean> => {
      const clean = normalizeBaseUrl(newUrl);
      setServerUrlState(clean);
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, clean);
      const ok = await refreshHealth(clean);
      if (ok) {
        refreshCardsWith(clean, authToken);
        if (authToken) {
          refreshLogsWith(clean, authToken);
          refreshAlertsWith(clean, authToken);
        }
      }
      return ok;
    },
    [authToken, refreshHealth, refreshCardsWith, refreshLogsWith, refreshAlertsWith]
  );

  const autoDetectServerUrl = useCallback(async (): Promise<string | null> => {
    const detected = detectExpoHostServerUrl(8000);
    if (!detected) return null;
    await updateServerUrl(detected);
    return detected;
  }, [updateServerUrl]);

  // Polling health ringan tiap 25 detik (silent agar tidak berkedip)
  useEffect(() => {
    if (!isHydrated) return;
    const timer = setInterval(() => {
      refreshHealth(undefined, true);
    }, 25000);
    return () => clearInterval(timer);
  }, [isHydrated, refreshHealth]);

  const handleAuthSuccess = useCallback(
    async (token: string, profile: UserProfile) => {
      setAuthToken(token);
      setUser(profile);
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.AUTH_TOKEN, token],
        [STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile)],
      ]);

      setAuthModalVisible(false);
      const callback = pendingActionRef.current;
      pendingActionRef.current = null;

      refreshCardsWith(serverUrl, token);
      refreshLogsWith(serverUrl, token);
      refreshAlertsWith(serverUrl, token);
      api
        .getSettings(serverUrl, token)
        .then((remote) => {
          setSettings(remote);
          AsyncStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(remote));
        })
        .catch(() => {});

      if (callback) {
        setTimeout(() => callback(), 150);
      }
    },
    [serverUrl, refreshCardsWith, refreshLogsWith, refreshAlertsWith]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(serverUrl, { email, password });
      await handleAuthSuccess(res.access_token, res.user);
    },
    [serverUrl, handleAuthSuccess]
  );

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      const res = await api.register(serverUrl, {
        full_name: fullName,
        email,
        password,
      });
      await handleAuthSuccess(res.access_token, res.user);
    },
    [serverUrl, handleAuthSuccess]
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setRecentLogs([]);
    setRecentAlerts([]);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      STORAGE_KEYS.USER_PROFILE,
    ]);
    refreshCardsWith(serverUrl, null);
  }, [serverUrl, refreshCardsWith]);

  const refreshCards = useCallback(
    () => refreshCardsWith(serverUrl, authToken),
    [serverUrl, authToken, refreshCardsWith]
  );

  const addCustomCard = useCallback(
    async (payload: QuickCardPayload): Promise<QuickCard> => {
      if (!authToken) throw new Error("Login diperlukan.");
      const created = await api.createCard(serverUrl, authToken, payload);
      setCards((prev) => [created, ...prev]);
      return created;
    },
    [serverUrl, authToken]
  );

  const editCustomCard = useCallback(
    async (
      cardId: number,
      payload: Partial<QuickCardPayload>
    ): Promise<QuickCard> => {
      if (!authToken) throw new Error("Login diperlukan.");
      const updated = await api.updateCard(serverUrl, authToken, cardId, payload);
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      return updated;
    },
    [serverUrl, authToken]
  );

  const removeCustomCard = useCallback(
    async (cardId: number): Promise<void> => {
      if (!authToken) throw new Error("Login diperlukan.");
      await api.deleteCard(serverUrl, authToken, cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    },
    [serverUrl, authToken]
  );

  const refreshLogs = useCallback(
    () => refreshLogsWith(serverUrl, authToken),
    [serverUrl, authToken, refreshLogsWith]
  );

  const addLocalGuestLog = useCallback((payload: TranslationLogPayload) => {
    const localItem: TranslationLog = {
      id: Date.now(),
      mode: payload.mode,
      raw_gloss: payload.raw_gloss ?? null,
      final_text: payload.final_text,
      confidence: payload.confidence ?? null,
      created_at: new Date().toISOString(),
      is_local: true,
    };
    setRecentLogs((prev) => [localItem, ...prev].slice(0, 20));
    return localItem;
  }, []);

  const saveTranslationLog = useCallback(
    async (payload: TranslationLogPayload): Promise<TranslationLog> => {
      if (!authToken) {
        return addLocalGuestLog(payload);
      }
      const created = await api.createLog(serverUrl, authToken, payload);
      setRecentLogs((prev) => [created, ...prev.filter((l) => !l.is_local || l.final_text !== created.final_text)].slice(0, 20));
      return created;
    },
    [serverUrl, authToken, addLocalGuestLog]
  );

  const refreshAlerts = useCallback(
    () => refreshAlertsWith(serverUrl, authToken),
    [serverUrl, authToken, refreshAlertsWith]
  );

  const recordSoundAlert = useCallback(
    async (payload: SoundAlertPayload): Promise<SoundAlert> => {
      if (!authToken) {
        const localItem: SoundAlert = {
          id: Date.now(),
          sound_type: payload.sound_type,
          decibel_level: payload.decibel_level,
          severity: payload.severity,
          created_at: new Date().toISOString(),
          is_local: true,
        };
        setRecentAlerts((prev) => [localItem, ...prev].slice(0, 20));
        return localItem;
      }
      try {
        const created = await api.createAlert(serverUrl, authToken, payload);
        setRecentAlerts((prev) => [created, ...prev].slice(0, 20));
        return created;
      } catch {
        const fallbackItem: SoundAlert = {
          id: Date.now(),
          sound_type: payload.sound_type,
          decibel_level: payload.decibel_level,
          severity: payload.severity,
          created_at: new Date().toISOString(),
          is_local: true,
        };
        setRecentAlerts((prev) => [fallbackItem, ...prev].slice(0, 20));
        return fallbackItem;
      }
    },
    [serverUrl, authToken]
  );

  const saveSettings = useCallback(
    async (partial: Partial<UserSettings>, syncToServer = true) => {
      const merged: UserSettings = { ...settings, ...partial };
      setSettings(merged);
      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_SETTINGS,
        JSON.stringify(merged)
      );

      if (syncToServer && authToken) {
        try {
          const remote = await api.updateSettings(serverUrl, authToken, partial);
          setSettings(remote);
          await AsyncStorage.setItem(
            STORAGE_KEYS.USER_SETTINGS,
            JSON.stringify(remote)
          );
        } catch {
          // Pengaturan lokal tetap tersimpan meski offline
        }
      }
    },
    [settings, authToken, serverUrl]
  );

  return (
    <AppContext.Provider
      value={{
        isHydrated,
        themeMode,
        isDark,
        setThemeMode,
        serverUrl,
        detectedHostUrl,
        serverStatus,
        healthInfo,
        lastHealthError,
        authToken,
        user,
        isLoggedIn,
        settings,
        cards,
        isOfflineCards,
        recentLogs,
        recentAlerts,
        authModalVisible,
        authModalReason,
        openAuthModal,
        closeAuthModal,
        requireAuth,
        updateServerUrl,
        autoDetectServerUrl,
        refreshHealth,
        login,
        register,
        logout,
        refreshCards,
        addCustomCard,
        editCustomCard,
        removeCustomCard,
        refreshLogs,
        saveTranslationLog,
        addLocalGuestLog,
        refreshAlerts,
        recordSoundAlert,
        saveSettings,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp harus digunakan di dalam AppProvider.");
  }
  return ctx;
}
