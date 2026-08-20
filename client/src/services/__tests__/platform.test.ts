import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const originalLocation = window.location;

function setLocation(protocol: string, hostname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, protocol, hostname },
    writable: true,
  });
}

function setTauri(enabled: boolean): void {
  if (enabled) {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
  } else {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  }
}

async function freshPlatform() {
  vi.resetModules();
  return import("../platform");
}

beforeEach(() => {
  invokeMock.mockReset();
  setTauri(false);
});

afterEach(() => {
  setTauri(false);
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
    writable: true,
  });
});

describe("Tauri host platform", () => {
  it("leaves a plain browser outside every Tauri class without IPC", async () => {
    const platform = await freshPlatform();
    await platform.initializeTauriHostPlatform();
    expect(platform.isTauri()).toBe(false);
    expect(platform.isDesktopTauri()).toBe(false);
    expect(platform.isMobileTauri()).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["desktop", true, false],
    ["android", false, true],
    ["ios", false, true],
  ] as const)("strictly decodes %s", async (value, desktop, mobile) => {
    setTauri(true);
    invokeMock.mockResolvedValue(value);
    const platform = await freshPlatform();
    await platform.initializeTauriHostPlatform();
    expect(invokeMock).toHaveBeenCalledWith("host_platform");
    expect(platform.isDesktopTauri()).toBe(desktop);
    expect(platform.isMobileTauri()).toBe(mobile);
  });

  it.each(["future-console", { platform: "desktop" }])(
    "fails closed for a successfully returned hostile value",
    async (value) => {
      setTauri(true);
      invokeMock.mockResolvedValue(value);
      const platform = await freshPlatform();
      await platform.initializeTauriHostPlatform();
      expect(platform.isDesktopTauri()).toBe(false);
      expect(platform.isMobileTauri()).toBe(false);
    },
  );

  it.each([
    ["Mozilla/5.0 (Windows NT 10.0)", true, false],
    ["Mozilla/5.0 (Linux; Android 14)", false, true],
  ] as const)("uses the old-shell fallback after rejection for %s", async (ua, desktop, mobile) => {
    setTauri(true);
    vi.stubGlobal("navigator", { userAgent: ua });
    invokeMock.mockRejectedValue(new Error("unknown command"));
    const platform = await freshPlatform();
    await platform.initializeTauriHostPlatform();
    expect(platform.isDesktopTauri()).toBe(desktop);
    expect(platform.isMobileTauri()).toBe(mobile);
  });
});

describe("isBundledTauriOrigin", () => {
  it("distinguishes web and both bundled Tauri origins", async () => {
    const platform = await freshPlatform();
    setLocation("https:", "phase-rs.dev");
    expect(platform.isBundledTauriOrigin()).toBe(false);
    setLocation("tauri:", "localhost");
    expect(platform.isBundledTauriOrigin()).toBe(true);
    setLocation("http:", "tauri.localhost");
    expect(platform.isBundledTauriOrigin()).toBe(true);
  });
});
