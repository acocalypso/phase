import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), check: vi.fn() }));
vi.mock("../../services/platform", () => ({ isDesktopTauri: mocks.desktop }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("Tauri updater platform routing", () => {
  it("does not import, initialize, or dispatch the updater on Android", async () => {
    mocks.desktop.mockReturnValue(false);
    const updater = await import("../tauriUpdater");
    updater.registerTauriUpdater();
    expect(updater.checkForTauriUpdate()).toBe(false);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("retains desktop startup and manual update checks", async () => {
    mocks.desktop.mockReturnValue(true);
    mocks.check.mockResolvedValue(null);
    const updater = await import("../tauriUpdater");
    updater.registerTauriUpdater();
    await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(updater.checkForTauriUpdate()).toBe(true);
    await vi.waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(2));
  });
});
