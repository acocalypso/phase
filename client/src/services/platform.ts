/** Check whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type TauriHostPlatform = "desktop" | "android" | "ios";
type HostPlatformState = TauriHostPlatform | "unknown";

let hostPlatform: HostPlatformState = "unknown";
let initialization: Promise<void> | null = null;

function decodeHostPlatform(value: unknown): TauriHostPlatform | null {
  return value === "desktop" || value === "android" || value === "ios" ? value : null;
}

function legacyHostPlatform(): TauriHostPlatform {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  return "desktop";
}

/** Bind the separately deployed frontend to the native shell before consumers run. */
export function initializeTauriHostPlatform(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  if (initialization) return initialization;

  initialization = (async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      hostPlatform = decodeHostPlatform(await invoke<unknown>("host_platform")) ?? "unknown";
    } catch {
      // Older shells do not expose host_platform. Fail closed on mobile while
      // retaining their established desktop behavior.
      hostPlatform = legacyHostPlatform();
    }
  })();
  return initialization;
}

export function isDesktopTauri(): boolean {
  return isTauri() && hostPlatform === "desktop";
}

export function isMobileTauri(): boolean {
  return isTauri() && (hostPlatform === "android" || hostPlatform === "ios");
}

/** Whether the app is served from Tauri's bundled custom origin. */
export function isBundledTauriOrigin(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost")
  );
}
