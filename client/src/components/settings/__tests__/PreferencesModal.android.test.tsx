import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopMock } = vi.hoisted(() => ({ desktopMock: vi.fn() }));
vi.mock("../../../services/platform.ts", () => ({ isDesktopTauri: desktopMock }));
vi.mock("../../../services/backup", () => ({
  downloadBackup: vi.fn(),
  importBackupFromFile: vi.fn(),
}));

import { usePreferencesStore } from "../../../stores/preferencesStore";
import { PreferencesModal } from "../PreferencesModal";

beforeEach(() => {
  desktopMock.mockReset();
  usePreferencesStore.setState({ nativeEngineEnabled: false });
});
afterEach(cleanup);

describe("PreferencesModal native engine preference", () => {
  it("renders and updates the preference on desktop", () => {
    desktopMock.mockReturnValue(true);
    render(<PreferencesModal onClose={vi.fn()} initialTab="gameplay" />);
    const checkbox = screen.getByRole("checkbox", { name: /native engine/i });
    fireEvent.click(checkbox);
    expect(usePreferencesStore.getState().nativeEngineEnabled).toBe(true);
  });

  it("omits the preference on Android", () => {
    desktopMock.mockReturnValue(false);
    render(<PreferencesModal onClose={vi.fn()} initialTab="gameplay" />);
    expect(screen.queryByRole("checkbox", { name: /native engine/i })).not.toBeInTheDocument();
    expect(usePreferencesStore.getState().nativeEngineEnabled).toBe(false);
  });
});
