// External link routing for Tauri. A capture-phase document handler covers
// nested content in existing and future anchors while preserving first-party
// navigation inside remote-origin shells.

import { isBundledTauriOrigin, isTauri } from "./platform";

const FIRST_PARTY_ORIGINS = new Set([
  "https://phase-rs.dev",
  "https://app.phase-rs.dev",
  "https://preview.phase-rs.dev",
]);

let handlerInstalled = false;

/** The single URL authority for document and direct external-link routing. */
export function isOpenableExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function openWithOpener(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export function installTauriExternalLinkHandler(): void {
  if (!isTauri() || handlerInstalled) return;
  handlerInstalled = true;

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (!isOpenableExternalUrl(href)) {
        event.preventDefault();
        return;
      }
      if (!isBundledTauriOrigin() && FIRST_PARTY_ORIGINS.has(new URL(href).origin)) return;

      event.preventDefault();
      void openWithOpener(href).catch((err: unknown) => {
        console.warn("[phase.rs] Failed to open external link via Tauri opener.", err);
      });
    },
    { capture: true },
  );
}
