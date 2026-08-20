import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tauri: vi.fn(),
  desktop: vi.fn(),
  bundled: vi.fn(),
  tauriUpdate: vi.fn(),
  serviceWorkerUpdate: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock("../../../services/platform", () => ({
  isTauri: mocks.tauri,
  isDesktopTauri: mocks.desktop,
  isBundledTauriOrigin: mocks.bundled,
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("../../../hooks/useCardDataMeta", () => ({
  useCardDataMeta: () => null,
  formatRelativeDate: vi.fn(),
}));
vi.mock("../../../pwa/registerServiceWorker", () => ({
  checkForServiceWorkerUpdate: mocks.serviceWorkerUpdate,
}));
vi.mock("../../../pwa/tauriUpdater", () => ({ checkForTauriUpdate: mocks.tauriUpdate }));
vi.mock("../../../pwa/updateMarker", () => ({ consumeRecentAutoUpdateMarker: () => false }));
vi.mock("../../../pwa/updateStatus", () => ({
  useUpdateStatus: () => "idle",
  useDownloadProgress: () => 0,
  useUpdateError: () => null,
  getUpdateDebugReport: () => "",
}));

import { BuildBadge } from "../BuildBadge";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVersion.mockResolvedValue("1.2.3-shell");
  mocks.tauri.mockReturnValue(true);
});
afterEach(cleanup);

describe("BuildBadge Android routing", () => {
  it("keeps the remote-shell badge and uses the web updater on Android", async () => {
    mocks.desktop.mockReturnValue(false);
    mocks.bundled.mockReturnValue(false);
    render(<BuildBadge inline />);
    await vi.waitFor(() => expect(mocks.getVersion).toHaveBeenCalledOnce());
    expect(await screen.findByText(/1\.2\.3-shell/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /check for updates/i }));
    expect(mocks.tauriUpdate).not.toHaveBeenCalled();
    expect(mocks.serviceWorkerUpdate).toHaveBeenCalledOnce();
  });

  it("dispatches only the Tauri updater from a bundled desktop shell", () => {
    mocks.desktop.mockReturnValue(true);
    mocks.bundled.mockReturnValue(true);
    render(<BuildBadge inline />);
    fireEvent.click(screen.getByRole("button", { name: /check for updates/i }));
    expect(mocks.tauriUpdate).toHaveBeenCalledOnce();
    expect(mocks.serviceWorkerUpdate).not.toHaveBeenCalled();
  });
});
