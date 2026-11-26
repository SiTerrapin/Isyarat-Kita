import AsyncStorage from "@react-native-async-storage/async-storage";

export const RENDER_ROUTER_URL = "https://isyarat-kita.onrender.com";

const MANUAL_URL_STORAGE_KEY = "@isyarat_kita:manual_server_url";
const ROUTER_FETCH_TIMEOUT_MS = 25000;

let manualOverrideUrl: string | null = null;
let manualUrlLoaded = false;
let cachedTunnelUrl: string | null = null;
let inFlightRouterFetch: Promise<string> | null = null;

type UrlListener = (url: string) => void;
const urlListeners = new Set<UrlListener>();

function notifyListeners(url: string) {
  urlListeners.forEach((fn) => {
    try {
      fn(url);
    } catch {
      // Abaikan error listener individual
    }
  });
}

export function cleanBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\s+/g, "")
    .replace(/\/+$/, "")
    .replace(/\/(api\/)?health$/i, "");
}

export function subscribeApiBaseUrl(listener: UrlListener): () => void {
  urlListeners.add(listener);
  return () => {
    urlListeners.delete(listener);
  };
}

export function hasManualBaseUrl(): boolean {
  return Boolean(manualOverrideUrl);
}

export async function getManualBaseUrl(): Promise<string | null> {
  if (manualUrlLoaded) {
    return manualOverrideUrl;
  }
  try {
    const saved = await AsyncStorage.getItem(MANUAL_URL_STORAGE_KEY);
    const cleaned = saved ? cleanBaseUrl(saved) : "";
    manualOverrideUrl =
      cleaned && /^https?:\/\//i.test(cleaned) ? cleaned : null;
  } catch {
    manualOverrideUrl = null;
  } finally {
    manualUrlLoaded = true;
  }
  return manualOverrideUrl;
}

/**
 * Set manual override URL (misal http://192.168.1.6:8000 atau link trycloudflare.com manual).
 * Kirim `null` atau string kosong untuk kembali ke mode otomatis (Render Router).
 */
export async function setManualBaseUrl(
  url: string | null
): Promise<string | null> {
  const cleaned = url ? cleanBaseUrl(url) : "";
  if (!cleaned || cleaned.toLowerCase() === RENDER_ROUTER_URL.toLowerCase()) {
    manualOverrideUrl = null;
    manualUrlLoaded = true;
    try {
      await AsyncStorage.removeItem(MANUAL_URL_STORAGE_KEY);
    } catch {
      // Abaikan error storage
    }
    return null;
  }

  manualOverrideUrl = cleaned;
  manualUrlLoaded = true;
  try {
    await AsyncStorage.setItem(MANUAL_URL_STORAGE_KEY, cleaned);
  } catch {
    // Abaikan error storage
  }
  notifyListeners(cleaned);
  return cleaned;
}

export function resetCachedBaseUrl(): void {
  cachedTunnelUrl = null;
}

async function fetchTunnelUrlFromRouter(): Promise<string> {
  if (inFlightRouterFetch) {
    return inFlightRouterFetch;
  }

  inFlightRouterFetch = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROUTER_FETCH_TIMEOUT_MS);
    const endpoint = `${RENDER_ROUTER_URL}/get-url`;
    try {
      console.log(`[API CONFIG] Mengambil URL tunnel terbaru dari ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Render Router HTTP ${res.status}`);
      }
      const data = await res.json();
      const rawUrl =
        typeof data?.tunnel_url === "string"
          ? data.tunnel_url
          : typeof data?.url === "string"
          ? data.url
          : "";
      const cleaned = cleanBaseUrl(rawUrl);
      if (!cleaned || !/^https?:\/\//i.test(cleaned)) {
        throw new Error("Render Router belum memiliki tunnel_url aktif.");
      }
      cachedTunnelUrl = cleaned;
      console.log(`[API CONFIG] URL tunnel aktif: ${cleaned}`);
      notifyListeners(cleaned);
      return cleaned;
    } catch (err: any) {
      console.warn(
        `[API CONFIG] Gagal ambil tunnel_url dari Render Router (${err?.message || err}).`
      );
      if (cachedTunnelUrl) {
        return cachedTunnelUrl;
      }
      return RENDER_ROUTER_URL;
    } finally {
      clearTimeout(timer);
      inFlightRouterFetch = null;
    }
  })();

  return inFlightRouterFetch;
}

/**
 * Resolusi URL backend dengan prioritas:
 * 1. Manual Override URL (AsyncStorage / state config)
 * 2. Cached Tunnel URL dari Render Router
 * 3. Auto-Fetch GET https://isyarat-kita.onrender.com/get-url
 */
export async function getApiBaseUrl(forceRefresh = false): Promise<string> {
  const manual = await getManualBaseUrl();
  if (manual) {
    return manual;
  }

  if (cachedTunnelUrl && !forceRefresh) {
    return cachedTunnelUrl;
  }

  return fetchTunnelUrlFromRouter();
}
