/** Check whether we are running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type HostPlatform = "desktop" | "android" | "ios";

let platform: HostPlatform | null = null;
let platformSettled = false;
let platformPromise: Promise<HostPlatform | null> | null = null;

function isHostPlatform(value: unknown): value is HostPlatform {
  return value === "desktop" || value === "android" || value === "ios";
}

function isMissingHostPlatformCommand(error: unknown): boolean {
  return error === "Command host_platform not found";
}

function hasProvenDesktopUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  if (/Android|Mobile|iPhone|iPad|iPod/i.test(userAgent)) return false;
  if (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1) return false;
  return /Windows NT|Macintosh; Intel Mac OS X|X11; (?:Linux|Ubuntu)|Linux x86_64/i.test(
    userAgent,
  );
}

/**
 * Resolve the shell platform exactly once, before any platform-sensitive code
 * is allowed to run. Unknown results fail closed. The legacy fallback exists
 * only for pre-command desktop shells whose error and user agent are both
 * unambiguous.
 */
export function initializeHostPlatform(): Promise<HostPlatform | null> {
  if (platformPromise) return platformPromise;

  platformPromise = (async () => {
    if (!isTauri()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<unknown>("host_platform");
      return isHostPlatform(result) ? result : null;
    } catch (error) {
      return isMissingHostPlatformCommand(error) && hasProvenDesktopUserAgent()
        ? "desktop"
        : null;
    }
  })().then((result) => {
    platform = result;
    platformSettled = true;
    return result;
  });

  return platformPromise;
}

export function isDesktopTauri(): boolean {
  return platformSettled && platform === "desktop" && isTauri();
}

export function isAndroidTauri(): boolean {
  return platformSettled && platform === "android" && isTauri();
}

export function isIosTauri(): boolean {
  return platformSettled && platform === "ios" && isTauri();
}

/** Whether the app is served from Tauri's bundled custom origin. */
export function isBundledTauriOrigin(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost")
  );
}
