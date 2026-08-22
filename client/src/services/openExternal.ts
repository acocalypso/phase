import { isOpenableExternalUrl } from "./externalLinks";
import { isTauri } from "./platform";

/** Open a validated HTTP(S) URL in the user's default browser. */
export function openExternal(url: string): void {
  if (!isOpenableExternalUrl(url)) return;

  if (isTauri()) {
    void import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch((err: unknown) => {
        console.warn("[phase.rs] Failed to open external URL via Tauri opener.", err);
      });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
