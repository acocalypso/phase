import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ desktop: vi.fn(), exit: vi.fn(), warm: vi.fn() }));
vi.mock("../../services/platform", () => ({ isDesktopTauri: mocks.desktop }));
vi.mock("@tauri-apps/plugin-process", () => ({ exit: mocks.exit }));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../audio/useAudioContext", () => ({ useAudioContext: vi.fn() }));
vi.mock("../../components/chrome/PreviewBadge", () => ({ PreviewBadge: () => null }));
vi.mock("../../components/menu/LoadGameStateModal", () => ({ LoadGameStateModal: () => null }));
vi.mock("../../components/menu/home/HomeDashboard", () => ({ HomeDashboard: () => null }));
vi.mock("../../services/aiDeckCatalog", () => ({ buildLegalAiDeckCatalog: vi.fn() }));
vi.mock("../../stores/gameStore", () => ({
  saveActiveGame: vi.fn(),
  saveGame: vi.fn(),
  useGameStore: { setState: vi.fn() },
}));
vi.mock("../../stores/cardDataStore", () => {
  const useCardDataStore = Object.assign(
    (selector: (state: { status: string }) => unknown) => selector({ status: "idle" }),
    { getState: () => ({ warm: mocks.warm }) },
  );
  return { useCardDataStore };
});
vi.mock("../../stores/preferencesStore", () => ({
  usePreferencesStore: (selector: (state: { lastFormat: null; lastMatchType: null }) => unknown) =>
    selector({ lastFormat: null, lastMatchType: null }),
}));

import { MenuPage } from "../MenuPage";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MenuPage host controls", () => {
  it("renders and executes Exit on desktop", async () => {
    mocks.desktop.mockReturnValue(true);
    render(<MenuPage />);
    fireEvent.click(screen.getByRole("button", { name: /exit/i }));
    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(0));
  });

  it("omits Exit on Android without calling the process API", () => {
    mocks.desktop.mockReturnValue(false);
    render(<MenuPage />);
    expect(screen.queryByRole("button", { name: /exit/i })).not.toBeInTheDocument();
    expect(mocks.exit).not.toHaveBeenCalled();
  });
});
