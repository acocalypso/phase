import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bundled: vi.fn(),
  desktop: vi.fn(),
  getVersion: vi.fn(),
  serviceWorker: vi.fn(),
  tauri: vi.fn(),
  tauriUpdate: vi.fn(),
}));

vi.mock("../../../services/platform", () => ({
  isBundledTauriOrigin: mocks.bundled,
  isDesktopTauri: mocks.desktop,
  isTauri: mocks.tauri,
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("../../../pwa/registerServiceWorker", () => ({
  checkForServiceWorkerUpdate: mocks.serviceWorker,
}));
vi.mock("../../../pwa/tauriUpdater", () => ({ checkForTauriUpdate: mocks.tauriUpdate }));
vi.mock("../../../hooks/useCardDataMeta", () => ({
  useCardDataMeta: () => null,
  formatRelativeDate: () => "today",
}));
vi.mock("../../../pwa/updateMarker", () => ({ consumeRecentAutoUpdateMarker: () => false }));
vi.mock("../../../pwa/updateStatus", () => ({
  useUpdateStatus: () => "idle",
  useDownloadProgress: () => 0,
  useUpdateError: () => null,
  getUpdateDebugReport: () => "",
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { BuildBadge } from "../BuildBadge";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tauri.mockReturnValue(true);
  mocks.desktop.mockReturnValue(false);
  mocks.bundled.mockReturnValue(true);
});

afterEach(cleanup);

it("does not import app version or dispatch update paths on Android/iOS", () => {
  render(<BuildBadge compact />);
  fireEvent.click(screen.getByRole("button", { name: "buildBadge.checkForUpdates" }));
  expect(mocks.getVersion).not.toHaveBeenCalled();
  expect(mocks.tauriUpdate).not.toHaveBeenCalled();
  expect(mocks.serviceWorker).not.toHaveBeenCalled();
});

it("retains desktop app-version and updater reachability", async () => {
  mocks.desktop.mockReturnValue(true);
  mocks.bundled.mockReturnValue(false);
  mocks.getVersion.mockResolvedValue("0.60.0");
  render(<BuildBadge compact />);
  await waitFor(() => expect(mocks.getVersion).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "buildBadge.checkForUpdates" }));
  expect(mocks.tauriUpdate).toHaveBeenCalledOnce();
  expect(mocks.serviceWorker).toHaveBeenCalledOnce();
});
