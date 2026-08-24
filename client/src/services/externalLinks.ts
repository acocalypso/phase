// Tauri webviews silently swallow target=_blank links, so one capture-phase
// handler covers nested content in every current and future anchor without
// per-callsite handlers. Modifier clicks intentionally follow the same path:
// "open in new tab" has no useful meaning inside a webview. Relative app links
// remain with the router; explicit non-HTTP(S) schemes and protocol-relative
// URLs are denied before they can reach the shell.

import { isOpenableExternalUrl } from "./openExternal";
import { isBundledTauriOrigin, isTauri } from "./platform";

const FIRST_PARTY_ORIGINS = new Set([
  "https://phase-rs.dev",
  "https://app.phase-rs.dev",
  "https://preview.phase-rs.dev",
]);

let handlerInstalled = false;

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

      // React Router renders in-app navigation as ordinary relative anchors.
      // Leave those (including query/hash-only links) to its bubble-phase
      // handler. Protocol-relative URLs are external, not app routes, and must
      // fail closed instead of inheriting the bundled origin's HTTP scheme.
      const hasScheme = /^[A-Za-z][A-Za-z\d+.-]*:/.test(href);
      if (!hasScheme && !href.startsWith("//")) return;
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
