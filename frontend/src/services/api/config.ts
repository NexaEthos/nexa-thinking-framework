declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || 
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost");
}

function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (isTauri()) {
    return "http://localhost:8000";
  }
  return "";
}

export const IS_TAURI = isTauri();
export const API_BASE_URL = getApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;

export function getWsUrl(): string {
  if (isTauri()) {
    return "ws://localhost:8000/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

let backendReady = !IS_TAURI;
let backendReadyPromise: Promise<void> | null = null;

export function isBackendReady(): boolean {
  return backendReady;
}

export async function waitForBackend(): Promise<void> {
  if (backendReady) return;
  
  if (backendReadyPromise) return backendReadyPromise;
  
  backendReadyPromise = new Promise((resolve) => {
    const maxAttempts = 30;
    const delayMs = 500;
    let attempts = 0;
    
    const checkBackend = async () => {
      attempts++;
      try {
        const response = await fetch(`${API_URL}/settings/llm`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          backendReady = true;
          resolve();
          return;
        }
      } catch {
        // Backend not ready yet
      }
      
      if (attempts < maxAttempts) {
        setTimeout(checkBackend, delayMs);
      } else {
        backendReady = true;
        resolve();
      }
    };
    
    setTimeout(checkBackend, 1000);
  });
  
  return backendReadyPromise;
}
